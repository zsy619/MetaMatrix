/**
 * 图表属性面板的 schema 类型。
 *
 * 一份 schema 描述「某一类图表」在属性面板里能改什么：
 * - general / style 段的字段路径相对整份 option；
 * - axis 段的字段路径相对单个坐标轴对象（xAxis / yAxis 各一份）；
 * - series 段的字段路径相对单个 series 对象。
 *
 * 字段路径用点号写法（'title.text'、'label.show'），
 * 读写由 utils/echarts/chartOptionPath.ts 负责。
 */

/** 字段控件类型。json 表示值是 JSON 文本（数组 / 对象）。 */
export type PanelFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'json'

/** 下拉项。 */
export type PanelFieldOption = {
  value: string
  label: string
}

/** 单个可配置项。 */
export type PanelField = {
  /** 相对路径（点号）。general/style 相对 option，axis 相对坐标轴，series 相对 series。 */
  path: string
  /** 中文标签。 */
  label: string
  kind: PanelFieldKind
  /** kind === 'select' 时的可选项。 */
  options?: PanelFieldOption[]
  /** kind === 'number' 时的取值范围。 */
  min?: number
  max?: number
  step?: number
  placeholder?: string
  /** 面板里的补充说明。 */
  hint?: string
}

/** 面板分区。 */
export type PanelSectionId = 'general' | 'axis' | 'series' | 'style'

/** 一个分区（字段集合）。 */
export type PanelSection = {
  id: PanelSectionId
  title: string
  fields: PanelField[]
}

/** 一类图表的属性面板 schema。 */
export type ChartPanelSchema = {
  /** 图表类别 id，与 ECHARTS_CATEGORIES 的 id 对应。 */
  id: string
  /** 中文名。 */
  label: string
  /** 该类图表有意义的分区。 */
  sections: PanelSection[]
}
