/**
 * ECharts 模板目录（catalog）的公共类型。
 *
 * 目录是「工具栏图表分组 / 斜杠命令 / 一键生成对话框」三处共用的唯一数据源，
 * 覆盖官方示例的 39 个类别，每个类别下挂若干典型子类型。
 */

/** 渲染器：GL / 3D 系列只能用 Canvas，常规图表用 SVG。 */
export type EchartsRenderer = 'svg' | 'canvas'

/** 一个可直接插入的图表模板（带示例数据）。 */
export type EchartsTemplateDef = {
  /** 全局唯一 id，例如 'line-smooth-area'。 */
  id: string
  /** 所属官方类别 id，例如 'line'。 */
  categoryId: string
  /** 子类型名称，例如「平滑面积图」。 */
  label: string
  /** 一句话说明，用于菜单提示。 */
  hint: string
  /** 主 series 类型，例如 'line' / 'candlestick' / 'bar3D'。 */
  chartType: string
  /** 渲染器。 */
  renderer: EchartsRenderer
  /** 是否需要 echarts-gl（3D / GL 系列）。 */
  gl: boolean
  /** 生成带示例数据的 option。 */
  build: (opts?: { title?: string }) => Record<string, unknown>
}

/** 官方示例的一个类别（对应 ECharts 示例页的一个分类）。 */
export type EchartsCategory = {
  /** 官方类别 key，例如 'candlestick'。 */
  id: string
  /** 中文类别名，例如「K 线图」。 */
  label: string
  /** 类别说明。 */
  hint: string
  /** 所属分区：常规图表 / 3D·GL（工具栏里分区展示）。 */
  section: 'standard' | 'gl'
  /** 该类别下的子类型模板。 */
  templates: EchartsTemplateDef[]
}
