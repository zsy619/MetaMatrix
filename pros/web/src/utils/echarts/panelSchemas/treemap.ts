/** 矩形树图（treemap）的属性面板 schema。矩形树图：面积占比。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 矩形树图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'nodeGap', label: '节点间距', kind: 'number', min: 0, max: 40, step: 1 },
  { path: 'breadcrumb.show', label: '显示面包屑', kind: 'boolean' },
  { path: 'roam', label: '允许缩放拖拽', kind: 'boolean' },
]

/** 矩形树图的属性面板 schema。 */
export const treemapSchema = plainSchema('treemap', '矩形树图', {
  seriesTypes: ["treemap"],
  seriesExtra: SERIES_EXTRA,
})
