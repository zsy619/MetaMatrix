/** 柱状图（bar）的属性面板 schema。柱状图：分类对比。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 柱状图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'barWidth', label: '柱宽', kind: 'number', min: 0, max: 100, step: 1 },
  { path: 'barMaxWidth', label: '最大柱宽', kind: 'number', min: 0, max: 100, step: 1 },
  { path: 'itemStyle.borderRadius', label: '圆角', kind: 'number', min: 0, max: 20, step: 1 },
]

/** 柱状图的属性面板 schema。 */
export const barSchema = cartesianSchema('bar', '柱状图', {
  seriesTypes: ["bar","line"],
  seriesExtra: SERIES_EXTRA,
})
