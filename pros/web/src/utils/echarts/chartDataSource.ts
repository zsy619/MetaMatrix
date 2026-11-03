/**
 * 图表的数据接口配置（DataSource）——类型与配置读写。
 *
 * 配置随图表块属性持久化（echartsBlock 的 dataSource 属性），但**不包含明文密钥**：
 * - 鉴权「读取本系统登录态」直接复用 api/http.ts 的 token 存储与请求封装；
 * - 鉴权「自定义」的头部值 / Token 存在浏览器本地（见 utils/echarts/chartSecret.ts），
 *   不会写进文档，也不会出现在导出的 HTML 明文里。
 *
 * 同一能力的另外两半：
 * - 请求构造：utils/echarts/chartDataRequest.ts
 * - 响应映射：utils/echarts/chartDataMapping.ts
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
