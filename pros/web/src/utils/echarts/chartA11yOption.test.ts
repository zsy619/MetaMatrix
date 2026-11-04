/**
 * option 级 aria 生成：
 * - 默认开启 aria / aria.label；
 * - 自动摘要（基于标题 / 类型 / 系列 / 数据）；
 * - 用户提供的 description 优先，且会被净化 + 限长；
 * - 危险 / 非法的 aria 子项不生效。
 */
import { describe, expect, it } from 'vitest'
import {
  CHART_ARIA_MAX_DESCRIPTION_LEN,
  applyChartAria,
  sanitizeAriaDescription,
} from './chartA11yOption.ts'

describe('applyChartAria：默认开启 aria 并生成摘要', () => {
  it('默认开启 aria 与 aria.label', () => {
    const option = applyChartAria({
      title: { text: '月度趋势' },
      series: [{ type: 'line', data: [1, 2] }],
    })
    const aria = option.aria as Record<string, unknown>
    expect(aria.enabled).toBe(true)
    const label = aria.label as Record<string, unknown>
    expect(label.enabled).toBe(true)
    expect(typeof label.description).toBe('string')
  })

  it('自动摘要包含标题 / 类型 / 系列 / 数据', () => {
    const option = applyChartAria({
      title: { text: '月度趋势' },
      xAxis: { data: ['一月', '二月'] },
      series: [
        { type: 'line', name: '新增用户', data: [820, 932] },
        { type: 'line', name: '活跃用户', data: [120, 210] },
      ],
    })
    const label = (option.aria as Record<string, unknown>).label as Record<string, unknown>
    const description = String(label.description)
    expect(description).toContain('折线图')
    expect(description).toContain('月度趋势')
    expect(description).toContain('新增用户')
    expect(description).toContain('活跃用户')
    expect(description).toContain('一月 820')
    expect(description).toContain('二月 932')
  })

  it('饼图摘要按扇区列出名称与数值', () => {
    const option = applyChartAria({
      series: [
        {
          type: 'pie',
          name: '占比',
          data: [
            { name: '移动端', value: 60 },
            { name: '桌面端', value: 40 },
          ],
        },
      ],
    })
    const label = (option.aria as Record<string, unknown>).label as Record<string, unknown>
    const description = String(label.description)
    expect(description).toContain('饼图')
    expect(description).toContain('移动端 60')
    expect(description).toContain('桌面端 40')
  })

  it('用户提供的 description 优先于自动摘要', () => {
    const option = applyChartAria({
      title: { text: '月度趋势' },
      aria: { label: { enabled: true, description: '这是我写的描述' } },
      series: [{ type: 'line', name: '新增用户', data: [820] }],
    })
    const label = (option.aria as Record<string, unknown>).label as Record<string, unknown>
    expect(label.description).toBe('这是我写的描述')
  })

  it('用户显式关闭 aria.enabled 时按用户来', () => {
    const option = applyChartAria({
      aria: { enabled: false },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    const aria = option.aria as Record<string, unknown>
    expect(aria.enabled).toBe(false)
  })

  it('保留用户设置的 aria.decal.show', () => {
    const option = applyChartAria({
      aria: { decal: { show: true } },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    const decal = (option.aria as Record<string, unknown>).decal as Record<string, unknown>
    expect(decal.show).toBe(true)
  })

  it('危险 / 非法的 aria 子项不生效', () => {
    const option = applyChartAria({
      aria: {
        enabled: 'yes',
        label: { enabled: 'no', description: { evil: 1 } },
        decal: { show: 'true' },
        domProps: { innerHTML: '<script>alert(1)</script>' },
        evil: () => 'boom',
      },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    const aria = option.aria as Record<string, unknown>
    expect(aria.enabled).toBe(true)
    expect(aria.evil).toBeUndefined()
    expect(aria.domProps).toBeUndefined()
    const label = aria.label as Record<string, unknown>
    expect(label.enabled).toBe(true)
    expect(typeof label.description).toBe('string')
    expect(aria.decal).toBeUndefined()
  })

  it('不改原 option', () => {
    const source: Record<string, unknown> = { series: [{ type: 'bar', data: [1] }] }
    applyChartAria(source)
    expect(source.aria).toBeUndefined()
  })
})

describe('sanitizeAriaDescription：净化 + 限长', () => {
  it('去掉标签与控制字符', () => {
    expect(sanitizeAriaDescription('<img onerror=1>你好')).toBe('img onerror=1你好')
    expect(sanitizeAriaDescription('a\u0000b\n c')).toBe('a b c')
  })

  it('限长并补省略号', () => {
    const text = 'x'.repeat(CHART_ARIA_MAX_DESCRIPTION_LEN + 50)
    const out = sanitizeAriaDescription(text)
    expect(out.length).toBe(CHART_ARIA_MAX_DESCRIPTION_LEN + 1)
    expect(out.endsWith('…')).toBe(true)
  })

  it('非字符串返回空串', () => {
    expect(sanitizeAriaDescription(undefined)).toBe('')
    expect(sanitizeAriaDescription(123)).toBe('')
    expect(sanitizeAriaDescription('   ')).toBe('')
  })
})
