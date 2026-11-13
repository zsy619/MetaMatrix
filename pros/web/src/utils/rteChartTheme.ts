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
  if (axis.type === 'value' && !lineStyle.type) lineStyle.type = 'dashed'
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
  const next: Record<string, unknown> = { ...legend, textStyle }
  if (!next.icon) next.icon = 'roundRect'
  if (next.itemWidth == null) next.itemWidth = 14
  if (next.itemHeight == null) next.itemHeight = 8
  if (next.itemGap == null) next.itemGap = 16
  if (next.type == null) next.type = 'scroll'
  return next
}

function paintTitle(title: unknown, tone: Tone): unknown {
  if (Array.isArray(title)) return title.map((item) => paintTitle(item, tone))
  if (!isRecord(title)) return title
  const textStyle = isRecord(title.textStyle) ? { ...title.textStyle } : {}
  if (!textStyle.color) textStyle.color = tone.ink
  if (textStyle.fontSize == null) textStyle.fontSize = 15
  if (textStyle.fontWeight == null) textStyle.fontWeight = 700
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

type SeriesLook = { horizontal: boolean; gap: string }

function withItemStyle(item: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const itemStyle = isRecord(item.itemStyle) ? { ...item.itemStyle } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (itemStyle[key] == null) itemStyle[key] = value
  }
  return { ...item, itemStyle }
}

/** 没写过的形状才补。堆叠柱不加圆角，避免中间一段被切圆。 */
function paintSeriesLook(item: Record<string, unknown>, look: SeriesLook): Record<string, unknown> {
  const type = typeof item.type === 'string' ? item.type : ''
  let next = item
  if (type === 'bar' && !next.stack) {
    next = withItemStyle(next, { borderRadius: look.horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] })
    if (next.barMaxWidth == null) next = { ...next, barMaxWidth: 42 }
  }
  if (type === 'line') {
    const lineStyle = isRecord(next.lineStyle) ? { ...next.lineStyle } : {}
    if (lineStyle.width == null) lineStyle.width = 2.5
    next = { ...next, lineStyle }
    if (next.symbolSize == null) next = { ...next, symbolSize: 8 }
  }
  if (type === 'scatter' && next.symbolSize == null) next = { ...next, symbolSize: 12 }
  if (type === 'pie' || type === 'funnel') {
    next = withItemStyle(next, {
      borderColor: look.gap,
      borderWidth: 2,
      ...(type === 'pie' ? { borderRadius: 6 } : {}),
    })
  }
  if (type === 'radar') {
    const lineStyle = isRecord(next.lineStyle) ? { ...next.lineStyle } : {}
    if (lineStyle.width == null) lineStyle.width = 2.2
    next = { ...next, lineStyle }
    if (next.areaStyle == null) next = { ...next, areaStyle: { opacity: 0.16 } }
  }
  if (type === 'sunburst') {
    next = withItemStyle(next, { borderColor: look.gap, borderWidth: 2, borderRadius: 6 })
  }
  if (type === 'treemap') {
    next = withItemStyle(next, { borderColor: look.gap, borderWidth: 2, gapWidth: 2, borderRadius: 4 })
  }
  if (type === 'gauge') {
    const progress = isRecord(next.progress) ? { ...next.progress } : {}
    if (progress.roundCap == null) progress.roundCap = true
    const axisLine = isRecord(next.axisLine) ? { ...next.axisLine } : {}
    const lineStyle = isRecord(axisLine.lineStyle) ? { ...axisLine.lineStyle } : {}
    if (lineStyle.roundCap == null) lineStyle.roundCap = true
    axisLine.lineStyle = lineStyle
    next = { ...next, progress, axisLine }
  }
  if (type === 'boxplot') {
    next = withItemStyle(next, { borderWidth: 1.5 })
  }
  if (next.emphasis == null && !EMPHASIS_SKIP.has(type)) {
    const focus = type === 'pie' || type === 'funnel' || type === 'gauge' ? 'self' : 'series'
    const emphasis: Record<string, unknown> = { focus }
    if (type === 'bar' || type === 'line' || type === 'scatter' || type === 'radar') {
      emphasis.label = { show: true, fontWeight: 700 }
    }
    next = { ...next, emphasis }
  }
  return next
}

function paintSeries(series: unknown, look: SeriesLook): unknown {
  const paint = (item: unknown): unknown => (isRecord(item) ? paintSeriesLook(item, look) : item)
  if (Array.isArray(series)) return series.map(paint)
  return paint(series)
}

function axisKind(axis: unknown): string {
  if (Array.isArray(axis)) return axisKind(axis[0])
  if (isRecord(axis) && typeof axis.type === 'string') return axis.type
  return ''
}

function paintTooltip(tooltip: unknown, tone: Tone, mode: ChartRenderMode): unknown {
  const next = isRecord(tooltip) ? { ...tooltip } : {}
  if (!next.backgroundColor) next.backgroundColor = mode === 'dark' ? '#2a303a' : '#ffffff'
  if (!next.borderColor) next.borderColor = tone.line
  if (next.borderWidth == null) next.borderWidth = 1
  if (next.padding == null) next.padding = [8, 12]
  const textStyle = isRecord(next.textStyle) ? { ...next.textStyle } : {}
  if (!textStyle.color) textStyle.color = tone.ink
  next.textStyle = textStyle
  if (next.trigger === 'axis' && next.axisPointer == null) {
    next.axisPointer = { type: 'line', lineStyle: { color: tone.muted, type: 'dashed' } }
  }
  if (!next.extraCssText) next.extraCssText = 'border-radius:10px;box-shadow:0 8px 24px rgba(32,33,36,.12);'
  return next
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
  if (!textStyle.fontFamily) {
    textStyle.fontFamily = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  }
  next.textStyle = textStyle
  next.tooltip = paintTooltip(option.tooltip, tone, mode)
  if (option.xAxis != null) next.xAxis = paintAxis(option.xAxis, tone)
  if (option.yAxis != null) next.yAxis = paintAxis(option.yAxis, tone)
  if (option.legend != null || mode === 'dark') next.legend = paintLegend(option.legend, tone)
  if (option.title != null) next.title = paintTitle(option.title, tone)
  if (option.radar != null) next.radar = paintRadar(option.radar, tone)
  if (option.series != null) {
    const horizontal = axisKind(option.xAxis) === 'value' && axisKind(option.yAxis) === 'category'
    next.series = paintSeries(option.series, {
      horizontal,
      gap: mode === 'dark' ? CHART_DARK_BG : '#ffffff',
    })
  }
  return next
}
