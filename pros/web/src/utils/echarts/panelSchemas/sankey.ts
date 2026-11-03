/** 桑基图（sankey）的属性面板 schema。桑基图：流量流向。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 桑基图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'nodeGap', label: '节点间距', kind: 'number', min: 0, max: 40, step: 1 },
  { path: 'nodeAlign', label: '节点对齐', kind: 'select', options: [{"value":"justify","label":"两端对齐"},{"value":"left","label":"靠左"},{"value":"right","label":"靠右"}] },
  { path: 'orient', label: '方向', kind: 'select', options: [{"value":"horizontal","label":"横向"},{"value":"vertical","label":"纵向"}] },
]

/** 桑基图的属性面板 schema。 */
export const sankeySchema = plainSchema('sankey', '桑基图', {
  seriesTypes: ["sankey"],
  seriesExtra: SERIES_EXTRA,
})
