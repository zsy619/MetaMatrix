/** GL 散点图（scatterGL）的属性面板 schema。GL 散点图：GPU 散点。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** GL 散点图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'pointSize', label: '点大小', kind: 'number', min: 1, max: 60, step: 1 },
  { path: 'blendMode', label: '混合模式', kind: 'text', placeholder: 'lighter' },
]

/** GL 散点图的属性面板 schema。 */
export const scatterGLSchema = plainSchema('scatterGL', 'GL 散点图', {
  seriesTypes: ["scatterGL"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const scatterGLUsesCanvas = true
