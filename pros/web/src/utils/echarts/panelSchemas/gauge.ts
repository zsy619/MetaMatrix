/** 仪表盘（gauge）的属性面板 schema。仪表盘：单指标刻度。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 仪表盘专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'min', label: '最小值', kind: 'number' },
  { path: 'max', label: '最大值', kind: 'number' },
  { path: 'splitNumber', label: '刻度数', kind: 'number', min: 1, max: 20, step: 1 },
  { path: 'progress.show', label: '显示进度条', kind: 'boolean' },
  { path: 'detail.show', label: '显示详情', kind: 'boolean' },
]

/** 仪表盘的属性面板 schema。 */
export const gaugeSchema = plainSchema('gauge', '仪表盘', {
  seriesTypes: ["gauge"],
  seriesExtra: SERIES_EXTRA,
})
