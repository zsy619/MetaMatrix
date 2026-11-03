/** 3D 地图（map3D）的属性面板 schema。3D 地图：geo3D 坐标系。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 地图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'map', label: '地图名', kind: 'text' },
  { path: 'regionHeight', label: '区域高度', kind: 'number', min: 0, max: 20, step: 0.5 },
  { path: 'shading', label: '光照着色', kind: 'select', options: [{"value":"realistic","label":"真实"},{"value":"lambert","label":"兰伯特"},{"value":"color","label":"颜色"}] },
]

/** 3D 地图的属性面板 schema。 */
export const map3DSchema = plainSchema('map3D', '3D 地图', {
  seriesTypes: ["map3D","scatter3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const map3DUsesCanvas = true
