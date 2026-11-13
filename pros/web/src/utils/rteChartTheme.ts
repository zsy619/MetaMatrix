/**
 * 图表渲染用的外观。只作用于这一次 setOption 的副本，不写回文档。
 * 用户写过 backgroundColor 时，其余外观保持原样。
 * 没写背景时，补上站点配色、可读的轴和刻度，并把悬停的系列突出来。
 */

export const CHART_LIGHT_BG = '#ffffff'
export const CHART_DARK_BG = '#1d2129'
/** 与引导页六个分类同一套颜色，系列多出来时再补两个。 */
export const CHART_PALETTE = ['#1a73e8', '#34a853', '#a142f4', '#f9a825', '#ea4335', '#00897b'] as const

const DARK_INK = '#e5e6eb'
const DARK_MUTED = '#a9aeb8'
const DARK_LINE = '#3a3f47'

const LIGHT_TONE = { ink: '#202124', muted: '#5f6368', line: '#e8eaed' }
const DARK_TONE = { ink: DARK_INK, muted: DARK_MUTED, line: DARK_LINE }

export type ChartRenderMode = 'light' | 'dark'
/** play：第一次画出来时沿数据方向长出来。still：导出和后续刷新停在终帧。 */
export type ChartMotion = 'play' | 'still'

const EMPHASIS_SKIP = new Set([
  'map',
  'map3D',
  'lines',
  'lines3D',
  'graph',
  'graphGL',
  'tree',
  'treemap',
  'sunburst',
  'sankey',
  'custom',
  'scatterGL',
  'flowGL',
  'surface',
  'chord',
])

type Tone = { ink: string; muted: string; line: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function explicitBackground(option: Record<string, unknown>): string | null {
  const value = option.backgroundColor
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function motionPatch(option: Record<string, unknown>, motion: ChartMotion): Record<string, unknown> {
  if (motion === 'still' || option.animation === false) {
    return { animation: false, animationDuration: 0 }
  }
  const patch: Record<string, unknown> = { animation: true }
  if (typeof option.animationDuration !== 'number') patch.animationDuration = 720
  if (option.animationEasing == null) patch.animationEasing = 'cubicOut'
  if (typeof option.animationDurationUpdate !== 'number') patch.animationDurationUpdate = 420
  return patch
}

function paintAxis(axis: unknown, tone: Tone): unknown {
  if (Array.isArray(axis)) return axis.map((item) => paintAxis(item, tone))
  if (!isRecord(axis)) return axis
  const label = isRecord(axis.axisLabel) ? { ...axis.axisLabel } : {}
  if (!label.color) label.color = tone.muted
  const split = isRecord(axis.splitLine) ? { ...axis.splitLine } : {}
  const lineStyle = isRecord(split.lineStyle) ? { ...split.lineStyle } : {}
  if (!lineStyle.color) lineStyle.color = tone.line
  split.lineStyle = lineStyle
  const next: Record<string, unknown> = { ...axis, axisLabel: label, splitLine: split }
  if (typeof axis.name === 'string' && axis.name) {
    const nameTextStyle = isRecord(axis.nameTextStyle) ? { ...axis.nameTextStyle } : {}
    if (!nameTextStyle.color) nameTextStyle.color = tone.muted
    next.nameTextStyle = nameTextStyle
  }
  return next
}

function paintLegend(legend: unknown, tone: Tone): unknown {
  if (Array.isArray(legend)) return legend.map((item) => paintLegend(item, tone))
  if (!isRecord(legend)) return { textStyle: { color: tone.ink } }
  const textStyle = isRecord(legend.textStyle) ? { ...legend.textStyle } : {}
  if (!textStyle.color) textStyle.color = tone.ink
  return { ...legend, textStyle }
}

function paintTitle(title: unknown, tone: Tone): unknown {
  if (Array.isArray(title)) return title.map((item) => paintTitle(item, tone))
  if (!isRecord(title)) return title
  const textStyle = isRecord(title.textStyle) ? { ...title.textStyle } : {}
  if (!textStyle.color) textStyle.color = tone.ink
  return { ...title, textStyle }
}

function uniformIndicatorMax(indicators: unknown): number | null {
  if (!Array.isArray(indicators) || indicators.length === 0) return null
  let max: number | null = null
  for (const item of indicators) {
    if (!isRecord(item) || typeof item.max !== 'number') return null
    if (max == null) max = item.max
    else if (max !== item.max) return null
  }
  return max
}

function paintRadar(radar: unknown, tone: Tone): unknown {
  if (Array.isArray(radar)) return radar.map((item) => paintRadar(item, tone))
  if (!isRecord(radar)) return radar
  const axisName = isRecord(radar.axisName) ? { ...radar.axisName } : {}
  if (!axisName.color) axisName.color = tone.ink
  // 刻度数字会印在每一条轴上，五条轴叠在圆心里。只给用户自己打开的刻度上色。
  const axisLabel = isRecord(radar.axisLabel) ? { ...radar.axisLabel } : null
  if (axisLabel && !axisLabel.color) axisLabel.color = tone.muted
  const splitLine = isRecord(radar.splitLine) ? { ...radar.splitLine } : {}
  const lineStyle = isRecord(splitLine.lineStyle) ? { ...splitLine.lineStyle } : {}
  if (!lineStyle.color) lineStyle.color = tone.line
  splitLine.lineStyle = lineStyle
  const next: Record<string, unknown> = { ...radar, axisName, splitLine }
  if (axisLabel) next.axisLabel = axisLabel
  if (radar.splitNumber == null && uniformIndicatorMax(radar.indicator) === 100) {
    next.splitNumber = 4
  }
  return next
}

function paintSeries(series: unknown): unknown {
  const paint = (item: unknown): unknown => {
    if (!isRecord(item) || item.emphasis != null) return item
    const type = typeof item.type === 'string' ? item.type : ''
    if (EMPHASIS_SKIP.has(type)) return item
    const focus = type === 'pie' || type === 'funnel' || type === 'gauge' ? 'self' : 'series'
    return { ...item, emphasis: { focus } }
  }
  if (Array.isArray(series)) return series.map(paint)
  return paint(series)
}

/** 返回新对象。用户写进 option 的系列对象本身不被改写。 */
export function chartRenderOption(
  option: Record<string, unknown>,
  mode: ChartRenderMode,
  motion: ChartMotion = 'still',
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...option, ...motionPatch(option, motion) }
  const background = explicitBackground(option)
  if (background) {
    next.backgroundColor = background
    return next
  }
  const tone = mode === 'dark' ? DARK_TONE : LIGHT_TONE
  next.backgroundColor = mode === 'dark' ? CHART_DARK_BG : CHART_LIGHT_BG
  if (option.color == null) next.color = [...CHART_PALETTE]
  const textStyle = isRecord(option.textStyle) ? { ...option.textStyle } : {}
  if (!textStyle.color) textStyle.color = tone.ink
  next.textStyle = textStyle
  if (option.xAxis != null) next.xAxis = paintAxis(option.xAxis, tone)
  if (option.yAxis != null) next.yAxis = paintAxis(option.yAxis, tone)
  if (option.legend != null || mode === 'dark') next.legend = paintLegend(option.legend, tone)
  if (option.title != null) next.title = paintTitle(option.title, tone)
  if (option.radar != null) next.radar = paintRadar(option.radar, tone)
  if (option.series != null) next.series = paintSeries(option.series)
  return next
}
