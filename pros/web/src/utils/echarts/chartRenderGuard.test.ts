import { describe, expect, it } from 'vitest'
import { ensureRenderableChartOption } from './chartRenderGuard'
import { GENERAL_FIELDS, AXIS_FIELDS, seriesTypeField } from './panelSchemas/common'

describe('图表属性标签', () => {
  it('标题位置和图例用中文选项，不再要求手写 center', () => {
    const left = GENERAL_FIELDS.find((field) => field.path === 'title.left')
    expect(left?.kind).toBe('select')
    expect(left?.label).toBe('标题左右')
    expect(left?.options?.map((item) => item.label)).toEqual(['居左', '居中', '居右'])
    expect(GENERAL_FIELDS.some((field) => (field.placeholder || '').includes('center'))).toBe(false)
    expect(GENERAL_FIELDS.find((field) => field.path === 'tooltip.confine')?.label).toBe('提示不超出图表')
    expect(AXIS_FIELDS.find((field) => field.path === 'type')?.options?.map((item) => item.label)).toContain('分类')
    expect(seriesTypeField(['bar', 'line']).options?.map((item) => item.label)).toEqual(['柱状', '折线'])
  })
})

describe('缺坐标轴时补轴', () => {
  it('柱状图没有 xAxis 时补上分类轴和数值轴', () => {
    const next = ensureRenderableChartOption({
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(next.xAxis).toEqual({ type: 'category' })
    expect(next.yAxis).toEqual({ type: 'value' })
  })

  it('已经有坐标轴时不覆盖', () => {
    const option = {
      xAxis: { type: 'category', data: ['甲'] },
      yAxis: { type: 'value', name: '数' },
      series: [{ type: 'line', data: [1] }],
    }
    expect(ensureRenderableChartOption(option)).toBe(option)
  })

  it('地图散点不补直角坐标轴', () => {
    const option = {
      geo: { map: 'demo' },
      series: [{ type: 'scatter', coordinateSystem: 'geo', data: [[1, 2]] }],
    }
    expect(ensureRenderableChartOption(option)).toBe(option)
  })
})
