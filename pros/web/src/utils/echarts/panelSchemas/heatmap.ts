/** 热力图（heatmap）的属性面板 schema。热力图：二维密度。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 热力图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'pointSize', label: '点大小', kind: 'number', min: 1, max: 40, step: 1 },
  { path: 'blurSize', label: '模糊大小', kind: 'number', min: 0, max: 40, step: 1 },
]

/** 热力图的属性面板 schema。 */
export const heatmapSchema = cartesianSchema('heatmap', '热力图', {
  seriesTypes: ["heatmap"],
  seriesExtra: SERIES_EXTRA,
})
