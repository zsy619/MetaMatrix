/** 数据集（dataset）的属性面板 schema。数据集：多系列共用数据。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 数据集专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'datasetIndex', label: '使用第几份数据', kind: 'number', min: 0, max: 10, step: 1, hint: '从 0 开始，0 是第一份' },
]

/** 数据集的属性面板 schema。 */
export const datasetSchema = cartesianSchema('dataset', '数据集', {
  seriesTypes: ["bar","line"],
  seriesExtra: SERIES_EXTRA,
})
