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
  if (config.auth === 'session' && sessionToken) {
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
