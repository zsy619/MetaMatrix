/** 自定义系列（custom）的属性面板 schema。自定义系列：内置 renderItem 预设。 */
import { cartesianSchema } from './common'
import type { PanelField } from './types'

/** 自定义系列专属的系列字段。 */
const SERIES_EXTRA: PanelField[] = [
  { path: 'renderItem', label: '渲染预设名', kind: 'text', hint: '文档里只存预设名，渲染时换成内置函数' },
]

/** 自定义系列的属性面板 schema。 */
export const customSchema = cartesianSchema('custom', '自定义系列', {
  seriesTypes: ["custom","bar","line"],
  seriesExtra: SERIES_EXTRA,
})
