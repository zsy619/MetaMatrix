// @vitest-environment jsdom
/**
 * option 级 aria 的落地校验：ECharts 真的把描述写到了图表根元素上。
 *
 * 这一层能证明「默认开启 aria + 自动摘要」不是只停在我们的数据结构里，
 * 而是 ECharts 真的读到了 aria.label.description。
 */
import { describe, expect, it } from 'vitest'
import { echarts } from '../echartsRuntime'
import { applyChartAria } from './chartA11yOption'

function mountChart(option: Record<string, unknown>): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const chart = echarts.init(host, undefined, { renderer: 'svg', width: 320, height: 200 })
  chart.setOption(option, { notMerge: true })
  return { host, dispose: () => chart.dispose() }
}

describe('ECharts 级别的 aria 输出', () => {
  it('图表根元素带 aria-label（自动摘要含标题与数据）', () => {
    const { host, dispose } = mountChart(
      applyChartAria({
        title: { text: '测试图' },
        xAxis: { type: 'category', data: ['一月', '二月'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', name: '甲', data: [1, 2] }],
      }),
    )
    const label = host.getAttribute('aria-label') || ''
    expect(label).toContain('柱状图')
    expect(label).toContain('测试图')
    expect(label).toContain('一月 1')
    expect(label).toContain('二月 2')
    dispose()
  })

  it('用户提供的 description 优先，ECharts 播报的是它', () => {
    const { host, dispose } = mountChart(
      applyChartAria({
        title: { text: '测试图' },
        aria: { label: { enabled: true, description: '自定义描述' } },
        xAxis: { type: 'category', data: ['一月'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', name: '甲', data: [1] }],
      }),
    )
    expect(host.getAttribute('aria-label')).toBe('自定义描述')
    dispose()
  })
})
