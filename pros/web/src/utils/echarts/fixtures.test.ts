/**
 * 净化器白名单的 fixture 回归测试。
 *
 * 每种 series 类型 / 每个组件都要：
 * 1. 能过净化器（白名单没把合法配置误删）；
 * 2. 关键字段还在（没被静默清空）。
 */
import { describe, expect, it } from 'vitest'
import { COMPONENT_FIXTURES, SERIES_FIXTURES } from './fixtures'
import { ECHARTS_SERIES_TYPES, sanitizeEchartsOption } from '../rteEchartsOption'

describe('series 类型 fixture', () => {
  for (const [type, option] of Object.entries(SERIES_FIXTURES)) {
    it(`${type} 能过净化器且保留 series`, () => {
      const result = sanitizeEchartsOption(option)
      if (!result.ok) {
        throw new Error(`${type} 净化失败：${result.error}（${result.warnings.join('，')}）`)
      }
      const series = result.option.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      expect(series[0].type).toBe(type)
      expect(ECHARTS_SERIES_TYPES).toContain(type)
    })
  }
})

describe('组件 fixture', () => {
  for (const [name, option] of Object.entries(COMPONENT_FIXTURES)) {
    it(`${name} 能过净化器`, () => {
      const result = sanitizeEchartsOption(option)
      if (!result.ok) {
        throw new Error(`${name} 净化失败：${result.error}（${result.warnings.join('，')}）`)
      }
      const series = result.option.series as Array<Record<string, unknown>>
      expect(series.length).toBeGreaterThan(0)
    })
  }
})

describe('危险字段仍然被剥离', () => {
  it('未知顶层字段被丢弃', () => {
    const result = sanitizeEchartsOption({
      unknownTop: 1,
      series: [{ type: 'bar', data: [1] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.option.unknownTop).toBeUndefined()
  })

  it('未知 series 类型被丢弃', () => {
    const result = sanitizeEchartsOption({
      series: [
        { type: 'bar', data: [1] },
        { type: 'notARealType', data: [1] },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as unknown[]
    expect(series).toHaveLength(1)
  })

  it('renderItem 只接受内置白名单预设', () => {
    const result = sanitizeEchartsOption({
      series: [{ type: 'custom', renderItem: 'preset:evil', data: [] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as Array<Record<string, unknown>>
    expect(series[0].renderItem).toBeUndefined()
  })

  it('label.rich 的样式字段受白名单约束', () => {
    const result = sanitizeEchartsOption({
      series: [
        {
          type: 'bar',
          data: [1],
          label: {
            rich: {
              a: { color: '#333', fontSize: 12, onClick: 'alert(1)' },
            },
          },
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as Array<Record<string, unknown>>
    const label = series[0].label as Record<string, unknown>
    const rich = label.rich as Record<string, Record<string, unknown>>
    expect(rich.a.color).toBe('#333')
    expect(rich.a.onClick).toBeUndefined()
  })

  it('series.data 里未登记的字段被丢弃', () => {
    const result = sanitizeEchartsOption({
      series: [{ type: 'scatter', data: [{ name: 'A', value: [1, 2], evil: 'x' }] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const series = result.option.series as Array<Record<string, unknown>>
    const item = (series[0].data as Array<Record<string, unknown>>)[0]
    expect(item.evil).toBeUndefined()
    expect(item.name).toBe('A')
  })
})
