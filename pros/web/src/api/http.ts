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
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
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
    signal: opts.signal,
    cache: opts.cache,
  })

  if (res.status === 204) {
    return undefined as T
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
    const obj = (data || {}) as { message?: string; code?: string }
    throw new ApiError(
      res.status,
      obj.message || res.statusText || 'request failed',
      obj.code,
      data,
    )
  }

  return data as T
}
