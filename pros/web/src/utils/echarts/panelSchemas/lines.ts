/** 路径图（lines）的属性面板 schema。路径图：轨迹流动。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 路径图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'polyline', label: '折线连接', kind: 'boolean' },
  { path: 'effect.show', label: '流动效果', kind: 'boolean' },
]

/** 路径图的属性面板 schema。 */
export const linesSchema = cartesianSchema('lines', '路径图', {
  seriesTypes: ["lines"],
  seriesExtra: SERIES_EXTRA,
})
