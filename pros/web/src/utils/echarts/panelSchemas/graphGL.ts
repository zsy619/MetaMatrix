/** GL 关系图（graphGL）的属性面板 schema。GL 关系图：GPU 力导向。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** GL 关系图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'lineWidth', label: '连线宽度', kind: 'number', min: 0, max: 20, step: 0.5 },
]

/** GL 关系图的属性面板 schema。 */
export const graphGLSchema = plainSchema('graphGL', 'GL 关系图', {
  seriesTypes: ["graphGL"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const graphGLUsesCanvas = true
