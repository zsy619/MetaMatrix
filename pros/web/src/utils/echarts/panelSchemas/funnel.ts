/** 漏斗图（funnel）的属性面板 schema。漏斗图：转化收窄。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 漏斗图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'funnelAlign', label: '对齐', kind: 'select', options: [{"value":"center","label":"居中"},{"value":"left","label":"靠左"},{"value":"right","label":"靠右"}] },
  { path: 'sort', label: '排序', kind: 'select', options: [{"value":"descending","label":"降序"},{"value":"ascending","label":"升序"},{"value":"none","label":"不排序"}] },
]

/** 漏斗图的属性面板 schema。 */
export const funnelSchema = plainSchema('funnel', '漏斗图', {
  seriesTypes: ["funnel"],
  seriesExtra: SERIES_EXTRA,
})
