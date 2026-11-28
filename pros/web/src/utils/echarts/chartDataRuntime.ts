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
import { fetchChartData } from './chartDataFetch'
import { getToken } from '../../api/http'

// 保留原模块的公共导出，既有调用方无需感知网络实现已经拆分。
export {
  DEFAULT_CHART_REQUEST_TIMEOUT_MS,
  DEFAULT_CHART_RESPONSE_MAX_BYTES,
  fetchChartData,
} from './chartDataFetch'
export type { FetchChartDataOptions } from './chartDataFetch'

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

/**
 * 可注入的页面可见性机制。测试无需篡改全局 document，宿主也可接入自己的生命周期。
 * subscribe 必须返回取消订阅函数，stop 时会一并释放。
 */
export type ChartVisibilitySource = {
  isHidden: () => boolean
  subscribe: (listener: () => void) => () => void
}

function browserChartVisibility(): ChartVisibilitySource {
  return {
    isHidden: () => typeof document !== 'undefined' && document.hidden,
    subscribe: listener => {
      if (typeof document === 'undefined') return () => undefined
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
  }
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
  /** 单轮请求总超时，默认 15 秒。 */
  requestTimeoutMs?: number
  /** 响应体 UTF-8 字节上限，默认 5MiB。 */
  maxResponseBytes?: number
  /** 页面可见性来源；隐藏时暂停并中止，恢复时立即刷新一次。 */
  visibility?: ChartVisibilitySource
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
    requestTimeoutMs,
    maxResponseBytes,
    visibility = browserChartVisibility(),
  } = options
  let stopped = false
  let hidden = visibility.isHidden()
  let timer: ReturnType<typeof setTimeout> | null = null
  let activeController: AbortController | null = null
  let activePromise: Promise<Record<string, unknown> | null> | null = null
  // 每次新请求、停止或隐藏都会推进代次；旧请求即使无视取消并迟到，也无法通过校验。
  let requestVersion = 0

  const clearScheduledRefresh = () => {
    if (timer !== null) clearTimeoutImpl(timer)
    timer = null
  }

  const startRefresh = (force = false): Promise<Record<string, unknown> | null> => {
    if (stopped || hidden || !config.enabled || !config.url) return Promise.resolve(null)
    // 手动重复 refresh 复用在途 Promise；定时器仍在 finally 后调度，避免常规轮询重叠。
    if (activePromise && !force) return activePromise
    // 页面恢复要求立即发新请求：旧请求先失效并被中止，不必等待一个无视 signal 的实现返回。
    if (activePromise) activeController?.abort()

    const controller = new AbortController()
    const version = ++requestVersion
    activeController = controller
    const promise = (async (): Promise<Record<string, unknown> | null> => {
      try {
        const request = resolveChartDataRequest(config, chartId, sessionToken())
        const payload = await fetchChartData(request, fetchImpl, {
          signal: controller.signal,
          timeoutMs: requestTimeoutMs,
          maxResponseBytes,
          setTimeoutImpl,
          clearTimeoutImpl,
        })
        if (stopped || hidden || controller.signal.aborted || version !== requestVersion) return null
        const merged = mergeChartDataIntoOption(option(), payload, config)
        onOption(merged)
        return merged
      } catch (err) {
        // 主动停止、隐藏和被新请求取代都属于取消，不应把 AbortError 当成接口故障提示。
        if (!stopped && !hidden && !controller.signal.aborted && version === requestVersion) {
          onError?.(err instanceof Error ? err.message : String(err))
        }
        return null
      }
    })()
    activePromise = promise
    void promise.finally(() => {
      // 旧请求的 finally 不能清掉恢复后新请求的控制器与 Promise。
      if (activePromise === promise) {
        activePromise = null
        activeController = null
      }
    })
    return promise
  }

  const refresh = () => startRefresh(false)
  const schedule = () => {
    if (stopped || hidden || timer !== null || activePromise) return
    const seconds = config.refreshInterval
    if (!seconds || seconds <= 0) return
    timer = setTimeoutImpl(() => {
      timer = null
      void startRefresh(false).finally(schedule)
    }, Math.max(1, seconds) * 1000)
  }

  const onVisibilityChange = () => {
    if (stopped) return
    const nextHidden = visibility.isHidden()
    if (nextHidden === hidden) return
    hidden = nextHidden
    if (hidden) {
      // 隐藏不仅清定时器，也使当前响应失效并中止网络，后台标签页不再消耗接口配额。
      requestVersion += 1
      clearScheduledRefresh()
      activeController?.abort()
      return
    }
    // 恢复可见时不等待原刷新间隔，立即刷新一次；完成后再恢复正常 finally 调度。
    void startRefresh(true).finally(schedule)
  }
  const unsubscribeVisibility = visibility.subscribe(onVisibilityChange)
  void startRefresh(false).finally(schedule)

  return {
    stop() {
      if (stopped) return
      stopped = true
      requestVersion += 1
      clearScheduledRefresh()
      activeController?.abort()
      unsubscribeVisibility()
    },
    refresh,
  }
}
