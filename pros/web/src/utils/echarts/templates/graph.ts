/** 关系图（官方类别 graph）：力导向 / 环形布局 / 有向图。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const NODES = [
  { name: '产品', value: 30 },
  { name: '设计', value: 20 },
  { name: '开发', value: 40 },
  { name: '测试', value: 15 },
  { name: '运营', value: 12 },
  { name: '数据', value: 10 },
]

const LINKS = [
  { source: '产品', target: '设计', value: 8 },
  { source: '产品', target: '开发', value: 10 },
  { source: '设计', target: '开发', value: 6 },
  { source: '开发', target: '测试', value: 9 },
  { source: '开发', target: '数据', value: 4 },
  { source: '测试', target: '运营', value: 3 },
  { source: '数据', target: '运营', value: 2 },
]

export const graphTemplates: EchartsTemplateDef[] = [
  def({
    id: 'graph-force',
    categoryId: 'graph',
    label: '力导向关系图',
    hint: '节点按连线自动布局',
    chartType: 'graph',
    build: (opts) =>
      withTitle(
        {
          title: { text: '协作关系', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '协作关系',
              type: 'graph',
              layout: 'force',
              roam: true,
              draggable: true,
              categories: [{ name: '团队' }],
              force: { repulsion: 220, edgeLength: 90 },
              label: { show: true, position: 'right' },
              lineStyle: { color: 'source', curveness: 0.2 },
              data: NODES,
              links: LINKS,
            },
          ],
        },
        opts?.title,
        '协作关系',
      ),
  }),
  def({
    id: 'graph-circle',
    categoryId: 'graph',
    label: '环形关系图',
    hint: '节点均匀排布成环',
    chartType: 'graph',
    build: (opts) =>
      withTitle(
        {
          title: { text: '环形关系', left: 'center' },
          tooltip: { trigger: 'item' },
          series: [
            {
              name: '环形关系',
              type: 'graph',
              layout: 'circular',
              roam: true,
              label: { show: true, position: 'right' },
              lineStyle: { color: 'source', curveness: 0.3 },
              data: NODES,
              links: LINKS,
            },
          ],
        },
        opts?.title,
        '环形关系',
      ),
  }),
  def({
    id: 'graph-directed',
    categoryId: 'graph',
    label: '有向关系图',
    hint: '带箭头与分类着色',
    chartType: 'graph',
    build: (opts) =>
      withTitle(
        {
          title: { text: '有向关系', left: 'center' },
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              name: '有向关系',
              type: 'graph',
              layout: 'force',
              roam: true,
              categories: [
                { name: '输入' },
                { name: '处理' },
                { name: '输出' },
              ],
              edgeSymbol: ['none', 'arrow'],
              edgeLabel: { show: false },
              label: { show: true },
              lineStyle: { color: 'source', curveness: 0.2 },
              data: NODES.map((node, index) => ({
                ...node,
                category: index % 3,
              })),
              links: LINKS,
            },
          ],
        },
        opts?.title,
        '有向关系',
      ),
  }),
]
