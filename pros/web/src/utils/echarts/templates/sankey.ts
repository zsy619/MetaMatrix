/** 桑基图（官方类别 sankey）：基础流向 / 多层。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

export const sankeyTemplates: EchartsTemplateDef[] = [
  def({
    id: 'sankey-basic',
    categoryId: 'sankey',
    label: '基础桑基图',
    hint: '流量流向',
    chartType: 'sankey',
    build: (opts) =>
      withTitle(
        {
          title: { text: '流量去向', left: 'center' },
          tooltip: { trigger: 'item', triggerOn: 'mousemove' },
          series: [
            {
              name: '流量',
              type: 'sankey',
              left: 24,
              right: 120,
              top: 48,
              bottom: 24,
              nodeGap: 12,
              nodeWidth: 14,
              emphasis: { focus: 'adjacency' },
              data: [
                { name: '来源' },
                { name: '中间站' },
                { name: '目标' },
              ],
              links: [
                { source: '来源', target: '中间站', value: 120 },
                { source: '中间站', target: '目标', value: 120 },
              ],
            },
          ],
        },
        opts?.title,
        '流量去向',
      ),
  }),
  def({
    id: 'sankey-multi',
    categoryId: 'sankey',
    label: '多层桑基图',
    hint: '两级汇聚',
    chartType: 'sankey',
    build: (opts) =>
      withTitle(
        {
          title: { text: '订单流向', left: 'center' },
          tooltip: { trigger: 'item', triggerOn: 'mousemove' },
          series: [
            {
              name: '订单',
              type: 'sankey',
              left: 16,
              right: 120,
              top: 48,
              bottom: 24,
              nodeGap: 10,
              nodeAlign: 'justify',
              emphasis: { focus: 'adjacency' },
              levels: [{ depth: 0, itemStyle: { color: '#4a7fb5' } }],
              data: [
                { name: '官网' },
                { name: '小程序' },
                { name: '门店' },
                { name: '直营仓' },
                { name: '第三方仓' },
              ],
              links: [
                { source: '官网', target: '直营仓', value: 60 },
                { source: '官网', target: '第三方仓', value: 40 },
                { source: '小程序', target: '直营仓', value: 90 },
                { source: '门店', target: '第三方仓', value: 70 },
              ],
            },
          ],
        },
        opts?.title,
        '订单流向',
      ),
  }),
]
