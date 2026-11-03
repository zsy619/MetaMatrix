/** 雷达图（radar）的属性面板 schema。雷达图：多维评分。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 雷达图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'splitNumber', label: '分割环数', kind: 'number', min: 1, max: 10, step: 1 },
  { path: 'shape', label: '形状', kind: 'select', options: [{"value":"polygon","label":"多边形"},{"value":"circle","label":"圆形"}] },
]

/** 雷达图的属性面板 schema。 */
export const radarSchema = plainSchema('radar', '雷达图', {
  seriesTypes: ["radar"],
  seriesExtra: SERIES_EXTRA,
})
