import { describe, expect, it } from 'vitest'
import { CHART_DARK_BG, CHART_LIGHT_BG, chartRenderOption } from './rteChartTheme'

const saved = {
  backgroundColor: '#112233',
  series: [{ type: 'bar', data: [1, 2], itemStyle: { color: '#ff00aa' } }],
  xAxis: { type: 'category', data: ['A'], axisLabel: { color: '#abcdef' } },
}

describe('图表暗色只改默认渲染', () => {
  it('用户写过的背景和系列色在暗色下保持不变，原文也不改', () => {
    const before = JSON.stringify(saved)
    const view = chartRenderOption(saved, 'dark')
    expect(view.backgroundColor).toBe('#112233')
    expect(view.series).toBe(saved.series)
    expect(view.xAxis).toBe(saved.xAxis)
    expect(JSON.stringify(saved)).toBe(before)
  })

  it('没写背景时浅色仍是白底，暗色才换深底，而且不写回原对象', () => {
    const option = {
      series: [{ type: 'line', data: [3] }],
      xAxis: { type: 'category', data: ['A'] },
      yAxis: { type: 'value' },
    }
    expect(chartRenderOption(option, 'light').backgroundColor).toBe(CHART_LIGHT_BG)
    const dark = chartRenderOption(option, 'dark')
    expect(dark.backgroundColor).toBe(CHART_DARK_BG)
    expect((dark.xAxis as { axisLabel: { color: string } }).axisLabel.color).toBeTruthy()
    expect(option).not.toHaveProperty('backgroundColor')
    expect(dark.series).toBe(option.series)
  })
})
