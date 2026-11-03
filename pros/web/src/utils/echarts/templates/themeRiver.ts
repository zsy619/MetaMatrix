/** 主题河流图（官方类别 themeRiver）：时间轴上的主题占比。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const RIVER_DATA = [
  ['新闻', '2026-01-01', 10, 20],
  ['社交', '2026-01-01', 10, 30],
  ['电商', '2026-01-01', 10, 25],
  ['新闻', '2026-01-02', 10, 24],
  ['社交', '2026-01-02', 10, 34],
  ['电商', '2026-01-02', 10, 22],
  ['新闻', '2026-01-03', 10, 30],
  ['社交', '2026-01-03', 10, 28],
  ['电商', '2026-01-03', 10, 28],
]

export const themeRiverTemplates: EchartsTemplateDef[] = [
  def({
    id: 'themeRiver-basic',
    categoryId: 'themeRiver',
    label: '基础主题河流图',
    hint: '单轴时间流',
    chartType: 'themeRiver',
    build: (opts) =>
      withTitle(
        {
          title: { text: '话题热度', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          singleAxis: { type: 'time' },
          series: [
            {
              name: '话题',
              type: 'themeRiver',
              data: RIVER_DATA,
              itemStyle: { borderWidth: 0 },
            },
          ],
        },
        opts?.title,
        '话题热度',
      ),
  }),
]
