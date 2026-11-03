/** 3D 地球（globe）的属性面板 schema。3D 地球：WebGL 地球。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 3D 地球专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'globeRadius', label: '地球半径', kind: 'number', min: 10, max: 300, step: 1 },
  { path: 'shading', label: '光照着色', kind: 'select', options: [{"value":"realistic","label":"真实"},{"value":"lambert","label":"兰伯特"},{"value":"color","label":"颜色"}] },
  { path: 'environment', label: '环境贴图', kind: 'text' },
]

/** 3D 地球的属性面板 schema。 */
export const globeSchema = plainSchema('globe', '3D 地球', {
  seriesTypes: ["scatter3D","line3D"],
  seriesExtra: SERIES_EXTRA,
})

/** 3D / GL 图表只能走 Canvas 渲染器。 */
export const globeUsesCanvas = true
