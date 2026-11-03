/** 3D 折线图（line3D）的属性面板 schema。3D 折线图：grid3D 折线。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 折线图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'lineWidth', label: '线宽', kind: 'number', min: 0, max: 20, step: 0.5 },
]

/** 3D 折线图的属性面板 schema。 */
export const line3DSchema = plainSchema('line3D', '3D 折线图', {
  seriesTypes: ["line3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const line3DUsesCanvas = true
