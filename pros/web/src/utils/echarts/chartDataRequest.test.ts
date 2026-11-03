// @vitest-environment happy-dom
/**
 * 数据接口的请求构造 / 鉴权测试。
 */
import { describe, expect, it } from 'vitest'
import { createEmptyDataSourceConfig } from './chartDataSource'
import { buildDataSourceRequest, buildQueryString } from './chartDataRequest'

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
