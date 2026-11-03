/** 盒须图（boxplot）的属性面板 schema。盒须图：分布统计。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 盒须图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'boxWidth', label: '箱宽', kind: 'number', min: 0, max: 100, step: 1 },
]

/** 盒须图的属性面板 schema。 */
export const boxplotSchema = cartesianSchema('boxplot', '盒须图', {
  seriesTypes: ["boxplot"],
  seriesExtra: SERIES_EXTRA,
})
