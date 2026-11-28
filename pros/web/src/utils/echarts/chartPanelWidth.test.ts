import { describe, expect, it } from 'vitest'
import { CHART_PANEL_MAX_WIDTH, chartPanelWidth } from './chartPanelWidth'

describe('图表属性面板宽度', () => {
  it('不超过 480px：图表很宽也压到上限', () => {
    expect(CHART_PANEL_MAX_WIDTH).toBe(480)
    expect(chartPanelWidth(640)).toBe(480)
    expect(chartPanelWidth(2000, 1000)).toBe(480)
  })

  it('图表还没布局出来时，用 480', () => {
    expect(chartPanelWidth(0)).toBe(480)
    expect(chartPanelWidth(120)).toBe(480)
  })

  it('视口更窄时按视口收，但不小于 320', () => {
    expect(chartPanelWidth(640, 400)).toBe(368)
    expect(chartPanelWidth(640, 200)).toBe(320)
  })
})
