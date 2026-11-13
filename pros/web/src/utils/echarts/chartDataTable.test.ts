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

  it('饼图改类目名会写回扇区名称', () => {
    const model = optionToDataModel(PIE)
    model.categories[0] = '直营'
    const next = dataModelToOption(PIE, model)
    const series = next.series as Array<{ data: Array<{ name: string; value: unknown }> }>
    expect(series[0]!.data[0]).toEqual({ name: '直营', value: 30 })
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
    expect(textToValue('1,200')).toBe(1200)
    expect(textToValue('50%')).toBe(0.5)
    expect(textToValue('abc')).toBe('abc')
    expect(textToValue('')).toBe('')
  })
})

describe('横向柱状图的类目轴', () => {
  const horizontal = {
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: ['甲', '乙'] },
    series: [{ name: '销量', type: 'bar', data: [3, 8] }],
  }

  it('类目从纵轴读出，改名仍写回纵轴', () => {
    const model = optionToDataModel(horizontal)
    expect(model.categories).toEqual(['甲', '乙'])
    expect(model.series[0]!.data).toEqual([3, 8])
    model.categories[0] = '华北'
    const next = dataModelToOption(horizontal, model)
    expect(next.xAxis).toEqual({ type: 'value' })
    expect((next.yAxis as { data: string[] }).data).toEqual(['华北', '乙'])
  })

  it('删光数据行时类目轴也清空', () => {
    const model = optionToDataModel(CARTESIAN)
    model.categories = []
    model.series = model.series.map((item) => ({ ...item, data: [] }))
    const next = dataModelToOption(CARTESIAN, model)
    expect((next.xAxis as { data: string[] }).data).toEqual([])
  })
})

describe('雷达图的指标和系列', () => {
  const radar = {
    radar: {
      indicator: [
        { name: '销售', max: 100 },
        { name: '管理', max: 100 },
        { name: '技术', max: 80 },
      ],
    },
    legend: { data: ['当前', '对比'] },
    series: [
      {
        name: '能力',
        type: 'radar',
        data: [
          { name: '当前', value: [80, 70, 60] },
          { name: '对比', value: [60, 75, 90] },
        ],
      },
    ],
  }

  it('指标是行，每个数据项是一列，数值保持数字', () => {
    const model = optionToDataModel(radar)
    expect(model.categories).toEqual(['销售', '管理', '技术'])
    expect(model.series.map((item) => item.name)).toEqual(['当前', '对比'])
    expect(model.series[0]!.data).toEqual([80, 70, 60])
    expect(model.series[1]!.data).toEqual([60, 75, 90])
  })

  it('改指标名和分数后仍写回数组，并保留指标上限', () => {
    const model = optionToDataModel(radar)
    model.categories[0] = '营收'
    model.series[0]!.data[0] = 88
    model.series[0]!.name = '今年'
    const next = dataModelToOption(radar, model)
    const indicator = (next.radar as { indicator: Array<{ name: string; max: number }> }).indicator
    expect(indicator[0]).toEqual({ name: '营收', max: 100 })
    expect(indicator[2]).toEqual({ name: '技术', max: 80 })
    const series = next.series as Array<{ data: Array<{ name: string; value: unknown[] }> }>
    expect(series[0]!.data[0]).toEqual({ name: '今年', value: [88, 70, 60] })
    expect(Array.isArray(series[0]!.data[1]!.value)).toBe(true)
    expect((next.legend as { data: string[] }).data).toEqual(['今年', '对比'])
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
