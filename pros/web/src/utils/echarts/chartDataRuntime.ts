/**
 * 图表数据接口的运行时：把接口响应拉下来并映射进 ECharts option。
 *
 * 职责边界：
 * - 配置怎么存：utils/echarts/chartDataSource.ts（纯函数，便于单测）；
 * - 密钥放哪：utils/echarts/chartSecret.ts（只存本机，不进文档 / 导出 HTML）；
 * - 这里只做「发请求 → 映射 → 合并进 option → 按间隔刷新」。
 *
 * 鉴权：
 * - none：不带鉴权头；
 * - custom：用本机保存的 Header / Bearer Token；
 * - session：复用系统登录态的 token（api/http.ts 的 getToken），不另存一份。
 */
import {
  parseDataSourceConfig,
  type ChartDataSourceConfig,
} from './chartDataSource'
import { buildDataSourceRequest, type ChartDataSourceRequest } from './chartDataRequest'
import { applyMappedDataToOption, mapResponseToChartData } from './chartDataMapping'
import { readChartSecret } from './chartSecret'
import { getToken } from '../../api/http'

/** 取当前系统登录态的 token（没有登录就是 null）。 */
export type SessionTokenReader = () => string | null

/** 默认的登录态读取（直接用系统 token 存储）。 */
export function defaultSessionTokenReader(): string | null {
  try {
    return getToken()
  } catch {
    return null
  }
}

/** 按配置 + 本机密钥 + 登录态构造请求。 */
export function resolveChartDataRequest(
  config: ChartDataSourceConfig,
  chartId: string,
  sessionToken: string | null = null,
): ChartDataSourceRequest {
  const secret = chartId ? readChartSecret(chartId) : { bearerToken: '', headers: {} }
  return buildDataSourceRequest(config, secret, sessionToken)
}

/** 从图表块属性里的 dataSource 文本解析配置。 */
export function resolveDataSourceConfig(raw: unknown): ChartDataSourceConfig {
  return parseDataSourceConfig(raw)
}

/** 拉取接口数据（返回原始响应体）。 */
export async function fetchChartData(
  request: ChartDataSourceRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  }
  if (request.body) init.body = request.body
  const response = await fetchImpl(request.url, init)
  if (!response.ok) {
    throw new Error(`接口请求失败：HTTP ${response.status}`)
  }
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('接口响应不是合法 JSON')
  }
}

/**
 * 把响应映射进 option。
 *
 * - option 里用了 dataset：把响应里的数组原样写进 dataset[0].source；
 * - 否则：按类目 / 数值字段写进 xAxis.data 与 series[].data。
 */
export function mergeChartDataIntoOption(
  option: Record<string, unknown>,
  payload: unknown,
  config: ChartDataSourceConfig,
): Record<string, unknown> {
  const next = { ...option }
  const dataset = next.dataset
  if (Array.isArray(dataset) && dataset.length) {
    const first = dataset[0]
    if (first && typeof first === 'object') {
      const rows = Array.isArray(payload)
        ? payload
        : (payload as { data?: unknown[] } | null)?.data
      next.dataset = [
        { ...(first as Record<string, unknown>), source: Array.isArray(rows) ? rows : [] },
        ...dataset.slice(1),
      ]
      return next
    }
  }
  const mapped = mapResponseToChartData(payload, config.mapping)
  return applyMappedDataToOption(next, mapped)
}

/** 轮询句柄。 */
export type ChartDataPoller = {
  /** 停止刷新。 */
  stop: () => void
  /** 立刻拉一次（返回合并后的 option）。 */
  refresh: () => Promise<Record<string, unknown> | null>
}

/** 轮询参数。 */
export type StartChartDataPollingOptions = {
  /** 图表块当前 option（拉到的数据会合并进它）。 */
  option: () => Record<string, unknown>
  /** 数据接口配置。 */
  config: ChartDataSourceConfig
  /** 图表块 id（用于取本机保存的密钥）。 */
  chartId: string
  /** 拉到的数据 → 新的 option。 */
  onOption: (option: Record<string, unknown>) => void
  /** 出错时的提示。 */
  onError?: (message: string) => void
  /** 登录态 token 读取（默认读系统 token）。 */
  sessionToken?: SessionTokenReader
  /** 注入的 fetch（测试用）。 */
  fetchImpl?: typeof fetch
  /** 定时器（测试用）。 */
  setTimeoutImpl?: typeof setTimeout
  /** 清除定时器（测试用）。 */
  clearTimeoutImpl?: typeof clearTimeout
}

/**
 * 按配置拉数据，并按刷新间隔重复拉取。
 *
 * 刷新间隔为 0 时只拉一次。
 */
export function startChartDataPolling(options: StartChartDataPollingOptions): ChartDataPoller {
  const {
    option,
    config,
    chartId,
    onOption,
    onError,
    sessionToken = defaultSessionTokenReader,
    fetchImpl,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = options
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const refresh = async (): Promise<Record<string, unknown> | null> => {
    if (stopped || !config.enabled || !config.url) return null
    try {
      const request = resolveChartDataRequest(config, chartId, sessionToken())
      const payload = await fetchChartData(request, fetchImpl)
      if (stopped) return null
      const merged = mergeChartDataIntoOption(option(), payload, config)
      onOption(merged)
      return merged
    } catch (err) {
      if (!stopped) {
        onError?.(err instanceof Error ? err.message : String(err))
      }
      return null
    }
  }

  const schedule = () => {
    if (stopped) return
    const seconds = config.refreshInterval
    if (!seconds || seconds <= 0) return
    timer = setTimeoutImpl(() => {
      timer = null
      void refresh().finally(schedule)
    }, Math.max(1, seconds) * 1000)
  }

  void refresh().finally(schedule)

  return {
    stop() {
      stopped = true
      if (timer) clearTimeoutImpl(timer)
      timer = null
    },
    refresh,
  }
}
