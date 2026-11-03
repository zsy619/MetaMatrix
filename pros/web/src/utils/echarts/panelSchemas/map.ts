/** 地图（map）的属性面板 schema。地图：区域分布（geo 组件参数在高级 JSON 里）。 */
import { plainSchema } from './common'
import type { PanelField } from './types'

/** 地图专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'map', label: '地图名', kind: 'text', hint: '已注册的地图名称，如「中国」' },
  { path: 'roam', label: '允许缩放拖拽', kind: 'boolean' },
  { path: 'label.show', label: '显示地名', kind: 'boolean' },
]

/** 地图的属性面板 schema。 */
export const mapSchema = plainSchema('map', '地理坐标/地图', {
  seriesTypes: ["map"],
  seriesExtra: SERIES_EXTRA,
})
