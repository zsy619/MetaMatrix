/** 3D 曲面（surface）的属性面板 schema。3D 曲面：grid3D 曲面。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 曲面专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'grid3D.boxWidth', label: '3D 盒子宽', kind: 'number', min: 0, max: 200, step: 1 },
  { path: 'wireframe', label: '线框', kind: 'boolean' },
]

/** 3D 曲面的属性面板 schema。 */
export const surfaceSchema = plainSchema('surface', '3D 曲面', {
  seriesTypes: ["surface"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const surfaceUsesCanvas = true
