/**
 * 图表的数据接口配置（DataSource）。
 *
 * 配置随图表块属性持久化（echartsBlock 的 dataSource 属性），但**不包含明文密钥**：
 * - 鉴权「读取本系统登录态」直接复用 api/http.ts 的 token 存储与请求封装；
 * - 鉴权「自定义」的头部值 / Token 存在浏览器本地（见 utils/echarts/chartSecret.ts），
 *   不会写进文档，也不会出现在导出的 HTML 明文里。
 */

/** 鉴权方式。 */
export type ChartDataSourceAuth = 'none' | 'custom' | 'session'

/** 请求方式。 */
export type ChartDataSourceMethod = 'GET' | 'POST'

/** 自定义请求头（值里不放密钥，密钥走 chartSecret）。 */
export type ChartDataSourceHeader = {
  key: string
  value: string
}

/** 响应 → 图表数据的字段映射。 */
export type ChartDataSourceMapping = {
  /** 响应里取数组的路径（点号，如 'data.list'）。空表示响应本身是数组。 */
  listPath: string
  /** 类目（X 轴 / 名称）字段名。 */
  categoryField: string
  /** 数值字段名。 */
  valueField: string
  /** 响应里每条记录映射成一个系列时，系列名字段名。 */
  seriesField: string
}

/** 数据接口配置。 */
export type ChartDataSourceConfig = {
  /** 是否启用自动拉取。 */
  enabled: boolean
  /** 请求地址。 */
  url: string
  /** 请求方式。 */
  method: ChartDataSourceMethod
  /** GET 的 query 参数（JSON 对象文本）。 */
  params: string
  /** POST 的请求体（JSON 文本）。 */
  body: string
  /** 额外请求头。 */
  headers: ChartDataSourceHeader[]
  /** 鉴权方式。 */
  auth: ChartDataSourceAuth
  /** 自定义鉴权：Bearer Token（明文不入库，见 chartSecret）。 */
  bearerToken: boolean
  /** 自定义鉴权：使用 Header 键值对。 */
  useHeaders: boolean
  /** 刷新间隔（秒）。0 表示不自动刷新。 */
  refreshInterval: number
  /** 字段映射。 */
  mapping: ChartDataSourceMapping
}

/** 默认（空）配置。 */
export function createEmptyDataSourceConfig(): ChartDataSourceConfig {
  return {
    enabled: false,
    url: '',
    method: 'GET',
    params: '',
    body: '',
    headers: [],
    auth: 'none',
    bearerToken: false,
    useHeaders: false,
    refreshInterval: 0,
    mapping: {
      listPath: '',
      categoryField: '',
      valueField: '',
      seriesField: '',
    },
  }
}

/** 归一化任意输入（来自文档属性 / 表单）。 */
export function normalizeDataSourceConfig(raw: unknown): ChartDataSourceConfig {
  const base = createEmptyDataSourceConfig()
  if (!raw || typeof raw !== 'object') return base
  const src = raw as Record<string, unknown>
  const mappingRaw = (src.mapping || {}) as Record<string, unknown>
  const headersRaw = Array.isArray(src.headers) ? src.headers : []
  const headers: ChartDataSourceHeader[] = headersRaw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      key: String(item.key ?? '').trim(),
      value: String(item.value ?? ''),
    }))
    .filter((item) => !!item.key)
  const auth = src.auth === 'custom' || src.auth === 'session' ? src.auth : 'none'
  const method = String(src.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'
  const interval = Number(src.refreshInterval)
  return {
    enabled: src.enabled === true,
    url: String(src.url ?? '').trim(),
    method,
    params: String(src.params ?? ''),
    body: String(src.body ?? ''),
    headers,
    auth,
    bearerToken: src.bearerToken === true,
    useHeaders: src.useHeaders === true,
    refreshInterval: Number.isFinite(interval) && interval > 0 ? Math.min(interval, 86400) : 0,
    mapping: {
      listPath: String(mappingRaw.listPath ?? '').trim(),
      categoryField: String(mappingRaw.categoryField ?? '').trim(),
      valueField: String(mappingRaw.valueField ?? '').trim(),
      seriesField: String(mappingRaw.seriesField ?? '').trim(),
    },
  }
}

/** 序列化成字符串（存进图表块属性）。 */
export function serializeDataSourceConfig(config: ChartDataSourceConfig): string {
  return JSON.stringify(config)
}

/** 从字符串解析（读图表块属性）。 */
export function parseDataSourceConfig(raw: unknown): ChartDataSourceConfig {
  if (typeof raw !== 'string' || !raw.trim()) return createEmptyDataSourceConfig()
  try {
    return normalizeDataSourceConfig(JSON.parse(raw))
  } catch {
    return createEmptyDataSourceConfig()
  }
}

/** 构造好的请求（纯函数，便于单测）。 */
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

/** 按路径取数组。 */
export function pickList(payload: unknown, listPath: string): unknown[] {
  const path = listPath.trim()
  let current: unknown = payload
  if (path) {
    for (const segment of path.split('.')) {
      if (!segment) continue
      if (Array.isArray(current)) {
        const index = Number(segment)
        if (!Number.isInteger(index)) return []
        current = current[index]
        continue
      }
      if (!current || typeof current !== 'object') return []
      current = (current as Record<string, unknown>)[segment]
    }
  }
  return Array.isArray(current) ? current : []
}

/** 映射后的图表数据。 */
export type MappedChartData = {
  /** 类目（X 轴）。 */
  categories: string[]
  /** 每个系列一条数据。 */
  series: Array<{ name: string; data: number[] }>
}

/**
 * 把接口响应映射成图表数据。
 *
 * - seriesField 有值：响应每条记录一个系列（字段名 → 系列名）；
 * - 否则：整体作为一个系列，categoryField → 类目，valueField → 数值。
 */
export function mapResponseToChartData(
  payload: unknown,
  mapping: ChartDataSourceMapping,
): MappedChartData {
  const list = pickList(payload, mapping.listPath)
  const categoryField = mapping.categoryField.trim()
  const valueField = mapping.valueField.trim()
  const seriesField = mapping.seriesField.trim()

  if (seriesField) {
    const groups = new Map<string, { categories: string[]; data: number[] }>()
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const name = String(row[seriesField] ?? '').trim() || '系列'
      const group = groups.get(name) || { categories: [], data: [] }
      group.categories.push(
        categoryField ? String(row[categoryField] ?? '') : String(group.categories.length + 1),
      )
      const rawValue = valueField ? row[valueField] : undefined
      group.data.push(toFiniteNumber(rawValue))
      groups.set(name, group)
    }
    const entries = Array.from(groups.entries())
    const series = entries.map(([name, group]) => ({
      name,
      data: group.data,
    }))
    const categories = entries[0]?.[1].categories || []
    return { categories, series }
  }

  const categories: string[] = []
  const data: number[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    categories.push(categoryField ? String(row[categoryField] ?? '') : String(data.length + 1))
    data.push(toFiniteNumber(valueField ? row[valueField] : undefined))
  }
  return { categories, series: [{ name: '数据', data }] }
}

function toFiniteNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}

/** 把映射结果写回 option（类目写 xAxis.data，数值写 series.data）。 */
export function applyMappedDataToOption(
  option: Record<string, unknown>,
  mapped: MappedChartData,
): Record<string, unknown> {
  const next = { ...option }
  if (mapped.categories.length) {
    const xAxis = next.xAxis
    if (Array.isArray(xAxis) && xAxis.length) {
      next.xAxis = xAxis.map((item, index) =>
        index === 0 && item && typeof item === 'object'
          ? { ...(item as Record<string, unknown>), data: mapped.categories }
          : item,
      )
    } else if (xAxis && typeof xAxis === 'object') {
      next.xAxis = { ...(xAxis as Record<string, unknown>), data: mapped.categories }
    }
  }
  const series = next.series
  if (Array.isArray(series) && series.length) {
    next.series = series.map((item, index) => {
      const target = mapped.series[index] || mapped.series[0]
      if (!item || typeof item !== 'object' || !target) return item
      return { ...(item as Record<string, unknown>), data: [...target.data] }
    })
  }
  return next
}
