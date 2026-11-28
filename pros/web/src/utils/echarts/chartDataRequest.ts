/**
 * 数据接口的请求构造（纯函数，便于单测）。
 *
 * 与配置读写（chartDataSource.ts）、响应映射（chartDataMapping.ts）分开，
 * 保证每个文件都在 300 行以内。
 */
import type { ChartDataSourceConfig, ChartDataSourceMethod } from './chartDataSource'

/** 构造好的请求。 */
export type ChartDataSourceRequest = {
  url: string
  method: ChartDataSourceMethod
  headers: Record<string, string>
  body: string | null
}

/**
 * 本系统 API 的地址前缀，与 api/http.ts 保持同一来源。
 */
function apiBase(): string {
  return ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').trim()
}

/**
 * 判断一个数据源 URL 是否允许携带本系统 JWT。
 *
 * 这是凭据边界，不是功能限制：文档里的图表配置可以来自导入文件，
 * 如果任意 URL 都能拿到 session token，打开一篇文档就可能把登录态
 * 发给第三方。规则：
 *   - 相对路径视为本站请求，允许；
 *   - 绝对地址的 origin 必须等于 API Base 的 origin 或页面自身 origin；
 *   - 协议相对地址（//host）按页面协议解析后再比较；
 *   - 其它协议（file:、data: 等）一律拒绝。
 */
export function isTrustedSessionUrl(raw: string): boolean {
  const url = raw.trim()
  if (!url) return false

  // 站内相对路径，例如 /api/charts 或 charts/data。
  // 注意 data:、mailto: 这类也带 scheme，必须进入后面的协议校验而不是当相对路径。
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
  const protocolRelative = url.startsWith('//')
  if (!hasScheme && !protocolRelative) return true

  let resolved: URL
  try {
    if (url.startsWith('//')) {
      if (typeof window === 'undefined') return false
      resolved = new URL(`${window.location.protocol}${url}`)
    } else {
      resolved = new URL(url)
    }
  } catch {
    return false
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return false

  const allowed = new Set<string>()
  const base = apiBase()
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(base)) {
    try {
      allowed.add(new URL(base).origin)
    } catch {
      /* 配置坏掉时不放行绝对地址 */
    }
  }
  if (typeof window !== 'undefined') allowed.add(window.location.origin)
  return allowed.has(resolved.origin)
}

/**
 * 按配置构造请求。
 *
 * @param secret 自定义鉴权的密钥（Header 键值 / Bearer Token），由 chartSecret 提供。
 * @param sessionToken 读取本系统登录态时的 token（来自 api/http.ts 的 getToken()）。
 */
export function buildDataSourceRequest(
  config: ChartDataSourceConfig,
  secrets: { headers?: Record<string, string>; bearerToken?: string } = {},
  sessionToken: string | null = null,
): ChartDataSourceRequest {
  const headers: Record<string, string> = { Accept: 'application/json' }
  for (const item of config.headers) {
    if (!item.key) continue
    headers[item.key] = item.value
  }
  if (config.auth === 'custom') {
    if (config.useHeaders) {
      for (const [key, value] of Object.entries(secrets.headers || {})) {
        if (key && value) headers[key] = value
      }
    }
    if (config.bearerToken && secrets.bearerToken) {
      headers.Authorization = `Bearer ${secrets.bearerToken}`
    }
  }
  // 只有本系统 API 才允许附带登录态；外部地址即使配置成 session 也不外发 JWT。
  if (config.auth === 'session' && sessionToken && isTrustedSessionUrl(config.url)) {
    headers.Authorization = `Bearer ${sessionToken}`
  }

  let url = config.url
  if (config.method === 'GET' && config.params.trim()) {
    const query = buildQueryString(config.params)
    if (query) url += (url.includes('?') ? '&' : '?') + query
  }
  const body = config.method === 'POST' && config.body.trim() ? config.body : null
  if (body) headers['Content-Type'] = 'application/json'
  return { url, method: config.method, headers, body }
}

/** 把 JSON 文本的参数转成 query string。解析失败就原样拼上。 */
export function buildQueryString(params: string): string {
  const text = params.trim()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return text
    const usp = new URLSearchParams()
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key) continue
      usp.append(key, value == null ? '' : String(value))
    }
    return usp.toString()
  } catch {
    return text.startsWith('?') ? text.slice(1) : text
  }
}
