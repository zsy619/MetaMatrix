const TOKEN_KEY = 'metamatrix:auth:token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number
  code?: string
  body?: unknown
  requestId?: string

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

type RequestOpts = {
  method?: string
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
  cache?: RequestCache
  timeoutMs?: number
  retry?: number
  /** 默认按 JSON 解析；下载备份时直接读取 Blob，避免再拼接整份 JSON 字符串。 */
  responseType?: 'json' | 'blob'
}

/**
 * 401 后的会话刷新结果。
 * unavailable 表示断网/超时/5xx 等暂时故障，HTTP 层不得据此清除会话。
 */
export type UnauthorizedRefreshResult = 'refreshed' | 'invalid' | 'unavailable'
type UnauthorizedRefreshHandler = () => Promise<UnauthorizedRefreshResult>

// 由 auth store 注册，HTTP 层保持零静态依赖，避免 http ↔ auth 循环导入。
let unauthorizedRefreshHandler: UnauthorizedRefreshHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedRefreshHandler | null): () => void {
  unauthorizedRefreshHandler = handler
  // 返回只注销本次注册的函数，避免旧 Pinia 作用域销毁时误清新的 auth store。
  return () => {
    if (unauthorizedRefreshHandler === handler) unauthorizedRefreshHandler = null
  }
}

/** 只有服务端最终明确拒绝会话时才走全局登出；网络错误不会调用这里。 */
function invalidateSession(): void {
  setToken(null)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('metamatrix:auth:logout'))
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'

export type ApiResult<T> = {
  data: T
  headers: Headers
  status: number
}

function withTimeout(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
  const onAbort = () => ctrl.abort(parent?.reason)
  parent?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
  }
}

function shouldRetry(status: number, error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') return true
  if (error instanceof TypeError) return true
  return status === 502 || status === 503 || status === 504
}

async function performWithRetries(
  path: string,
  opts: RequestOpts,
  serializedBody: string | undefined,
): Promise<ApiResult<unknown>> {
  const method = (opts.method || 'GET').toUpperCase()
  const retries = opts.retry ?? (method === 'GET' ? 1 : 0)
  const timeoutMs = opts.timeoutMs ?? 20_000
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) {
      throw opts.signal.reason instanceof Error
        ? opts.signal.reason
        : new DOMException('aborted', 'AbortError')
    }
    const timed = withTimeout(opts.signal, timeoutMs)
    try {
      return await performOnce(path, opts, serializedBody, timed.signal)
    } catch (error) {
      timed.cancel()
      lastError = error
      const status = error instanceof ApiError ? error.status : 0
      const callerAborted = opts.signal?.aborted && !(error instanceof DOMException && error.name === 'TimeoutError')
      if (callerAborted || attempt >= retries || !shouldRetry(status, error)) throw error
    } finally {
      timed.cancel()
    }
  }
  throw lastError
}

async function performRequest(path: string, opts: RequestOpts = {}): Promise<ApiResult<unknown>> {
  // JSON 只序列化一次：自动重试和 401 重放必须发送逐字节相同的 body，
  // 否则响应式对象在两次尝试之间被编辑时，同一个 operationId 会对应不同内容。
  const serializedBody = opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  const useAuth = opts.auth !== false
  let authReplayed = false

  while (true) {
    try {
      return await performWithRetries(path, opts, serializedBody)
    } catch (error) {
      const unauthorized = useAuth && error instanceof ApiError && error.status === 401
      if (!unauthorized) throw error

      // refresh 本身不能再次触发刷新；普通请求刷新后也只允许重放一次。
      if (path === '/auth/refresh' || authReplayed) {
        invalidateSession()
        throw error
      }
      authReplayed = true

      const refresh = unauthorizedRefreshHandler
      if (!refresh) {
        invalidateSession()
        throw error
      }

      let outcome: UnauthorizedRefreshResult
      try {
        outcome = await refresh()
      } catch {
        // 刷新处理器异常不能掩盖原请求，也不能被误当成服务端签发的登出凭据。
        outcome = 'unavailable'
      }
      if (outcome === 'refreshed') continue
      if (outcome === 'invalid' && getToken()) invalidateSession()
      throw error
    }
  }
}

async function performOnce(
  path: string,
  opts: RequestOpts,
  serializedBody: string | undefined,
  signal: AbortSignal,
): Promise<ApiResult<unknown>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': crypto.randomUUID(),
  }
  if (serializedBody !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const useAuth = opts.auth !== false
  if (useAuth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: serializedBody,
    signal,
    cache: opts.cache,
  })

  if (res.status === 204) {
    return { data: undefined, headers: res.headers, status: res.status }
  }

  let data: unknown = null
  if (opts.responseType === 'blob' && res.ok) {
    // 只有成功响应走 Blob；失败响应仍按统一 JSON 错误契约解析，
    // 这样 401 刷新、409 冲突和服务端错误消息都不会因下载分支而失效。
    data = await res.blob()
  } else {
    const text = await res.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }
  }

  if (!res.ok) {
    const obj = (data || {}) as { message?: string; code?: string; requestId?: string }
    const err = new ApiError(
      res.status,
      obj.message || res.statusText || 'request failed',
      obj.code,
      data,
    )
    if (obj.requestId) err.requestId = obj.requestId
    throw err
  }

  return { data, headers: res.headers, status: res.status }
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const res = await performRequest(path, opts)
  return res.data as T
}

export async function apiRequestResult<T = unknown>(
  path: string,
  opts: RequestOpts = {},
): Promise<ApiResult<T>> {
  const res = await performRequest(path, opts)
  return { data: res.data as T, headers: res.headers, status: res.status }
}

/** 下载成功时保留原始字节流；认证、超时、重试和错误解析仍复用统一 HTTP 管线。 */
export async function apiRequestBlob(
  path: string,
  opts: RequestOpts = {},
): Promise<ApiResult<Blob>> {
  const res = await performRequest(path, { ...opts, responseType: 'blob' })
  return { data: res.data as Blob, headers: res.headers, status: res.status }
}
