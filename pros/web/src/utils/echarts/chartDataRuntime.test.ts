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

  it('读取本系统登录态：复用系统 token', () => {
    const config = createEmptyDataSourceConfig()
    config.enabled = true
    config.url = 'https://example.com/api/data'
    config.auth = 'session'
    const request = resolveChartDataRequest(config, 'chart-3', 'system-token')
    expect(request.headers.Authorization).toBe('Bearer system-token')
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
})
