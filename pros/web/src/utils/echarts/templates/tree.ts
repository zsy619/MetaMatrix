/** 树图（官方类别 tree）：基础树 / 横向树 / 指示器。 */
import { def, withTitle } from './helpers'
import type { EchartsTemplateDef } from '../types'

const TREE_DATA = {
  name: '组织架构',
  children: [
    {
      name: '产品部',
      children: [
        { name: '产品经理' },
        { name: '交互设计' },
        { name: '视觉设计' },
      ],
    },
    {
      name: '研发部',
      children: [
        { name: '前端组' },
        { name: '后端组' },
        { name: '测试组' },
      ],
    },
    {
      name: '运营部',
      children: [{ name: '内容运营' }, { name: '用户运营' }],
    },
  ],
}

export const treeTemplates: EchartsTemplateDef[] = [
  def({
    id: 'tree-basic',
    categoryId: 'tree',
    label: '基础树图',
    hint: '层级结构',
    chartType: 'tree',
    build: (opts) =>
      withTitle(
        {
          title: { text: '组织架构', left: 'center' },
          tooltip: { trigger: 'item', triggerOn: 'mousemove' },
          series: [
            {
              name: '组织架构',
              type: 'tree',
              data: [TREE_DATA],
              top: 40,
              left: '6%',
              right: '6%',
              bottom: 24,
              symbolSize: 12,
              itemStyle: { color: '#4a7fb5', borderWidth: 0 },
              label: { position: 'left', verticalAlign: 'middle', align: 'right' },
              leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
              emphasis: { focus: 'descendant' },
              expandAndCollapse: true,
              initialTreeDepth: 3,
              animationDuration: 300,
              animationDurationUpdate: 300,
            },
          ],
        },
        opts?.title,
        '组织架构',
      ),
  }),
  def({
    id: 'tree-horizontal',
    categoryId: 'tree',
    label: '横向树图',
    hint: '从左往右展开',
    chartType: 'tree',
    build: (opts) =>
      withTitle(
        {
          title: { text: '层级结构', left: 'center' },
          tooltip: { trigger: 'item', triggerOn: 'mousemove' },
          series: [
            {
              name: '层级结构',
              type: 'tree',
              data: [TREE_DATA],
              top: 60,
              left: '48%',
              right: '16%',
              bottom: 24,
              orient: 'LR',
              symbolSize: 12,
              label: { position: 'left', verticalAlign: 'middle', align: 'right' },
              leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
              emphasis: { focus: 'descendant' },
              initialTreeDepth: 2,
            },
          ],
        },
        opts?.title,
        '层级结构',
      ),
  }),
]
