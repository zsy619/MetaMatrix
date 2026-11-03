/** 旭日图（官方类别 sunburst）：基础 / 多级。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const SUNBURST_DATA = [
  {
    name: '技术',
    value: 480,
    children: [
      { name: '前端', value: 180 },
      { name: '后端', value: 220 },
      { name: '测试', value: 80 },
    ],
  },
  {
    name: '产品',
    value: 260,
    children: [
      { name: '设计', value: 120 },
      { name: '运营', value: 140 },
    ],
  },
  { name: '市场', value: 180 },
]

export const sunburstTemplates: EchartsTemplateDef[] = [
  def({
    id: 'sunburst-basic',
    categoryId: 'sunburst',
    label: '基础旭日图',
    hint: '多层占比',
    chartType: 'sunburst',
    build: (opts) =>
      withTitle(
        {
          title: { text: '人员结构', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '人员结构',
              type: 'sunburst',
              radius: [12, '68%'],
              center: ['50%', '48%'],
              nodeClick: false,
              label: { formatter: '{b}' },
              data: SUNBURST_DATA,
            },
          ],
        },
        opts?.title,
        '人员结构',
      ),
  }),
  def({
    id: 'sunburst-rose',
    categoryId: 'sunburst',
    label: '玫瑰旭日图',
    hint: '多层半径映射',
    chartType: 'sunburst',
    build: (opts) =>
      withTitle(
        {
          title: { text: '多层结构', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '多层结构',
              type: 'sunburst',
              radius: ['8%', '72%'],
              center: ['50%', '48%'],
              nodeClick: false,
              label: { formatter: '{b}' },
              levels: [
                {},
                { itemStyle: { borderWidth: 2, borderColor: '#fff' } },
              ],
              data: SUNBURST_DATA,
            },
          ],
        },
        opts?.title,
        '多层结构',
      ),
  }),
]
