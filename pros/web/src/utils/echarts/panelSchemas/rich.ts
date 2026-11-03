/** 富文本（rich）的属性面板 schema。富文本：label.rich 多样式。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 富文本专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'label.rich', label: '富文本样式(JSON)', kind: 'json', hint: 'label.rich 的 JSON 对象' },
]

/** 富文本的属性面板 schema。 */
export const richSchema = cartesianSchema('rich', '富文本', {
  seriesTypes: ["bar","line"],
  seriesExtra: SERIES_EXTRA,
})
