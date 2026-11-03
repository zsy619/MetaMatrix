/** 数据集（dataset）的属性面板 schema。数据集：多系列共用数据。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 数据集专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'datasetIndex', label: '数据集下标', kind: 'number', min: 0, max: 10, step: 1 },
]

/** 数据集的属性面板 schema。 */
export const datasetSchema = cartesianSchema('dataset', '数据集', {
  seriesTypes: ["bar","line"],
  seriesExtra: SERIES_EXTRA,
})
