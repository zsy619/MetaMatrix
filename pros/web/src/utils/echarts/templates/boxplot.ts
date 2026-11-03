/** 盒须图（官方类别 boxplot）：基础 / 分类多组。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

/** [最小值, Q1, 中位数, Q3, 最大值] */
const BOX_A = [
  [12, 20, 28, 35, 44],
  [18, 26, 33, 41, 52],
  [10, 22, 30, 38, 46],
  [15, 24, 29, 36, 48],
  [8, 19, 27, 34, 41],
]

export const boxplotTemplates: EchartsTemplateDef[] = [
  def({
    id: 'boxplot-basic',
    categoryId: 'boxplot',
    label: '基础盒须图',
    hint: '五数概括分布',
    chartType: 'boxplot',
    build: (opts) =>
      withTitle(
        {
          title: { text: '性能分布', left: 'center' },
          tooltip: { trigger: 'item' },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['P50', 'P90', 'P99'] },
          yAxis: { type: 'value', name: '耗时(ms)' },
          series: [
            {
              name: '延迟',
              type: 'boxplot',
              data: [
                [12, 20, 28, 35, 44],
                [18, 26, 33, 41, 52],
                [10, 22, 30, 38, 46],
              ],
            },
          ],
        },
        opts?.title,
        '性能分布',
      ),
  }),
  def({
    id: 'boxplot-multi',
    categoryId: 'boxplot',
    label: '多组盒须图',
    hint: '两个系列并排对比',
    chartType: 'boxplot',
    build: (opts) =>
      withTitle(
        {
          title: { text: '多组分布对比', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          grid: { left: 56, right: 24, top: 48, bottom: 56, containLabel: true },
          xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五'] },
          yAxis: { type: 'value', name: '数值' },
          series: [
            { name: '线上', type: 'boxplot', data: BOX_A },
            {
              name: '线下',
              type: 'boxplot',
              data: BOX_A.map((item) => item.map((value) => Math.round(value * 0.8))),
            },
          ],
        },
        opts?.title,
        '多组分布对比',
      ),
  }),
]
