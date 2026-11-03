/** 散点图（scatter）的属性面板 schema。散点图：相关性与分布。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 散点图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'symbolSize', label: '点大小', kind: 'number', min: 1, max: 60, step: 1 },
]

/** 散点图的属性面板 schema。 */
export const scatterSchema = cartesianSchema('scatter', '散点图', {
  seriesTypes: ["scatter","effectScatter"],
  seriesExtra: SERIES_EXTRA,
})
