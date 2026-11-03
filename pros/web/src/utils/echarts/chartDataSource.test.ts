// @vitest-environment happy-dom
/**
 * 数据接口的请求构造 / 鉴权 / 字段映射测试。
 */
import { describe, expect, it } from 'vitest'
import {
  applyMappedDataToOption,
  buildDataSourceRequest,
  buildQueryString,
  createEmptyDataSourceConfig,
  mapResponseToChartData,
  normalizeDataSourceConfig,
  parseDataSourceConfig,
  pickList,
  serializeDataSourceConfig,
} from './chartDataSource'

describe('数据接口配置归一化', () => {
  it('空输入返回默认配置', () => {
    const config = normalizeDataSourceConfig(null)
    expect(config.enabled).toBe(false)
    expect(config.method).toBe('GET')
    expect(config.auth).toBe('none')
    expect(config.refreshInterval).toBe(0)
  })

  it('序列化 ⇄ 解析往返一致', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.method = 'POST'
    config.body = '{"a":1}'
    config.auth = 'custom'
    config.refreshInterval = 30
    config.mapping = { listPath: 'data.list', categoryField: 'name', valueField: 'v', seriesField: '' }
    const text = serializeDataSourceConfig(config)
    const back = parseDataSourceConfig(text)
    expect(back.url).toBe(config.url)
    expect(back.method).toBe('POST')
    expect(back.body).toBe(config.body)
    expect(back.auth).toBe('custom')
    expect(back.refreshInterval).toBe(30)
    expect(back.mapping.listPath).toBe('data.list')
  })

  it('非法 JSON 回落默认配置', () => {
    expect(parseDataSourceConfig('{oops').url).toBe('')
  })

  it('刷新间隔超上限被夹到一天', () => {
    const config = normalizeDataSourceConfig({ refreshInterval: 999999 })
    expect(config.refreshInterval).toBe(86400)
  })
})

describe('请求构造', () => {
  it('GET：参数进 query，body 为 null', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.method = 'GET'
    config.params = '{"page":2,"size":10}'
    const request = buildDataSourceRequest(config)
    expect(request.method).toBe('GET')
    expect(request.url).toBe('https://example.com/api?page=2&size=10')
    expect(request.body).toBeNull()
    expect(request.headers.Accept).toBe('application/json')
  })

  it('POST：body 进请求体，并带 Content-Type', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.method = 'POST'
    config.body = '{"date":"2024-01"}'
    const request = buildDataSourceRequest(config)
    expect(request.method).toBe('POST')
    expect(request.body).toBe('{"date":"2024-01"}')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.url).toBe('https://example.com/api')
  })

  it('无鉴权：不带 Authorization', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    const request = buildDataSourceRequest(config, { bearerToken: 'secret' }, 'session-token')
    expect(request.headers.Authorization).toBeUndefined()
  })

  it('自定义鉴权：Bearer Token 与自定义 Header 都带上', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.auth = 'custom'
    config.bearerToken = true
    config.useHeaders = true
    const request = buildDataSourceRequest(
      config,
      { bearerToken: 'my-token', headers: { 'X-Api-Key': 'key-1' } },
      null,
    )
    expect(request.headers.Authorization).toBe('Bearer my-token')
    expect(request.headers['X-Api-Key']).toBe('key-1')
  })

  it('读取本系统登录态：直接用系统 token', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.auth = 'session'
    const request = buildDataSourceRequest(config, {}, 'sys-token')
    expect(request.headers.Authorization).toBe('Bearer sys-token')
  })

  it('自定义 header 也可来自配置本身（非密钥字段）', () => {
    const config = createEmptyDataSourceConfig()
    config.url = 'https://example.com/api'
    config.headers = [{ key: 'X-Tenant', value: 'demo' }]
    const request = buildDataSourceRequest(config)
    expect(request.headers['X-Tenant']).toBe('demo')
  })

  it('query 字符串：JSON 解析失败时原样拼接', () => {
    expect(buildQueryString('{"a":1}')).toBe('a=1')
    expect(buildQueryString('a=1&b=2')).toBe('a=1&b=2')
    expect(buildQueryString('')).toBe('')
  })
})

describe('响应字段映射', () => {
  const payload = {
    code: 0,
    data: {
      list: [
        { name: '一月', value: 10, series: '新增' },
        { name: '二月', value: 20, series: '新增' },
        { name: '一月', value: 5, series: '活跃' },
        { name: '二月', value: 15, series: '活跃' },
      ],
    },
  }

  it('按路径取数组', () => {
    expect(pickList(payload, 'data.list')).toHaveLength(4)
    expect(pickList([1, 2], '')).toHaveLength(2)
    expect(pickList(payload, 'not.exists')).toHaveLength(0)
  })

  it('单系列映射：类目字段 + 数值字段', () => {
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: '',
    })
    expect(mapped.categories).toEqual(['一月', '二月', '一月', '二月'])
    expect(mapped.series).toHaveLength(1)
    expect(mapped.series[0]!.data).toEqual([10, 20, 5, 15])
  })

  it('多系列映射：按系列字段分组', () => {
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: 'series',
    })
    expect(mapped.series).toHaveLength(2)
    expect(mapped.series[0]!.name).toBe('新增')
    expect(mapped.series[0]!.data).toEqual([10, 20])
    expect(mapped.series[1]!.name).toBe('活跃')
    expect(mapped.series[1]!.data).toEqual([5, 15])
    expect(mapped.categories).toEqual(['一月', '二月'])
  })

  it('映射结果写回 option：类目进 xAxis.data，数值进 series.data', () => {
    const option = {
      xAxis: { type: 'category', data: [] },
      series: [{ type: 'bar', data: [] }],
    }
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: '',
    })
    const next = applyMappedDataToOption(option, mapped)
    const xAxis = next.xAxis as { data: string[] }
    expect(xAxis.data).toEqual(['一月', '二月', '一月', '二月'])
    const series = next.series as Array<{ data: number[] }>
    expect(series[0]!.data).toEqual([10, 20, 5, 15])
  })
})
