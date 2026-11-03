/** GL 路径图（linesGL）的属性面板 schema。GL 路径图：GPU 路径。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** GL 路径图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'lineWidth', label: '线宽', kind: 'number', min: 0, max: 20, step: 0.5 },
]

/** GL 路径图的属性面板 schema。 */
export const linesGLSchema = plainSchema('linesGL', 'GL 路径图', {
  seriesTypes: ["linesGL"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const linesGLUsesCanvas = true
