/**
 * 图表外部数据请求的网络边界。
 *
 * 该模块只负责「取消、超时、限制响应字节、解析 JSON」，不负责轮询和 option 合并。
 * 独立拆分后，底层流式读取可以集中测试，chartDataRuntime 则专注请求代次与页面生命周期。
 */
import type { ChartDataSourceRequest } from './chartDataRequest'

/** 单次请求默认 15 秒超时；超时只影响本轮，轮询的 finally 调度仍会安排下一轮。 */
export const DEFAULT_CHART_REQUEST_TIMEOUT_MS = 15_000
/** 默认最多解析 5MiB 响应，避免异常接口把大段非图表数据塞进主线程与内存。 */
export const DEFAULT_CHART_RESPONSE_MAX_BYTES = 5 * 1024 * 1024

export type FetchChartDataOptions = {
  /** 外部停止 / 页面隐藏信号。 */
  signal?: AbortSignal
  /** 从发起请求到响应体读取完成的总超时；设为 0 可关闭。 */
  timeoutMs?: number
  /** 按 UTF-8 字节计算的响应体上限。 */
  maxResponseBytes?: number
  /** 与轮询共用可注入定时器，便于测试和宿主控制调度。 */
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
}

function createChartAbortError(): Error {
  const error = new Error('图表数据请求已取消')
  error.name = 'AbortError'
  return error
}

function createResponseSizeError(maxResponseBytes: number): Error {
  return new Error(`接口响应超过 ${maxResponseBytes} 字节大小上限，已拒绝解析`)
}

/**
 * 优先通过 Content-Length 与流式读取限制字节数；旧测试或轻量 fetch 实现只有 text()
 * 时，仍会在文本返回后用 UTF-8 字节数复核，不能用 JavaScript 字符数代替字节数。
 */
async function readChartResponseText(response: Response, maxResponseBytes: number): Promise<string> {
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw createResponseSizeError(maxResponseBytes)
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let totalBytes = 0
    let text = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value?.byteLength || 0
        if (totalBytes > maxResponseBytes) {
          // 取消后续流读取，再明确拒绝；绝不能为了兼容数据而截断 JSON 后继续解析。
          void reader.cancel().catch(() => undefined)
          throw createResponseSizeError(maxResponseBytes)
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
      return text
    } finally {
      reader.releaseLock?.()
    }
  }

  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
    throw createResponseSizeError(maxResponseBytes)
  }
  return text
}

/** 拉取接口数据（返回原始响应体），支持取消、总超时和响应体大小上限。 */
export async function fetchChartData(
  request: ChartDataSourceRequest,
  fetchImpl: typeof fetch = fetch,
  options: FetchChartDataOptions = {},
): Promise<unknown> {
  const externalSignal = options.signal
  if (externalSignal?.aborted) throw createChartAbortError()

  const timeoutMs = options.timeoutMs ?? DEFAULT_CHART_REQUEST_TIMEOUT_MS
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_CHART_RESPONSE_MAX_BYTES
  const setTimeoutImpl = options.setTimeoutImpl || setTimeout
  const clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout
  const controller = new AbortController()
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    // 原生 fetch 会据此中止网络与响应流；外层 race 同时兼容忽略 signal 的注入实现。
    signal: controller.signal,
  }
  if (request.body) init.body = request.body

  let timeout: ReturnType<typeof setTimeout> | null = null
  let rejectTimeout!: (error: Error) => void
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject
  })
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeout = setTimeoutImpl(() => {
      // 先让超时错误进入 race，再中止底层请求，避免最终只暴露含糊的 AbortError。
      rejectTimeout(new Error(`接口请求超时（${timeoutMs}ms）`))
      controller.abort()
    }, timeoutMs)
  }

  let rejectExternalAbort!: (error: Error) => void
  const externalAbortPromise = new Promise<never>((_resolve, reject) => {
    rejectExternalAbort = reject
  })
  const onExternalAbort = () => {
    rejectExternalAbort(createChartAbortError())
    controller.abort()
  }
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

  const operation = (async () => {
    const response = await fetchImpl(request.url, init)
    if (!response.ok) throw new Error(`接口请求失败：HTTP ${response.status}`)
    const text = await readChartResponseText(response, maxResponseBytes)
    if (!text.trim()) return null
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('接口响应不是合法 JSON')
    }
  })()

  try {
    return await Promise.race([operation, timeoutPromise, externalAbortPromise])
  } finally {
    if (timeout !== null) clearTimeoutImpl(timeout)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}
