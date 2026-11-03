/** 漏斗图（官方类别 funnel）：基础 / 排序。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const FUNNEL_DATA = [
  { name: '访问', value: 8600 },
  { name: '注册', value: 3200 },
  { name: '试用', value: 1800 },
  { name: '付费', value: 960 },
]

export const funnelTemplates: EchartsTemplateDef[] = [
  def({
    id: 'funnel-basic',
    categoryId: 'funnel',
    label: '基础漏斗图',
    hint: '转化逐级收窄',
    chartType: 'funnel',
    build: (opts) =>
      withTitle(
        {
          title: { text: '转化漏斗', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '转化',
              type: 'funnel',
              left: '10%',
              right: '10%',
              top: 48,
              bottom: 48,
              minSize: '20%',
              sort: 'descending',
              gap: 2,
              label: { formatter: '{b} {c}' },
              data: FUNNEL_DATA,
            },
          ],
        },
        opts?.title,
        '转化漏斗',
      ),
  }),
  def({
    id: 'funnel-label',
    categoryId: 'funnel',
    label: '带标签漏斗图',
    hint: '显示占比',
    chartType: 'funnel',
    build: (opts) =>
      withTitle(
        {
          title: { text: '转化率漏斗', left: 'center' },
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          series: [
            {
              name: '转化率',
              type: 'funnel',
              left: '10%',
              right: '10%',
              top: 48,
              bottom: 48,
              minSize: '25%',
              sort: 'descending',
              gap: 3,
              label: { position: 'inside', formatter: '{d}%' },
              itemStyle: { borderColor: '#fff', borderWidth: 1 },
              data: FUNNEL_DATA,
            },
          ],
        },
        opts?.title,
        '转化率漏斗',
      ),
  }),
]
