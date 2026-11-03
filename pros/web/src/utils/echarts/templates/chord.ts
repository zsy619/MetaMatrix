/**
 * 和弦图（官方类别 chord，ECharts 6.0 新增）。
 *
 * 数据形状：data 是节点（name + value），links 是连线（source/target/value）。
 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const chordTemplates: EchartsTemplateDef[] = [
  def({
    id: 'chord-basic',
    categoryId: 'chord',
    label: '和弦图',
    hint: 'ECharts 6 新增图表',
    chartType: 'chord',
    build: (opts) =>
      withTitle(
        {
          title: { text: '和弦图', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '和弦图',
              type: 'chord',
              data: [
                { name: '产品', value: 30 },
                { name: '研发', value: 40 },
                { name: '设计', value: 20 },
                { name: '运营', value: 25 },
                { name: '市场', value: 15 },
              ],
              links: [
                { source: '产品', target: '研发', value: 12 },
                { source: '产品', target: '设计', value: 8 },
                { source: '研发', target: '运营', value: 15 },
                { source: '设计', target: '市场', value: 6 },
                { source: '运营', target: '市场', value: 9 },
              ],
              nodeWidth: 18,
              nodeGap: 10,
            },
          ],
        },
        opts?.title,
        '和弦图',
      ),
  }),
]
