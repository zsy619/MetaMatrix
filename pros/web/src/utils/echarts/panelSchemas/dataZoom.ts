/** 数据区域缩放（dataZoom）的属性面板 schema。数据区域缩放：框选与滑块。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 数据区域缩放专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'dataZoom.0.start', label: '缩放起点(%)', kind: 'number', min: 0, max: 100, step: 1 },
  { path: 'dataZoom.0.end', label: '缩放终点(%)', kind: 'number', min: 0, max: 100, step: 1 },
]

/** 数据区域缩放的属性面板 schema。 */
export const dataZoomSchema = cartesianSchema('dataZoom', '数据区域缩放', {
  seriesTypes: ["bar","line"],
  seriesExtra: SERIES_EXTRA,
})
