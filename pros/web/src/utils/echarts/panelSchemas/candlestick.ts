/** K 线图（candlestick）的属性面板 schema。K 线图：金融行情。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** K 线图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'barMaxWidth', label: '最大柱宽', kind: 'number', min: 0, max: 60, step: 1 },
  { path: 'itemStyle.color', label: '阳线颜色', kind: 'color' },
  { path: 'itemStyle.borderColor', label: '阴线颜色', kind: 'color' },
]

/** K 线图的属性面板 schema。 */
export const candlestickSchema = cartesianSchema('candlestick', 'K 线图', {
  seriesTypes: ["candlestick"],
  seriesExtra: SERIES_EXTRA,
})
