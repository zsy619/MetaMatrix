/** 3D 散点图（scatter3D）的属性面板 schema。3D 散点图：grid3D 坐标系。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 散点图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'symbolSize', label: '点大小', kind: 'number', min: 1, max: 60, step: 1 },
  { path: 'shading', label: '光照着色', kind: 'select', options: [{"value":"realistic","label":"真实"},{"value":"lambert","label":"兰伯特"},{"value":"color","label":"颜色"}] },
]

/** 3D 散点图的属性面板 schema。 */
export const scatter3DSchema = plainSchema('scatter3D', '3D 散点图', {
  seriesTypes: ["scatter3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const scatter3DUsesCanvas = true
