// @vitest-environment happy-dom
/**
 * 数据表格 ⇄ JSON 双向同步的测试。
 */
import { describe, expect, it } from 'vitest'
import {
  dataModelToJson,
  dataModelToOption,
  dataModelToRows,
  jsonToDataModel,
  optionToDataModel,
  rowsToDataModel,
  textToValue,
} from './chartDataTable'

const CARTESIAN = {
  title: { text: '月度趋势' },
  xAxis: { type: 'category', data: ['一月', '二月'] },
  yAxis: { type: 'value' },
  series: [
    { name: '新增', type: 'line', data: [10, 20] },
    { name: '活跃', type: 'line', data: [5, 15] },
  ],
}

const PIE = {
  title: { text: '占比' },
  series: [
    {
      name: '占比',
      type: 'pie',
      data: [
        { name: 'A', value: 30 },
        { name: 'B', value: 70 },
      ],
    },
  ],
}

describe('option ⇄ 数据模型', () => {
  it('笛卡尔图能读出类目与两个系列', () => {
    const model = optionToDataModel(CARTESIAN)
    expect(model.categories).toEqual(['一月', '二月'])
    expect(model.series).toHaveLength(2)
    expect(model.series[0]!.name).toBe('新增')
    // 数值保持数值形态（ECharts 数值轴需要数字）
    expect(model.series[0]!.data).toEqual([10, 20])
  })

  it('饼图（{name,value} 形态）能读出类目与数值', () => {
    const model = optionToDataModel(PIE)
    expect(model.categories).toEqual(['A', 'B'])
    expect(model.series[0]!.data).toEqual([30, 70])
  })

  it('改系列名会写回 series 和图例', () => {
    const model = optionToDataModel({
      ...CARTESIAN,
      legend: { data: ['新增', '活跃'], bottom: 0 },
    })
    model.series[0]!.name = '今年'
    const next = dataModelToOption(
      { ...CARTESIAN, legend: { data: ['新增', '活跃'], bottom: 0 } },
      model,
    )
    const series = next.series as Array<{ name: string }>
    const legend = next.legend as { data: string[] }
    expect(series[0]!.name).toBe('今年')
    expect(legend.data).toEqual(['今年', '活跃'])
  })

  it('写回 option 时类目进 xAxis.data、数值进 series.data', () => {
    const model = optionToDataModel(CARTESIAN)
    const next = dataModelToOption(CARTESIAN, model)
    const xAxis = next.xAxis as { data: string[] }
    expect(xAxis.data).toEqual(['一月', '二月'])
    const series = next.series as Array<{ data: unknown[] }>
    expect(series[0]!.data).toEqual([10, 20])
    expect(series[1]!.data).toEqual([5, 15])
  })

  it('饼图写回时保留 {name,value} 形态', () => {
    const model = optionToDataModel(PIE)
    const next = dataModelToOption(PIE, model)
    const series = next.series as Array<{ data: Array<{ name: string; value: unknown }> }>
    expect(series[0]!.data[0]).toEqual({ name: 'A', value: 30 })
  })
})

describe('表格 ⇄ 数据模型', () => {
  it('模型转表格：行 = 类目，列 = 系列', () => {
    const model = optionToDataModel(CARTESIAN)
    const rows = dataModelToRows(model)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ category: '一月', values: [10, 5] })
  })

  it('表格转模型：文本数字被解析成数值', () => {
    const rows = [
      { category: '一月', values: ['11', '6'] },
      { category: '二月', values: ['21', '16'] },
    ]
    const model = rowsToDataModel(rows, ['新增', '活跃'])
    expect(model.categories).toEqual(['一月', '二月'])
    expect(model.series[0]!.data).toEqual([11, 21])
    expect(model.series[1]!.data).toEqual([6, 16])
  })

  it('表格改一格 → 模型 → option 全链路同步', () => {
    const model = optionToDataModel(CARTESIAN)
    const rows = dataModelToRows(model)
    rows[1]!.values[0] = '99'
    const nextModel = rowsToDataModel(rows, ['新增', '活跃'], model)
    const next = dataModelToOption(CARTESIAN, nextModel)
    const series = next.series as Array<{ data: unknown[] }>
    expect(series[0]!.data).toEqual([10, 99])
  })

  it('文本转值：数字串转数字，非数字保持文本', () => {
    expect(textToValue('12')).toBe(12)
    expect(textToValue('12.5')).toBe(12.5)
    expect(textToValue('abc')).toBe('abc')
    expect(textToValue('')).toBe('')
  })
})

describe('数据 JSON 视图', () => {
  it('模型 → JSON → 模型 往返一致', () => {
    const model = optionToDataModel(CARTESIAN)
    const json = dataModelToJson(model)
    const back = jsonToDataModel(json)
    expect(back).toEqual(model)
  })

  it('JSON 视图改数据 → option 同步', () => {
    const model = optionToDataModel(CARTESIAN)
    const json = dataModelToJson(model)
    const edited = json.replace('10', '66')
    const back = jsonToDataModel(edited)
    expect(back).toBeTruthy()
    const next = dataModelToOption(CARTESIAN, back!)
    const series = next.series as Array<{ data: unknown[] }>
    expect(series[0]!.data).toEqual([66, 20])
  })

  it('非法 JSON 返回 null', () => {
    expect(jsonToDataModel('{ not json')).toBeNull()
    expect(jsonToDataModel('{"categories":[]}')).toBeNull()
  })
})
