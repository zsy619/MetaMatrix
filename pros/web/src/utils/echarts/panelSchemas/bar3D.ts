/** 3D 柱状图（bar3D）的属性面板 schema。3D 柱状图：grid3D 坐标系。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 柱状图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'grid3D.boxWidth', label: '3D 盒子宽', kind: 'number', min: 0, max: 200, step: 1 },
  { path: 'grid3D.boxHeight', label: '3D 盒子高', kind: 'number', min: 0, max: 200, step: 1 },
  { path: 'shading', label: '光照着色', kind: 'select', options: [{"value":"realistic","label":"真实"},{"value":"lambert","label":"兰伯特"},{"value":"color","label":"颜色"}] },
]

/** 3D 柱状图的属性面板 schema。 */
export const bar3DSchema = plainSchema('bar3D', '3D 柱状图', {
  seriesTypes: ["bar3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const bar3DUsesCanvas = true
