/** 平行坐标系（官方类别 parallel）：多轴对比 / 多系列对比。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const parallelTemplates: EchartsTemplateDef[] = [
  def({
    id: 'parallel-basic',
    categoryId: 'parallel',
    label: '基础平行坐标系',
    hint: '多条维度轴',
    chartType: 'parallel',
    build: (opts) =>
      withTitle(
        {
          title: { text: '多维指标', left: 'center' },
          tooltip: { trigger: 'axis' },
          parallel: {
            left: 56,
            right: 40,
            top: 56,
            bottom: 40,
            layout: 'horizontal',
            axisLabel: { show: true },
          },
          parallelAxis: [
            { dim: 0, name: '价格' },
            { dim: 1, name: '销量' },
            { dim: 2, name: '毛利率' },
          ],
          series: [
            {
              name: '商品',
              type: 'parallel',
              coordinateSystem: 'parallel',
              data: [
                [12, 320, 0.32],
                [18, 260, 0.41],
                [24, 180, 0.28],
                [32, 410, 0.52],
                [45, 220, 0.36],
              ],
            },
          ],
        },
        opts?.title,
        '多维指标',
      ),
  }),
  def({
    id: 'parallel-multi',
    categoryId: 'parallel',
    label: '多系列平行轴',
    hint: '两个系列同图对比',
    chartType: 'parallel',
    build: (opts) =>
      withTitle(
        {
          title: { text: '多系列平行轴', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          parallel: {
            left: 56,
            right: 40,
            top: 56,
            bottom: 40,
            layout: 'horizontal',
            axisLabel: { show: true },
          },
          parallelAxis: [
            { dim: 0, name: '价格' },
            { dim: 1, name: '销量' },
            { dim: 2, name: '评分' },
          ],
          series: [
            {
              name: '线上',
              type: 'parallel',
              coordinateSystem: 'parallel',
              data: [
                [12, 320, 3.2],
                [18, 260, 4.1],
                [24, 180, 2.8],
                [32, 410, 5.2],
              ],
            },
            {
              name: '线下',
              type: 'parallel',
              coordinateSystem: 'parallel',
              data: [
                [15, 280, 3.6],
                [21, 240, 3.9],
                [28, 200, 3.1],
                [35, 380, 4.6],
              ],
            },
          ],
        },
        opts?.title,
        '多系列平行轴',
      ),
  }),
]
