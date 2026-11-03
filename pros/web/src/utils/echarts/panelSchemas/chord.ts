/** 和弦图（chord）的属性面板 schema。和弦图：ECharts 6 新增。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 和弦图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'itemStyle.borderWidth', label: '边框宽度', kind: 'number', min: 0, max: 10, step: 1 },
]

/** 和弦图的属性面板 schema。 */
export const chordSchema = plainSchema('chord', '和弦图', {
  seriesTypes: ["chord"],
  seriesExtra: SERIES_EXTRA,
})
