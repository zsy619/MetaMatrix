/** K 线图（官方类别 candlestick）：基础 / 成交量 / 多周期。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

/** 示例 K 线：[开盘, 收盘, 最低, 最高] */
const OHLC = [
  [20.0, 22.5, 19.4, 23.1],
  [22.6, 21.9, 21.2, 23.4],
  [21.8, 23.6, 21.5, 24.1],
  [23.4, 22.7, 21.9, 24.6],
  [22.6, 24.2, 22.2, 25.1],
  [24.0, 25.4, 23.6, 26.0],
  [25.2, 24.6, 23.1, 25.8],
]

const DATES = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12', '2026-01-13']

const VOLUME = [120, 168, 142, 190, 210, 176, 232]

export const candlestickTemplates: EchartsTemplateDef[] = [
  def({
    id: 'candlestick-basic',
    categoryId: 'candlestick',
    label: '基础 K 线图',
    hint: '开高低收走势',
    chartType: 'candlestick',
    build: (opts) =>
      withTitle(
        {
          title: { text: 'K 线走势', left: 'center' },
          tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: DATES },
          yAxis: { type: 'value', scale: true, name: '价格' },
          series: [
            {
              name: 'K 线',
              type: 'candlestick',
              data: OHLC,
              itemStyle: { color: '#e05a4f', color0: '#3f9c6d', borderColor: '#e05a4f', borderColor0: '#3f9c6d' },
            },
          ],
        },
        opts?.title,
        'K 线走势',
      ),
  }),
  def({
    id: 'candlestick-volume',
    categoryId: 'candlestick',
    label: 'K 线 + 成交量',
    hint: '双网格联动',
    chartType: 'candlestick',
    build: (opts) =>
      withTitle(
        {
          title: { text: 'K 线与成交量', left: 'center' },
          tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
          legend: { bottom: 0 },
          grid: [
            { left: 56, right: 24, top: 48, height: '52%' },
            { left: 56, right: 24, top: '72%', height: '16%' },
          ],
          xAxis: [
            { type: 'category', data: DATES, gridIndex: 0 },
            { type: 'category', gridIndex: 1, data: DATES, axisLabel: { show: false } },
          ],
          yAxis: [
            { type: 'value', scale: true, gridIndex: 0, name: '价格' },
            { type: 'value', gridIndex: 1, name: '成交量', splitLine: { show: false } },
          ],
          series: [
            { name: 'K 线', type: 'candlestick', data: OHLC, xAxisIndex: 0, yAxisIndex: 0 },
            {
              name: '成交量',
              type: 'bar',
              xAxisIndex: 1,
              yAxisIndex: 1,
              data: VOLUME,
            },
          ],
        },
        opts?.title,
        'K 线与成交量',
      ),
  }),
  def({
    id: 'candlestick-ma',
    categoryId: 'candlestick',
    label: 'K 线 + 均线',
    hint: '叠加 MA5 / MA10',
    chartType: 'candlestick',
    build: (opts) =>
      withTitle(
        {
          title: { text: 'K 线与均线', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: DATES },
          yAxis: { type: 'value', scale: true },
          series: [
            { name: 'K 线', type: 'candlestick', data: OHLC },
            {
              name: 'MA5',
              type: 'line',
              smooth: true,
              data: OHLC.map((_item, index) =>
                index < 4 ? null : Number((OHLC.slice(index - 4, index + 1).reduce((s, v) => s + v[1], 0) / 5).toFixed(2)),
              ),
            },
          ],
        },
        opts?.title,
        'K 线与均线',
      ),
  }),
]
