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

async function performRequest(path: string, opts: RequestOpts = {}): Promise<ApiResult<unknown>> {
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
      return await performOnce(path, opts, timed.signal)
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

async function performOnce(path: string, opts: RequestOpts, signal: AbortSignal): Promise<ApiResult<unknown>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': crypto.randomUUID(),
  }
  if (opts.body !== undefined) {
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
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal,
    cache: opts.cache,
  })

  if (res.status === 204) {
    return { data: undefined, headers: res.headers, status: res.status }
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }

  if (res.status === 401 && useAuth) {
    setToken(null)
    window.dispatchEvent(new CustomEvent('metamatrix:auth:logout'))
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
