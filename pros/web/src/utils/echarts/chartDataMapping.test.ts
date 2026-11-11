// @vitest-environment happy-dom
/**
 * 数据接口的响应字段映射测试。
 */
import { describe, expect, it } from 'vitest'
import {
  applyMappedDataToOption,
  mapResponseToChartData,
  pickList,
  tableGridToChartData,
} from './chartDataMapping'

describe('响应字段映射', () => {
  const payload = {
    code: 0,
    data: {
      list: [
        { name: '一月', value: 10, series: '新增' },
        { name: '二月', value: 20, series: '新增' },
        { name: '一月', value: 5, series: '活跃' },
        { name: '二月', value: 15, series: '活跃' },
      ],
    },
  }

  it('按路径取数组', () => {
    expect(pickList(payload, 'data.list')).toHaveLength(4)
    expect(pickList([1, 2], '')).toHaveLength(2)
    expect(pickList(payload, 'not.exists')).toHaveLength(0)
  })

  it('单系列映射：类目字段 + 数值字段', () => {
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: '',
    })
    expect(mapped.categories).toEqual(['一月', '二月', '一月', '二月'])
    expect(mapped.series).toHaveLength(1)
    expect(mapped.series[0]!.data).toEqual([10, 20, 5, 15])
  })

  it('多系列映射：按系列字段分组', () => {
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: 'series',
    })
    expect(mapped.series).toHaveLength(2)
    expect(mapped.series[0]!.name).toBe('新增')
    expect(mapped.series[0]!.data).toEqual([10, 20])
    expect(mapped.series[1]!.name).toBe('活跃')
    expect(mapped.series[1]!.data).toEqual([5, 15])
    expect(mapped.categories).toEqual(['一月', '二月'])
  })

  it('非数值字段归零', () => {
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'missing',
      seriesField: '',
    })
    expect(mapped.series[0]!.data).toEqual([0, 0, 0, 0])
  })

  it('映射结果写回 option：类目进 xAxis.data，数值进 series.data', () => {
    const option = {
      xAxis: { type: 'category', data: [] },
      series: [{ type: 'bar', data: [] }],
    }
    const mapped = mapResponseToChartData(payload, {
      listPath: 'data.list',
      categoryField: 'name',
      valueField: 'value',
      seriesField: '',
    })
    const next = applyMappedDataToOption(option, mapped)
    const xAxis = next.xAxis as { data: string[] }
    expect(xAxis.data).toEqual(['一月', '二月', '一月', '二月'])
    const series = next.series as Array<{ data: number[] }>
    expect(series[0]!.data).toEqual([10, 20, 5, 15])
  })

  it('正文表格第一列是类目，其余列是系列', () => {
    expect(
      tableGridToChartData([
        ['月份', '新增', '活跃'],
        ['一月', '10', '5'],
        ['二月', '20', '15'],
      ]),
    ).toEqual({
      categories: ['一月', '二月'],
      series: [
        { name: '新增', data: [10, 20] },
        { name: '活跃', data: [5, 15] },
      ],
    })
  })
})
