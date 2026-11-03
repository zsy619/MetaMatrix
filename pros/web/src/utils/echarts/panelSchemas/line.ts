/** 折线图（line）的属性面板 schema。折线图：时间趋势与多系列对比。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 折线图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'smooth', label: '平滑曲线', kind: 'boolean' },
  { path: 'step', label: '阶梯线', kind: 'boolean' },
  { path: 'areaStyle.opacity', label: '面积透明度', kind: 'number', min: 0, max: 1, step: 0.05 },
]

/** 折线图的属性面板 schema。 */
export const lineSchema = cartesianSchema('line', '折线图', {
  seriesTypes: ["line","bar"],
  seriesExtra: SERIES_EXTRA,
})
