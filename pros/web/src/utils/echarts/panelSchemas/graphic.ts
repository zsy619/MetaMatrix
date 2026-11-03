/** 图形组件（graphic）的属性面板 schema。图形组件：叠加文字形状。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 图形组件专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'z', label: '层级', kind: 'number', min: 0, max: 100, step: 1 },
]

/** 图形组件的属性面板 schema。 */
export const graphicSchema = plainSchema('graphic', '图形组件', {
  seriesTypes: ["line","bar"],
  seriesExtra: SERIES_EXTRA,
})
