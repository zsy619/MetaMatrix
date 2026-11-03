/** 矩阵坐标系（matrix）的属性面板 schema。矩阵坐标系：ECharts 6 新增。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 矩阵坐标系专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'itemStyle.borderWidth', label: '边框宽度', kind: 'number', min: 0, max: 10, step: 1 },
]

/** 矩阵坐标系的属性面板 schema。 */
export const matrixSchema = plainSchema('matrix', '矩阵坐标系', {
  seriesTypes: ["matrix"],
  seriesExtra: SERIES_EXTRA,
})
