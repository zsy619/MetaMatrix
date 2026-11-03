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
  { path: 'title.text', label: '标题', kind: 'text', placeholder: '图表标题' },
  { path: 'title.subtext', label: '副标题', kind: 'text' },
  { path: 'title.left', label: '标题水平位置', kind: 'text', placeholder: 'center / 12px' },
  { path: 'title.top', label: '标题垂直位置', kind: 'text', placeholder: 'top / 12px' },
  { path: 'legend.show', label: '显示图例', kind: 'boolean' },
  { path: 'legend.orient', label: '图例方向', kind: 'select', options: [
    { value: 'horizontal', label: '横向' },
    { value: 'vertical', label: '纵向' },
  ] },
  { path: 'legend.bottom', label: '图例底部间距', kind: 'text', placeholder: '0' },
  { path: 'tooltip.trigger', label: '提示触发', kind: 'select', options: [
    { value: 'item', label: '数据项' },
    { value: 'axis', label: '坐标轴' },
  ] },
  { path: 'tooltip.confine', label: '提示限制在图内', kind: 'boolean' },
]

export const STYLE_FIELDS: PanelField[] = [
  COLOR_PALETTE_FIELD,
  { path: 'backgroundColor', label: '背景色', kind: 'color' },
  { path: 'textStyle.fontSize', label: '全局字号', kind: 'number', min: 8, max: 72, step: 1 },
  { path: 'animation', label: '开启动画', kind: 'boolean' },
]

export const AXIS_FIELDS: PanelField[] = [
  { path: 'type', label: '轴类型', kind: 'select', options: [
    { value: 'value', label: '数值' },
    { value: 'category', label: '类目' },
    { value: 'time', label: '时间' },
    { value: 'log', label: '对数' },
  ] },
  { path: 'name', label: '轴名称', kind: 'text' },
  { path: 'min', label: '最小值', kind: 'number' },
  { path: 'max', label: '最大值', kind: 'number' },
  { path: 'axisLabel.rotate', label: '标签旋转', kind: 'number', min: -90, max: 90, step: 1 },
  { path: 'axisLabel.show', label: '显示轴标签', kind: 'boolean' },
  { path: 'splitLine.show', label: '显示分隔线', kind: 'boolean' },
]

/** series 段的公共字段。 */
export function seriesFields(extra: PanelField[] = []): PanelField[] {
  return [
    { path: 'name', label: '系列名称', kind: 'text' },
    { path: 'stack', label: '堆叠名', kind: 'text', hint: '同名系列会堆叠' },
    { path: 'symbolSize', label: '符号大小', kind: 'number', min: 0, max: 100, step: 1 },
    { path: 'label.show', label: '显示数据标签', kind: 'boolean' },
    { path: 'lineStyle.width', label: '线宽', kind: 'number', min: 0, max: 20, step: 0.5 },
    { path: 'itemStyle.color', label: '系列颜色', kind: 'color' },
    ...extra,
  ]
}

/** series 类型下拉。 */
export function seriesTypeField(types: readonly string[]): PanelField {
  const options: PanelFieldOption[] = types.map((type) => ({ value: type, label: type }))
  return { path: 'type', label: '系列类型', kind: 'select', options }
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
