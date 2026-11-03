/** 平行坐标系（parallel）的属性面板 schema。平行坐标系：多维指标。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 平行坐标系专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'coordinateSystemIndex', label: '坐标系下标', kind: 'number', min: 0, max: 10, step: 1 },
]

/** 平行坐标系的属性面板 schema。 */
export const parallelSchema = plainSchema('parallel', '平行坐标系', {
  seriesTypes: ["parallel"],
  seriesExtra: SERIES_EXTRA,
})
