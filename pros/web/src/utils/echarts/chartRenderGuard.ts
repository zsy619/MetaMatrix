/**
 * 渲染前把缺坐标轴的笛卡尔图补齐。
 *
 * 柱状 / 折线等系列默认走直角坐标系。option 里没有 xAxis / yAxis 时，
 * ECharts 会抛出 xAxis "0" not found，编辑区只剩一行红字。
 * 地图、饼图这类不走直角坐标的系列不动。
 */

const NON_CARTESIAN_TYPES = new Set([
  'pie',
  'gauge',
  'funnel',
  'radar',
  'map',
  'map3D',
  'graph',
  'tree',
  'treemap',
  'sunburst',
  'sankey',
  'parallel',
  'themeRiver',
  'chord',
  'lines',
  'lines3D',
  'scatter3D',
  'bar3D',
  'line3D',
  'surface',
  'flowGL',
  'graphGL',
  'scatterGL',
  'linesGL',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function needsCartesian(series: unknown): boolean {
  const list = Array.isArray(series) ? series : isRecord(series) ? [series] : []
  return list.some((item) => {
    if (!isRecord(item)) return false
    const coord = item.coordinateSystem
    if (typeof coord === 'string' && coord !== 'cartesian2d') return false
    const type = typeof item.type === 'string' ? item.type : ''
    return !NON_CARTESIAN_TYPES.has(type)
  })
}

function axisMissing(axis: unknown): boolean {
  if (axis == null) return true
  return Array.isArray(axis) && axis.length === 0
}

/** 直角坐标系列缺轴时补上默认轴。已经有轴、或不走直角坐标的图原样返回。 */
export function ensureRenderableChartOption(option: Record<string, unknown>): Record<string, unknown> {
  if (!needsCartesian(option.series)) return option
  if (!axisMissing(option.xAxis) && !axisMissing(option.yAxis)) return option
  return {
    ...option,
    xAxis: axisMissing(option.xAxis) ? { type: 'category' } : option.xAxis,
    yAxis: axisMissing(option.yAxis) ? { type: 'value' } : option.yAxis,
  }
}
