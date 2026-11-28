// @vitest-environment happy-dom
/**
 * 数据接口运行时测试：
 * - 请求构造（GET / POST / 参数 / 鉴权头）；
 * - 响应映射进 option（类目 + 数值、dataset 两种形态）；
 * - 刷新间隔（0 只拉一次；>0 按间隔重复拉）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchChartData,
  mergeChartDataIntoOption,
  resolveChartDataRequest,
  startChartDataPolling,
} from './chartDataRuntime'
import { createEmptyDataSourceConfig } from './chartDataSource'
import { clearChartSecret, writeChartSecret } from './chartSecret'

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response
}

describe('图表数据接口运行时', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('GET + Query 参数 + 无鉴权', () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.method = 'GET'
    config.params = '{"page":1,"size":20}'
    const request = resolveChartDataRequest(config, 'chart-1', null)
    expect(request.method).toBe('GET')
    expect(request.url).toBe('https://example.com/api/data?page=1&size=20')
    expect(request.body).toBeNull()
    expect(request.headers.Authorization).toBeUndefined()
  })

  it('POST + 请求体 + 自定义 Bearer / Header', () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.method = 'POST'
    config.body = '{"date":"2024-01"}'
    config.auth = 'custom'
    config.bearerToken = true
    config.useHeaders = true
    writeChartSecret('chart-2', { bearerToken: 'secret-token', headers: { 'X-Api-Key': 'k-1' } })
    const request = resolveChartDataRequest(config, 'chart-2', null)
    expect(request.method).toBe('POST')
    expect(request.body).toBe('{"date":"2024-01"}')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.headers.Authorization).toBe('Bearer secret-token')
    expect(request.headers['X-Api-Key']).toBe('k-1')
    clearChartSecret('chart-2')
  })

  it('读取本系统登录态：同源接口复用系统 token', () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = '/api/charts/data'
    config.auth = 'session'
    const request = resolveChartDataRequest(config, 'chart-3', 'system-token')
    expect(request.headers.Authorization).toBe('Bearer system-token')
  })

  it('读取本系统登录态：外部地址不发送系统 token', () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.auth = 'session'
    const request = resolveChartDataRequest(config, 'chart-3b', 'system-token')
    expect(request.headers.Authorization).toBeUndefined()
  })

  it('响应映射：类目 + 数值写进 xAxis / series', async () => {
    const config = createEmptyDataSourceConfig()
    config.mapping = { listPath: 'data.list', categoryField: 'name', valueField: 'value', seriesField: '' }
    const payload = {
      data: {
        list: [
          { name: '一月', value: 12 },
          { name: '二月', value: 20 },
        ],
      },
    }
    const fetchImpl = vi.fn(async () => jsonResponse(payload))
    const request = resolveChartDataRequest(config, 'chart-4', null)
    const raw = await fetchChartData(request, fetchImpl as unknown as typeof fetch)
    expect(raw).toEqual(payload)

    const option = {
      xAxis: { type: 'category', data: ['旧'] },
      series: [{ type: 'bar', data: [1] }],
    }
    const merged = mergeChartDataIntoOption(option, raw, config)
    expect((merged.xAxis as { data: string[] }).data).toEqual(['一月', '二月'])
    expect((merged.series as Array<{ data: number[] }>)[0].data).toEqual([12, 20])
    // 原 option 不被就地改写
    expect((option.xAxis as { data: string[] }).data).toEqual(['旧'])
  })

  it('响应映射：按系列字段拆成多个系列', () => {
    const config = createEmptyDataSourceConfig()
    config.mapping = { listPath: '', categoryField: 'month', valueField: 'value', seriesField: 'team' }
    const payload = [
      { month: 'Q1', value: 3, team: '甲' },
      { month: 'Q2', value: 5, team: '甲' },
      { month: 'Q1', value: 8, team: '乙' },
      { month: 'Q2', value: 2, team: '乙' },
    ]
    const option = { xAxis: { type: 'category' }, series: [{ type: 'bar' }, { type: 'bar' }] }
    const merged = mergeChartDataIntoOption(option, payload, config)
    const series = merged.series as Array<{ data: number[] }>
    expect(series[0].data).toEqual([3, 5])
    expect(series[1].data).toEqual([8, 2])
  })

  it('用了 dataset 的图表：响应写进 dataset.source', () => {
    const config = createEmptyDataSourceConfig()
    config.mapping = { listPath: 'data', categoryField: 'x', valueField: 'y', seriesField: '' }
    const payload = { data: [{ x: 1, y: 2 }] }
    const option = { dataset: [{ source: [] }, { source: [] }] }
    const merged = mergeChartDataIntoOption(option, payload, config)
    const dataset = merged.dataset as Array<{ source: unknown[] }>
    expect(dataset[0].source).toEqual([{ x: 1, y: 2 }])
    expect(dataset[1].source).toEqual([])
  })

  it('接口报错时抛出可读信息', async () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api/data'
    const request = resolveChartDataRequest(config, 'chart-5', null)
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500))
    await expect(fetchChartData(request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      'HTTP 500',
    )
  })

  it('刷新间隔为 0：只拉一次', async () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 0
    const fetchImpl = vi.fn(async () => jsonResponse([{ name: 'a', value: 1 }]))
    const seen: Array<Record<string, unknown>> = []
    const poller = startChartDataPolling({
      option: () => ({ xAxis: { type: 'category' }, series: [{ type: 'bar' }] }),
      config,
      chartId: 'chart-6',
      onOption: (option) => seen.push(option),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(seen.length).toBeGreaterThanOrEqual(1)
    poller.stop()
  })

  it('刷新间隔 > 0：按间隔重复拉取', async () => {
    vi.useFakeTimers()
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 5
    const fetchImpl = vi.fn(async () => jsonResponse([{ name: 'a', value: 1 }]))
    const poller = startChartDataPolling({
      option: () => ({ xAxis: { type: 'category' }, series: [{ type: 'bar' }] }),
      config,
      chartId: 'chart-7',
      onOption: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('接口失败：走 onError，不抛异常', async () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    const errors: string[] = []
    const fetchImpl = vi.fn(async () => {
      throw new Error('网络异常')
    })
    const poller = startChartDataPolling({
      option: () => ({}),
      config,
      chartId: 'chart-8',
      onOption: () => {},
      onError: (message) => errors.push(message),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await poller.refresh()
    expect(errors.some((item) => item.includes('网络异常'))).toBe(true)
    poller.stop()
  })

  it('停止会中止在途请求，忽略 AbortSignal 的迟到结果也不会更新或报错', async () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 0
    let resolveFetch!: (response: Response) => void
    const fetchImpl = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>(resolve => {
        resolveFetch = resolve
      }),
    )
    const onOption = vi.fn()
    const onError = vi.fn()
    const poller = startChartDataPolling({
      option: () => ({}),
      config,
      chartId: 'chart-stop-pending',
      onOption,
      onError,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = fetchImpl.mock.calls[0]?.[1]?.signal
    expect(signal?.aborted).toBe(false)

    poller.stop()
    expect(signal?.aborted).toBe(true)
    // 自定义 fetch 故意无视 signal 并迟到返回，验证请求代次与停止状态仍能守住结果。
    resolveFetch(jsonResponse([{ name: '迟到', value: 99 }]))
    await Promise.resolve()
    await Promise.resolve()
    expect(onOption).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('请求超时会进入 onError，并在本轮结束后继续后续调度', async () => {
    vi.useFakeTimers()
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 5
    // 第一轮永久 pending 且故意忽略中止；第二轮正常返回，用于证明调度没有被卡死。
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(() => undefined))
      .mockImplementationOnce(async () => jsonResponse([{ name: '恢复', value: 2 }]))
    const errors: string[] = []
    const onOption = vi.fn()
    const poller = startChartDataPolling({
      option: () => ({}),
      config,
      chartId: 'chart-timeout-continue',
      onOption,
      onError: message => errors.push(message),
      requestTimeoutMs: 1_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(errors.some(message => message.includes('超时'))).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(onOption).toHaveBeenCalledTimes(1)
    poller.stop()
  })

  it('页面隐藏时暂停定时刷新，恢复可见时立即刷新一次', async () => {
    vi.useFakeTimers()
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 5
    let hidden = false
    let visibilityListener: (() => void) | undefined
    const visibility = {
      isHidden: () => hidden,
      subscribe: (listener: () => void) => {
        visibilityListener = listener
        return () => {
          visibilityListener = undefined
        }
      },
    }
    const fetchImpl = vi.fn(async () => jsonResponse([{ name: '可见', value: 1 }]))
    const poller = startChartDataPolling({
      option: () => ({}),
      config,
      chartId: 'chart-visibility',
      onOption: () => {},
      visibility,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    hidden = true
    visibilityListener?.()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    hidden = false
    visibilityListener?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
    expect(visibilityListener).toBeUndefined()
  })

  it('页面隐藏也会中止在途请求，恢复后新结果生效而旧结果无效', async () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.refreshInterval = 0
    let hidden = false
    let visibilityListener: (() => void) | undefined
    let resolveFirst!: (response: Response) => void
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(async () => jsonResponse([{ name: '新结果', value: 2 }]))
    const seen: Array<Record<string, unknown>> = []
    const poller = startChartDataPolling({
      option: () => ({}),
      config,
      chartId: 'chart-hide-pending',
      onOption: option => seen.push(option),
      visibility: {
        isHidden: () => hidden,
        subscribe: listener => {
          visibilityListener = listener
          return () => undefined
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    hidden = true
    visibilityListener?.()
    hidden = false
    visibilityListener?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // 等待第二次响应依次完成 text 读取、race 与 option 合并，而不是只等到 fetch 被调用。
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(seen).toHaveLength(1)

    resolveFirst(jsonResponse([{ name: '旧结果', value: 1 }]))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(seen).toHaveLength(1)
    poller.stop()
  })

  it('响应体超过字节上限时明确拒绝，不尝试解析截断内容', async () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api/data'
    const request = resolveChartDataRequest(config, 'chart-too-large', null)
    const text = vi.fn(async () => JSON.stringify({ data: 'x'.repeat(100) }))
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text,
    }) as unknown as Response)
    await expect(
      fetchChartData(request, fetchImpl as unknown as typeof fetch, {
        timeoutMs: 0,
        maxResponseBytes: 32,
      }),
    ).rejects.toThrow('大小上限')
    expect(text).toHaveBeenCalledTimes(1)
  })

  it('Content-Length 已超限时在读取响应体前拒绝', async () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api/data'
    const request = resolveChartDataRequest(config, 'chart-content-length', null)
    const text = vi.fn(async () => '{}')
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name.toLowerCase() === 'content-length' ? '100' : null },
      text,
    }) as unknown as Response)
    await expect(
      fetchChartData(request, fetchImpl as unknown as typeof fetch, {
        timeoutMs: 0,
        maxResponseBytes: 32,
      }),
    ).rejects.toThrow('大小上限')
    expect(text).not.toHaveBeenCalled()
  })
})
