// @vitest-environment happy-dom
/**
 * 数据接口配置（归一化 / 序列化 / 解析）测试。
 */
import { describe, expect, it } from 'vitest'
import {
  createEmptyDataSourceConfig,
  normalizeDataSourceConfig,
  parseDataSourceConfig,
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

  it('非法鉴权方式回落 none，非法方法回落 GET', () => {
    const config = normalizeDataSourceConfig({ auth: 'weird', method: 'DELETE' })
    expect(config.auth).toBe('none')
    expect(config.method).toBe('GET')
  })
})
