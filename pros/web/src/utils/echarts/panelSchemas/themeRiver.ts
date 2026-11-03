/** 主题河流图（themeRiver）的属性面板 schema。主题河流图：时间轴占比。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 主题河流图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'singleAxisId', label: '单轴 id', kind: 'text' },
]

/** 主题河流图的属性面板 schema。 */
export const themeRiverSchema = cartesianSchema('themeRiver', '主题河流图', {
  seriesTypes: ["themeRiver"],
  seriesExtra: SERIES_EXTRA,
})
