/**
 * 属性面板 schema 的公共字段与构造器。
 *
 * 每个类别文件（line.ts / pie.ts / …）只负责声明「这一类图表能改什么」，
 * 公共字段在这里复用，避免 39 份重复。
 */
import type { PanelField, PanelFieldOption, PanelSection } from './types'

/** 调色板（ECharts 允许数组，这里用 JSON 文本编辑）。 */
export const COLOR_PALETTE_FIELD: PanelField = {
  path: 'color',
  label: '主题色板',
  kind: 'json',
  hint: 'JSON 数组，例如 ["#5470c6","#91cc75"]',
  placeholder: '["#5470c6","#91cc75"]',
}

export const GENERAL_FIELDS: PanelField[] = [
  { path: 'title.text', label: '图上标题', kind: 'text', placeholder: '画在图里的标题' },
  { path: 'title.subtext', label: '副标题', kind: 'text', placeholder: '标题下面的一行小字' },
  { path: 'title.left', label: '标题左右', kind: 'select', options: [
    { value: 'left', label: '居左' },
    { value: 'center', label: '居中' },
    { value: 'right', label: '居右' },
  ] },
  { path: 'title.top', label: '标题上下', kind: 'select', options: [
    { value: 'top', label: '靠上' },
    { value: 'middle', label: '居中' },
    { value: 'bottom', label: '靠下' },
  ] },
  { path: 'legend.show', label: '显示图例', kind: 'boolean' },
  { path: 'legend.orient', label: '图例排列', kind: 'select', options: [
    { value: 'horizontal', label: '横排' },
    { value: 'vertical', label: '竖排' },
  ] },
  { path: 'legend.bottom', label: '图例位置', kind: 'select', options: [
    { value: '0', label: '贴底' },
    { value: '8', label: '略离底部' },
    { value: '36', label: '抬高一截' },
  ] },
  { path: 'tooltip.trigger', label: '悬停提示', kind: 'select', options: [
    { value: 'item', label: '指向单个数据' },
    { value: 'axis', label: '指向整条坐标' },
  ] },
  { path: 'tooltip.confine', label: '提示不超出图表', kind: 'boolean' },
]

export const STYLE_FIELDS: PanelField[] = [
  COLOR_PALETTE_FIELD,
  { path: 'backgroundColor', label: '背景色', kind: 'color' },
  { path: 'textStyle.fontSize', label: '全局字号', kind: 'number', min: 8, max: 72, step: 1 },
  { path: 'animation', label: '开启动画', kind: 'boolean' },
]

export const AXIS_FIELDS: PanelField[] = [
  { path: 'type', label: '刻度类型', kind: 'select', options: [
    { value: 'value', label: '数值' },
    { value: 'category', label: '分类' },
    { value: 'time', label: '时间' },
    { value: 'log', label: '对数' },
  ] },
  { path: 'name', label: '轴标题', kind: 'text', placeholder: '例如：月份' },
  { path: 'min', label: '最小值', kind: 'number' },
  { path: 'max', label: '最大值', kind: 'number' },
  { path: 'axisLabel.rotate', label: '刻度角度', kind: 'number', min: -90, max: 90, step: 15 },
  { path: 'axisLabel.show', label: '显示刻度文字', kind: 'boolean' },
  { path: 'splitLine.show', label: '显示网格线', kind: 'boolean' },
]

const SERIES_TYPE_LABELS: Record<string, string> = {
  bar: '柱状',
  line: '折线',
  pie: '饼图',
  scatter: '散点',
  radar: '雷达',
  effectScatter: '涟漪散点',
  candlestick: 'K 线',
  boxplot: '箱线',
  heatmap: '热力',
  graph: '关系',
  lines: '路径',
  tree: '树',
  treemap: '矩形树',
  sunburst: '旭日',
  parallel: '平行坐标',
  sankey: '桑基',
  funnel: '漏斗',
  gauge: '仪表',
  pictorialBar: '象形柱',
  themeRiver: '主题河流',
  map: '地图',
  custom: '自定义',
}

/** series 段的公共字段。 */
export function seriesFields(extra: PanelField[] = []): PanelField[] {
  return [
    { path: 'name', label: '系列名称', kind: 'text' },
    { path: 'stack', label: '堆叠分组', kind: 'text', hint: '填同一个名字的系列会叠在一起' },
    { path: 'symbolSize', label: '符号大小', kind: 'number', min: 0, max: 100, step: 1 },
    { path: 'label.show', label: '显示数据标签', kind: 'boolean' },
    { path: 'lineStyle.width', label: '线宽', kind: 'number', min: 0, max: 20, step: 0.5 },
    { path: 'itemStyle.color', label: '系列颜色', kind: 'color' },
    ...extra,
  ]
}

/** series 类型下拉。 */
export function seriesTypeField(types: readonly string[]): PanelField {
  const options: PanelFieldOption[] = types.map((type) => ({
    value: type,
    label: SERIES_TYPE_LABELS[type] || type,
  }))
  return { path: 'type', label: '图形', kind: 'select', options }
}

export function section(id: PanelSection['id'], title: string, fields: PanelField[]): PanelSection {
  return { id, title, fields }
}

/** 笛卡尔类（折线 / 柱状 / 散点 …）：通用 + 坐标轴 + 系列 + 样式。 */
export function cartesianSchema(
  id: string,
  label: string,
  opts: { seriesTypes?: readonly string[]; seriesExtra?: PanelField[]; axisExtra?: PanelField[] } = {},
): { id: string; label: string; sections: PanelSection[] } {
  return {
    id,
    label,
    sections: [
      section('general', '通用', [...GENERAL_FIELDS]),
      section('axis', '坐标轴', [...AXIS_FIELDS, ...(opts.axisExtra ?? [])]),
      section('series', '系列', [
        seriesTypeField(opts.seriesTypes ?? ['bar', 'line']),
        ...seriesFields(opts.seriesExtra),
      ]),
      section('style', '样式', [...STYLE_FIELDS]),
    ],
  }
}

/** 无坐标轴类（饼图 / 仪表盘 / 雷达 …）：通用 + 系列 + 样式。 */
export function plainSchema(
  id: string,
  label: string,
  opts: { seriesTypes?: readonly string[]; seriesExtra?: PanelField[]; generalExtra?: PanelField[] } = {},
): { id: string; label: string; sections: PanelSection[] } {
  return {
    id,
    label,
    sections: [
      section('general', '通用', [...GENERAL_FIELDS, ...(opts.generalExtra ?? [])]),
      section('series', '系列', [
        seriesTypeField(opts.seriesTypes ?? ['pie']),
        ...seriesFields(opts.seriesExtra),
      ]),
      section('style', '样式', [...STYLE_FIELDS]),
    ],
  }
}
