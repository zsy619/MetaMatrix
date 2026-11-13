import { describe, expect, it } from 'vitest'
import { CHART_DARK_BG, CHART_LIGHT_BG, CHART_PALETTE, chartRenderOption } from './rteChartTheme'

const saved = {
  backgroundColor: '#112233',
  series: [{ type: 'bar', data: [1, 2], itemStyle: { color: '#ff00aa' } }],
  xAxis: { type: 'category', data: ['A'], axisLabel: { color: '#abcdef' } },
}

describe('图表渲染外观', () => {
  it('用户写过的背景和系列色在暗色下保持不变，原文也不改', () => {
    const before = JSON.stringify(saved)
    const view = chartRenderOption(saved, 'dark', 'play')
    expect(view.backgroundColor).toBe('#112233')
    expect(view.series).toBe(saved.series)
    expect(view.xAxis).toBe(saved.xAxis)
    expect(view.animation).toBe(true)
    expect(JSON.stringify(saved)).toBe(before)
  })

  it('没写背景时补上配色、轴色和悬停突出，而且不改原对象', () => {
    const option = {
      title: { text: '季度' },
      legend: { bottom: 0 },
      series: [
        { type: 'bar', data: [3] },
        { type: 'pie', data: [1] },
        { type: 'line', data: [2], emphasis: { focus: 'none' } },
      ],
      xAxis: { type: 'category', data: ['A'], name: '月份' },
      yAxis: { type: 'value' },
    }
    const light = chartRenderOption(option, 'light')
    expect(light.backgroundColor).toBe(CHART_LIGHT_BG)
    expect(light.color).toEqual([...CHART_PALETTE])
    expect(light.animation).toBe(false)
    const xAxis = light.xAxis as { axisLabel: { color: string }; nameTextStyle: { color: string } }
    expect(xAxis.axisLabel.color).toBe('#5f6368')
    expect(xAxis.nameTextStyle.color).toBe('#5f6368')
    const series = light.series as Array<{ emphasis?: { focus?: string } }>
    expect(series[0].emphasis?.focus).toBe('series')
    expect(series[1].emphasis?.focus).toBe('self')
    expect(series[2].emphasis?.focus).toBe('none')
    expect(option.series[0]).not.toHaveProperty('emphasis')
    expect(option).not.toHaveProperty('backgroundColor')

    const dark = chartRenderOption(option, 'dark', 'play')
    expect(dark.backgroundColor).toBe(CHART_DARK_BG)
    expect((dark.xAxis as { axisLabel: { color: string } }).axisLabel.color).toBeTruthy()
    expect(dark.animation).toBe(true)
    expect(dark.animationDuration).toBe(720)
    expect(dark.animationEasing).toBe('cubicOut')
  })

  it('用户关掉动画或写过颜色时保留', () => {
    const option = {
      animation: false,
      color: ['#111111'],
      series: [{ type: 'bar', data: [1] }],
    }
    const view = chartRenderOption(option, 'light', 'play')
    expect(view.animation).toBe(false)
    expect(view.color).toEqual(['#111111'])
  })

  it('百分制雷达标出 25 一档的刻度', () => {
    const option = {
      radar: { indicator: [{ name: '甲', max: 100 }, { name: '乙', max: 100 }] },
      series: [{ type: 'radar', data: [{ value: [40, 80] }] }],
    }
    const view = chartRenderOption(option, 'light', 'play')
    const radar = view.radar as { splitNumber: number; axisName: { color: string }; axisLabel?: { show?: boolean } }
    expect(radar.splitNumber).toBe(4)
    expect(radar.axisName.color).toBe('#202124')
    expect(radar.axisLabel).toBeUndefined()
    const series = view.series as Array<{ emphasis?: { focus?: string } }>
    expect(series[0].emphasis?.focus).toBe('series')
  })
})
