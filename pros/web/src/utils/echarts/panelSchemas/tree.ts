/** 树图（tree）的属性面板 schema。树图：层级结构。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 树图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'orient', label: '方向', kind: 'select', options: [{"value":"LR","label":"从左到右"},{"value":"RL","label":"从右到左"},{"value":"TB","label":"从上到下"},{"value":"BT","label":"从下到上"}] },
  { path: 'expandAndCollapse', label: '可展开折叠', kind: 'boolean' },
  { path: 'initialTreeDepth', label: '初始展开层级', kind: 'number', min: -1, max: 10, step: 1 },
]

/** 树图的属性面板 schema。 */
export const treeSchema = plainSchema('tree', '树图', {
  seriesTypes: ["tree"],
  seriesExtra: SERIES_EXTRA,
})
