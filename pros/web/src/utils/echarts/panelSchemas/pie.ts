/** 饼图（pie）的属性面板 schema。饼图：占比构成。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 饼图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'radius', label: '半径', kind: 'text', placeholder: '38%,64%' },
  { path: 'center', label: '圆心', kind: 'text', placeholder: '50%,46%' },
  { path: 'roseType', label: '玫瑰图', kind: 'select', options: [{"value":"radius","label":"半径"},{"value":"area","label":"面积"},{"value":"none","label":"否"}] },
]

/** 饼图的属性面板 schema。 */
export const pieSchema = plainSchema('pie', '饼图', {
  seriesTypes: ["pie"],
  seriesExtra: SERIES_EXTRA,
})
