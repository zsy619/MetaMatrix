/** 象形柱图（pictorialBar）的属性面板 schema。象形柱图：图标柱状。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 象形柱图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'symbol', label: '图标', kind: 'text', placeholder: 'roundRect / image://…' },
  { path: 'symbolRepeat', label: '图标重复', kind: 'boolean' },
  { path: 'symbolMargin', label: '图标间距', kind: 'number', min: 0, max: 40, step: 1 },
]

/** 象形柱图的属性面板 schema。 */
export const pictorialBarSchema = cartesianSchema('pictorialBar', '象形柱图', {
  seriesTypes: ["pictorialBar"],
  seriesExtra: SERIES_EXTRA,
})
