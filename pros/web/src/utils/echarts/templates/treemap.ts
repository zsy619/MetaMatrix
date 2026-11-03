/** 矩形树图（官方类别 treemap）：基础 / 多层级 / 面包屑。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const TREEMAP_DATA = [
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

export const treemapTemplates: EchartsTemplateDef[] = [
  def({
    id: 'treemap-basic',
    categoryId: 'treemap',
    label: '基础矩形树图',
    hint: '面积映射数值',
    chartType: 'treemap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '人力分布', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '人力分布',
              type: 'treemap',
              roam: false,
              nodeClick: false,
              breadcrumb: { show: true },
              label: { show: true, formatter: '{b}' },
              upperLabel: { show: true },
              itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
              data: TREEMAP_DATA,
            },
          ],
        },
        opts?.title,
        '人力分布',
      ),
  }),
  def({
    id: 'treemap-level',
    categoryId: 'treemap',
    label: '多层矩形树图',
    hint: 'levels 配置层级样式',
    chartType: 'treemap',
    build: (opts) =>
      withTitle(
        {
          title: { text: '预算分配', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '预算分配',
              type: 'treemap',
              roam: false,
              nodeClick: false,
              label: { show: true, formatter: '{b}' },
              upperLabel: { show: true },
              levels: [
                { itemStyle: { borderWidth: 3, borderGap: 2 } },
                { itemStyle: { borderWidth: 1, borderGap: 1 } },
              ],
              data: TREEMAP_DATA,
            },
          ],
        },
        opts?.title,
        '预算分配',
      ),
  }),
]
