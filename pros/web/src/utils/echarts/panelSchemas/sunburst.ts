/** 旭日图（sunburst）的属性面板 schema。旭日图：多层占比。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 旭日图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'nodeClick', label: '点击行为', kind: 'select', options: [{"value":"zoomToNode","label":"缩放到节点"},{"value":"rootToNode","label":"返回根"},{"value":"none","label":"无"}] },
  { path: 'radius', label: '半径', kind: 'text', placeholder: '80%' },
]

/** 旭日图的属性面板 schema。 */
export const sunburstSchema = plainSchema('sunburst', '旭日图', {
  seriesTypes: ["sunburst"],
  seriesExtra: SERIES_EXTRA,
})
