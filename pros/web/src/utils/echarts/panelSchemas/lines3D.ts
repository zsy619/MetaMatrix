/** 3D 路径图（lines3D）的属性面板 schema。3D 路径图：globe 航线。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 路径图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'polyline', label: '折线连接', kind: 'boolean' },
  { path: 'lineWidth', label: '线宽', kind: 'number', min: 0, max: 20, step: 0.5 },
]

/** 3D 路径图的属性面板 schema。 */
export const lines3DSchema = plainSchema('lines3D', '3D 路径图', {
  seriesTypes: ["lines3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const lines3DUsesCanvas = true
