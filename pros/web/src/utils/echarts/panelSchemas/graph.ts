/** 关系图（graph）的属性面板 schema。关系图：节点连线。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 关系图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'layout', label: '布局', kind: 'select', options: [{"value":"force","label":"力导向"},{"value":"circular","label":"环形"},{"value":"none","label":"无"}] },
  { path: 'roam', label: '允许缩放拖拽', kind: 'boolean' },
  { path: 'force.layoutAnimation', label: '力导向动画', kind: 'boolean' },
]

/** 关系图的属性面板 schema。 */
export const graphSchema = plainSchema('graph', '关系图', {
  seriesTypes: ["graph"],
  seriesExtra: SERIES_EXTRA,
})
