import { describe, expect, it } from 'vitest'
import { chartPanelWidth } from './chartPanelWidth'

describe('图表属性面板宽度', () => {
  it('量得到正文图表时，面板默认宽度跟它一样', () => {
    expect(chartPanelWidth(640)).toBe(640)
    expect(chartPanelWidth(2000, 1000)).toBe(920)
  })

  it('图表还没布局出来时，仍用 760', () => {
    expect(chartPanelWidth(0)).toBe(760)
    expect(chartPanelWidth(120)).toBe(760)
  })
})