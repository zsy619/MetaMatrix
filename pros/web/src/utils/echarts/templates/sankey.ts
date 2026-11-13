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
              nodeGap: 14,
              nodeWidth: 16,
              emphasis: { focus: 'adjacency' },
              lineStyle: { color: 'source', curveness: 0.5, opacity: 0.45 },
              label: { color: '#202124', fontSize: 12 },
              data: [
                { name: '广告', itemStyle: { color: '#1a73e8' } },
                { name: '搜索', itemStyle: { color: '#34a853' } },
                { name: '访问', itemStyle: { color: '#a142f4' } },
                { name: '注册', itemStyle: { color: '#f9a825' } },
                { name: '付费', itemStyle: { color: '#ea4335' } },
              ],
              links: [
                { source: '广告', target: '访问', value: 80 },
                { source: '搜索', target: '访问', value: 50 },
                { source: '访问', target: '注册', value: 90 },
                { source: '访问', target: '付费', value: 40 },
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
              nodeGap: 12,
              nodeWidth: 16,
              nodeAlign: 'justify',
              emphasis: { focus: 'adjacency' },
              lineStyle: { color: 'source', curveness: 0.5, opacity: 0.45 },
              label: { color: '#202124', fontSize: 12 },
              data: [
                { name: '官网', itemStyle: { color: '#1a73e8' } },
                { name: '小程序', itemStyle: { color: '#34a853' } },
                { name: '门店', itemStyle: { color: '#f9a825' } },
                { name: '直营仓', itemStyle: { color: '#a142f4' } },
                { name: '第三方仓', itemStyle: { color: '#ea4335' } },
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
