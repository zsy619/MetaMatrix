/** GL 矢量场图（flowGL）的属性面板 schema。GL 矢量场图：GPU 粒子流。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** GL 矢量场图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'particleType', label: '粒子类型', kind: 'text', placeholder: 'line' },
  { path: 'supersampling', label: '超采样', kind: 'number', min: 1, max: 8, step: 1 },
]

/** GL 矢量场图的属性面板 schema。 */
export const flowGLSchema = plainSchema('flowGL', 'GL 矢量场图', {
  seriesTypes: ["flowGL"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const flowGLUsesCanvas = true
