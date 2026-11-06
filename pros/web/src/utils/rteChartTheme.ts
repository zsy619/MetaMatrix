/**
 * 图表渲染用的颜色。只作用于这一次 setOption 的副本。
 * 用户在 option 里写过的 backgroundColor 原样保留，不改文档里的 JSON。
 * 没写背景时，暗色编辑区才换深底和默认文字色。
 */

export const CHART_LIGHT_BG = '#ffffff'
export const CHART_DARK_BG = '#1d2129'
const DARK_INK = '#e5e6eb'
const DARK_MUTED = '#a9aeb8'
const DARK_LINE = '#3a3f47'

export type ChartRenderMode = 'light' | 'dark'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function explicitBackground(option: Record<string, unknown>): string | null {
  const value = option.backgroundColor
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function paintAxis(axis: unknown): unknown {
  if (Array.isArray(axis)) return axis.map(paintAxis)
  if (!isRecord(axis)) return axis
  const label = isRecord(axis.axisLabel) ? { ...axis.axisLabel } : {}
  if (!label.color) label.color = DARK_MUTED
  const split = isRecord(axis.splitLine) ? { ...axis.splitLine } : {}
  const lineStyle = isRecord(split.lineStyle) ? { ...split.lineStyle } : {}
  if (!lineStyle.color) lineStyle.color = DARK_LINE
  split.lineStyle = lineStyle
  return { ...axis, axisLabel: label, splitLine: split }
}

function paintLegend(legend: unknown): unknown {
  if (!isRecord(legend)) return { textStyle: { color: DARK_INK } }
  const textStyle = isRecord(legend.textStyle) ? { ...legend.textStyle } : {}
  if (!textStyle.color) textStyle.color = DARK_INK
  return { ...legend, textStyle }
}

function paintTitle(title: unknown): unknown {
  if (!isRecord(title)) return title
  const textStyle = isRecord(title.textStyle) ? { ...title.textStyle } : {}
  if (!textStyle.color) textStyle.color = DARK_INK
  return { ...title, textStyle }
}

/** 返回新对象。series 仍然指向原来的系列，避免改掉用户数据。 */
export function chartRenderOption(option: Record<string, unknown>, mode: ChartRenderMode): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...option,
    animation: false,
    animationDuration: 0,
  }
  const background = explicitBackground(option)
  if (background) {
    next.backgroundColor = background
    return next
  }
  if (mode !== 'dark') {
    next.backgroundColor = CHART_LIGHT_BG
    return next
  }
  const textStyle = isRecord(option.textStyle) ? { ...option.textStyle } : {}
  if (!textStyle.color) textStyle.color = DARK_INK
  next.backgroundColor = CHART_DARK_BG
  next.textStyle = textStyle
  if (option.xAxis != null) next.xAxis = paintAxis(option.xAxis)
  if (option.yAxis != null) next.yAxis = paintAxis(option.yAxis)
  next.legend = paintLegend(option.legend)
  if (option.title != null) next.title = paintTitle(option.title)
  return next
}
