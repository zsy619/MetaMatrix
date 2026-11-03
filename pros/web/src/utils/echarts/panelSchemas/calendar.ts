/** 日历坐标系（calendar）的属性面板 schema。日历坐标系：按天展示。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 日历坐标系专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'cellSize', label: '格子尺寸', kind: 'number', min: 4, max: 60, step: 1 },
  { path: 'calendarRange', label: '日期范围', kind: 'text', placeholder: '2024-01-01 ~ 2024-12-31' },
]

/** 日历坐标系的属性面板 schema。 */
export const calendarSchema = plainSchema('calendar', '日历坐标系', {
  seriesTypes: ["heatmap"],
  seriesExtra: SERIES_EXTRA,
})
