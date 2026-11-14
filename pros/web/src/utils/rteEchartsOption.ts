/**
 * ECharts 图表块的 option 处理：白名单净化、体积上限、深拷贝、内置模板。
 *
 * 约束（见 docs/rte-feishu-gap.md 与可行性报告）：
 * - option 只能是纯 JSON，不能带函数；
 * - 入库（parseHTML）与渲染（setOption）两处都要过净化器，粘贴路径同样受管；
 * - 白名单覆盖官方示例 39 个类目用到的 series 类型与组件；
 * - 单图 option 体积上限 64KB，数据点上限 5000。
 *
 * 上限语义（与单测一一对应，勿随手改）：
 * - 「数据点」只统计 series 里的数据项：一个数值算 1 点，坐标对 [x, y] 算 2 点。
 *   超过上限直接报错，不做截断。
 * - 任何「被截断」的情况（数组超长、字符串超长、层级过深、系列数超限）
 *   一律按错误返回，绝不静默截断后当成功——用户拿到的图表必须和自己写的一致。
 */
import { optionToDataModel } from './echarts/chartDataTable'
import { ECHARTS_CATEGORIES, ECHARTS_TEMPLATES, findEchartsTemplate } from './echarts/templates'
import { FEISHU_TEXT_COLORS } from './rtePasteClean'
import type { EchartsTemplateDef } from './echarts/types'
import { CUSTOM_RENDER_ITEM_IDS } from './echarts/customRenderItems'

/** 图表类型（官方类别 id，例如 'bar' / 'candlestick' / 'globe'）。 */
export type EchartsChartType = string

/** 工具栏 / 对话框里的类别列表（来自模板目录，39 类）。 */
export const ECHARTS_CHART_TYPES: ReadonlyArray<{
  value: EchartsChartType
  label: string
  hint: string
}> = ECHARTS_CATEGORIES.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))

/** 允许的 series 类型（净化器据此丢弃未知类型）。 */
export const ECHARTS_SERIES_TYPES: readonly string[] = Array.from(
  new Set<string>([
    ...ECHARTS_TEMPLATES.map((item) => item.chartType),
    'bar',
    'line',
    'pie',
    'scatter',
    'radar',
    'effectScatter',
    'candlestick',
    'boxplot',
    'heatmap',
    'graph',
    'lines',
    'tree',
    'treemap',
    'sunburst',
    'parallel',
    'sankey',
    'funnel',
    'gauge',
    'pictorialBar',
    'themeRiver',
    'custom',
    'map',
    'chord',
    // 3D / GL（echarts-gl）
    'bar3D',
    'scatter3D',
    'line3D',
    'lines3D',
    'surface',
    'map3D',
    'scatterGL',
    'linesGL',
    'flowGL',
    'graphGL',
  ]),
)

/** 单个图表 option 的最大字节数（UTF-8）。 */
export const ECHARTS_OPTION_MAX_BYTES = 64 * 1024
/** 单个图表的最大数据点数量。 */
export const ECHARTS_MAX_DATA_POINTS = 5000
/** 单个数组的最大长度。 */
export const ECHARTS_MAX_ARRAY_LEN = 2000
/** 单个字符串的最大长度。 */
export const ECHARTS_MAX_STRING_LEN = 2000
/** 单个 option 的最大系列数。 */
export const ECHARTS_MAX_SERIES = 50
/** option 的最大嵌套深度。 */
export const ECHARTS_MAX_DEPTH = 12
/** 单个文档建议的图表数量上限。 */
export const ECHARTS_MAX_PER_DOCUMENT = 20

/**
 * 一律丢弃的字段：交互出口（不进白名单）。
 *
 * 注意：`aria` 不再整体丢弃——无障碍播报是产品要求，
 * 但只放行白名单里的几个字段（见 ARIA_KEYS / ARIA_LABEL_KEYS / ARIA_DECAL_KEYS），
 * 其余 aria 字段（以及 aria 之外的等价字段）仍然丢弃。
 */
const BANNED_KEYS = new Set(['brush'])

const TOP_LEVEL_KEYS: readonly string[] = [
  'title',
  'subtitle',
  'legend',
  'grid',
  'tooltip',
  'xAxis',
  'yAxis',
  'radar',
  'series',
  'color',
  'backgroundColor',
  'animation',
  'animationDuration',
  'animationDurationUpdate',
  'animationEasing',
  'animationDelay',
  'animationDelayUpdate',
  'textStyle',
  // —— ECharts 6 扩展组件 ——
  'dataset',
  'dataZoom',
  'visualMap',
  'polar',
  'angleAxis',
  'radiusAxis',
  'singleAxis',
  'calendar',
  'parallel',
  'graphic',
  'geo',
  'matrix',
  'toolbox',
  'axisPointer',
  'parallelAxis',
  // —— 3D / GL（echarts-gl）——
  'grid3D',
  'geo3D',
  'globe',
  'xAxis3D',
  'yAxis3D',
  'zAxis3D',
  // —— 无障碍播报（只放行白名单字段，见 sanitizeAria）——
  'aria',
]

/** aria 顶层白名单。 */
const ARIA_KEYS: readonly string[] = ['enabled']
/** aria.label 白名单。 */
const ARIA_LABEL_KEYS: readonly string[] = ['enabled', 'description']
/** aria.decal 白名单。 */
const ARIA_DECAL_KEYS: readonly string[] = ['show']

const STYLE_KEYS: readonly string[] = [
  'color',
  'curveness',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'borderType',
  'borderRadius',
  'width',
  'height',
  'opacity',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textStyle',
  'align',
  'alignWithLabel',
  'verticalAlign',
  'lineHeight',
  'padding',
  'show',
  'type',
  'style',
  'rotate',
  'offset',
  'position',
  'formatter',
  'symbol',
  'symbolSize',
  'symbolRotate',
  'distance',
  'cursor',
  'emphasis',
  'blur',
  'select',
  'animation',
  'animationDuration',
  'lineStyle',
  'areaStyle',
  'itemStyle',
  'shadowBlur',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'decoration',
  'rich',
  'textBorderColor',
  'textBorderWidth',
  'textShadowColor',
  'textShadowBlur',
  'textShadowOffsetX',
  'textShadowOffsetY',
  'overflow',
  'lineOverflow',
]

/** label.rich 里每个富文本样式的白名单。 */
const RICH_KEYS: readonly string[] = [
  'color',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontFamily',
  'backgroundColor',
  'backgroundColor',
  'padding',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'width',
  'height',
  'align',
  'verticalAlign',
  'shadowBlur',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'lineHeight',
  'opacity',
  'textBorderColor',
  'textBorderWidth',
  'textShadowColor',
  'textShadowBlur',
]

/** series 顶层允许的字段（覆盖 39 类用到的所有 series 差异）。 */
const SERIES_KEYS: readonly string[] = [
  // 通用
  'type',
  'name',
  'data',
  'stack',
  'xAxisIndex',
  'yAxisIndex',
  'z',
  'zlevel',
  'silent',
  'showSymbol',
  'symbol',
  'symbolSize',
  'symbolRotate',
  'symbolOffset',
  'symbolPosition',
  'symbolKeepAspect',
  'symbolRepeat',
  'symbolMargin',
  'smooth',
  'step',
  'coordinateSystem',
  'coordinateSystemIndex',
  'geoIndex',
  'calendarIndex',
  'parallelIndex',
  'singleAxisIndex',
  'polarIndex',
  'gridIndex',
  'radius',
  'center',
  'roseType',
  'label',
  'labelLayout',
  'itemStyle',
  'lineStyle',
  'areaStyle',
  'barWidth',
  'barMaxWidth',
  'barMinWidth',
  'barGap',
  'barCategoryGap',
  'clip',
  'clipPath',
  'encode',
  'emphasis',
  'blur',
  'select',
  'animation',
  'animationDuration',
  'animationEasing',
  'animationDelay',
  'universalTransition',
  'markLine',
  'markPoint',
  'markArea',
  'cursor',
  'tooltip',
  'min',
  'max',
  'splitNumber',
  'axisLine',
  'axisTick',
  'splitLine',
  'axisLabel',
  'progress',
  'pointer',
  'detail',
  'title',
  'valueAnimation',
  'showBackground',
  'autoRotate',
  'rotateLabel',
  'alignTo',
  // 关系图 / 树 / 桑基 / 旭日
  'levels',
  'nodes',
  'links',
  'categories',
  'force',
  'layout',
  'roam',
  'draggable',
  'edgeSymbol',
  'edgeLabel',
  'initialTreeDepth',
  'orient',
  'expandAndCollapse',
  'expandable',
  'leafDepth',
  'upperLabel',
  'breadcrumb',
  'nodeGap',
  'nodeAlign',
  'nodeWidth',
  'nodeClick',
  'sort',
  'gap',
  'funnelAlign',
  // 日历 / 平行坐标系 / 主题河流
  'filterMode',
  'cellSize',
  'yearLabel',
  'monthLabel',
  'dayLabel',
  'range',
  'singleAxis',
  'calendar',
  'polygon',
  'diff',
  'transition',
  'boxWidth',
  // 各类图表的专属字段
  'roundCap',
  'map',
  'minSize',
  'rippleEffect',
  'pointSize',
  'blurSize',
  'minOpacity',
  'maxOpacity',
  'polyline',
  'leaves',
  'datasetIndex',
  // custom
  'renderItem',
  'dimensions',
  // 3D / GL
  'dimension3D',
  'grid3D',
  'globe',
  'geo3D',
  'shading',
  'realisticMaterial',
  'light',
  'postEffect',
  'environment',
  'groundPlane',
  'temporalSuperSampling',
  'blendMode',
  'supersampling',
  'progressive',
  'effect',
  'trailLength',
  'lineWidth',
  'barSize',
  'shading',
  'wireframe',
  'viewControl',
  'environment',
  'baseColor',
  'globeRadius',
  'showGraticule',
  'regionHeight',
  'particleType',
  'supersampling',
  'progressive',
  'postEffect',
  'light',
  'realisticMaterial',
  'temporalSuperSampling',
  'groundPlane',
  'dimension3D',
  'minHeight',
  'maxHeight',
  'boxDepth',
]

/** series.data 里每个数据项允许的字段。 */
const DATA_ITEM_KEYS: readonly string[] = [
  'name',
  'value',
  'symbolSize',
  'symbol',
  'itemStyle',
  'label',
  'lineStyle',
  'emphasis',
  'xAxis',
  'yAxis',
  'coord',
  'category',
  'tooltip',
  'id',
  'children',
  'links',
  'coords',
]

const CHILD_KEYS: Record<string, readonly string[]> = {
  title: [
    'text',
    'subtext',
    'left',
    'top',
    'right',
    'bottom',
    'show',
    'textStyle',
    'subtextStyle',
    'itemGap',
    'itemWidth',
    'itemHeight',
    'padding',
    'link',
    'target',
  ],
  subtitle: [
    'text',
    'subtext',
    'left',
    'top',
    'right',
    'bottom',
    'show',
    'textStyle',
    'subtextStyle',
    'itemGap',
    'itemWidth',
    'itemHeight',
    'padding',
  ],
  legend: [
    'show',
    'type',
    'data',
    'left',
    'top',
    'right',
    'bottom',
    'orient',
    'itemGap',
    'itemWidth',
    'itemHeight',
    'icon',
    'textStyle',
    'selected',
    'padding',
    'selectedMode',
    'pageIconColor',
    'pageTextStyle',
    'pageButtonItemGap',
    'scroll',
    'title',
  ],
  grid: [
    'left',
    'right',
    'top',
    'bottom',
    'width',
    'height',
    'containLabel',
    'show',
    'borderColor',
    'borderWidth',
    'backgroundColor',
  ],
  tooltip: [
    'trigger',
    'axis',
    'confine',
    'show',
    'backgroundColor',
    'borderColor',
    'borderWidth',
    'textStyle',
    'valueFormatter',
    'formatter',
    'position',
    'transitionDuration',
    'axisPointer',
    'triggerOn',
    'alwaysShowContent',
    'extraCssText',
    'padding',
    'appendTo',
  ],
  xAxis: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'nameRotate',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'boundaryGap',
    'min',
    'max',
    'interval',
    'log',
    'inverse',
    'show',
    'position',
    'offset',
    'axisPointer',
    'realtime',
    'valueType',
    'color',
    'hideOverlap',
  ],
  yAxis: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'nameRotate',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'boundaryGap',
    'min',
    'max',
    'interval',
    'log',
    'inverse',
    'show',
    'position',
    'offset',
    'axisPointer',
    'realtime',
    'valueType',
    'color',
    'hideOverlap',
  ],
  radar: [
    'indicator',
    'center',
    'radius',
    'splitNumber',
    'axisName',
    'shape',
    'name',
    'splitArea',
    'axisLine',
    'splitLine',
    'startAngle',
    'nameGap',
    'axisNameGap',
  ],
  series: SERIES_KEYS,
  label: STYLE_KEYS,
  subtextStyle: STYLE_KEYS,
  textStyle: STYLE_KEYS,
  nameTextStyle: STYLE_KEYS,
  lineStyle: STYLE_KEYS,
  areaStyle: STYLE_KEYS,
  barStyle: STYLE_KEYS,
  itemStyle: STYLE_KEYS,
  emphasis: STYLE_KEYS,
  blur: STYLE_KEYS,
  select: STYLE_KEYS,
  axisLabel: STYLE_KEYS,
  axisLine: STYLE_KEYS,
  axisTick: STYLE_KEYS,
  splitLine: STYLE_KEYS,
  splitArea: STYLE_KEYS,
  axisPointer: ['type', 'show', 'label', 'lineStyle', 'shadowStyle', 'snap', 'triggerOn', 'status', 'z'],
  markLine: [
    'symbol',
    'symbolSize',
    'lineStyle',
    'label',
    'data',
    'animation',
    'animationDuration',
    'itemStyle',
    'emphasis',
    'silent',
    'precision',
    'z',
  ],
  markPoint: [
    'symbol',
    'symbolSize',
    'symbolRotate',
    'label',
    'data',
    'animation',
    'animationDuration',
    'itemStyle',
    'emphasis',
    'silent',
    'z',
  ],
  markArea: [
    'itemStyle',
    'label',
    'data',
    'animation',
    'animationDuration',
    'emphasis',
    'silent',
    'z',
  ],
  rich: RICH_KEYS,
  // —— 组件 ——
  dataset: ['source', 'dimensions', 'sourceHeader', 'seriesLayout', 'transformations', 'encode', 'fields'],
  transformations: ['type', 'filter', 'map', 'sort', 'reduce', 'options', 'dimension', 'order', 'by', 'as', 'index'],
  dataZoom: [
    'type',
    'start',
    'end',
    'startValue',
    'endValue',
    'xAxisIndex',
    'yAxisIndex',
    'dataZoomIndex',
    'filterMode',
    'show',
    'showDetail',
    'labelFormatter',
    'realtime',
    'rangeMode',
    'handleStyle',
    'moveOnMouseMove',
    'moveOnMouseWheel',
    'zoomOnMouseWheel',
    'preventDefaultMouseMove',
    'dimension',
    'minValueSpan',
    'maxValueSpan',
  ],
  visualMap: [
    'type',
    'min',
    'max',
    'dimension',
    'seriesIndex',
    'calculable',
    'orient',
    'left',
    'top',
    'right',
    'bottom',
    'itemWidth',
    'itemHeight',
    'text',
    'textStyle',
    'inRange',
    'outOfRange',
    'pieces',
    'show',
    'precision',
    'indicator',
    'realtime',
    'handleStyle',
    'formatter',
    'alignLabel',
  ],
  polar: [
    'center',
    'radius',
    'startAngle',
    'endAngle',
    'axisLine',
    'splitLine',
    'splitArea',
    'itemStyle',
    'label',
    'emphasis',
    'angleAxis',
    'radiusAxis',
    'show',
  ],
  angleAxis: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'boundaryGap',
    'min',
    'max',
    'interval',
    'startAngle',
    'endAngle',
    'inverse',
    'show',
    'position',
  ],
  radiusAxis: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'boundaryGap',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
  ],
  singleAxis: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'boundaryGap',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
    'offset',
  ],
  calendar: [
    'range',
    'cellSize',
    'splitLine',
    'itemStyle',
    'orientation',
    'top',
    'left',
    'right',
    'bottom',
    'width',
    'height',
    'yearLabel',
    'monthLabel',
    'dayLabel',
    'show',
  ],
  parallel: [
    'axis',
    'parallelAxis',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'layout',
    'gridSize',
    'merge',
    'axisLabel',
    'name',
    'nameTextStyle',
    'show',
  ],
  graphic: [
    'type',
    'style',
    'left',
    'top',
    'right',
    'bottom',
    'position',
    'width',
    'height',
    'shape',
    'x',
    'y',
    'cx',
    'cy',
    'r',
    'z',
    'zlevel',
    'invisible',
    'silent',
    'keyframeAnimation',
    'children',
    'extra',
    'info',
    'id',
  ],
  geo: [
    'map',
    'roam',
    'zoom',
    'center',
    'layoutCenter',
    'layoutSize',
    'aspectScale',
    'itemStyle',
    'label',
    'emphasis',
    'select',
    'regions',
    'z',
    'zlevel',
    'show',
    'name',
    'boundingCoords',
  ],
  matrix: [
    'x',
    'y',
    'body',
    'corner',
    'backgroundStyle',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'z',
    'triggerEvent',
    'show',
  ],
  toolbox: [
    'show',
    'orient',
    'itemSize',
    'itemGap',
    'itemWidth',
    'itemHeight',
    'left',
    'top',
    'right',
    'bottom',
    'feature',
    'padding',
  ],
  parallelAxis: [
    'dim',
    'name',
    'nameGap',
    'nameTextStyle',
    'type',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
  ],
  // —— 3D / GL 组件 ——
  grid3D: [
    'boxWidth',
    'boxDepth',
    'boxHeight',
    'axisLine',
    'axisLabel',
    'axisTick',
    'splitLine',
    'splitArea',
    'grid3DIndex',
    'viewControl',
    'postEffect',
    'light',
    'groundPlane',
    'environment',
    'zlevel',
    'show',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
  ],
  geo3D: [
    'map',
    'roam',
    'zoom',
    'center',
    'boxWidth',
    'boxDepth',
    'boxHeight',
    'regionHeight',
    'shading',
    'itemStyle',
    'label',
    'emphasis',
    'select',
    'regions',
    'zlevel',
    'show',
    'left',
    'top',
    'right',
    'bottom',
    'viewControl',
    'postEffect',
    'light',
    'groundPlane',
    'environment',
  ],
  globe: [
    'environment',
    'baseColor',
    'baseAmbient',
    'globeRadius',
    'globeRotation',
    'showGraticule',
    'showGroundAtmosphere',
    'atmosphereColor',
    'atmosphereAlpha',
    'viewControl',
    'light',
    'postEffect',
    'temporalSuperSampling',
    'shading',
    'label',
    'itemStyle',
    'zlevel',
    'show',
    'left',
    'top',
    'right',
    'bottom',
  ],
  xAxis3D: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
  ],
  yAxis3D: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
  ],
  zAxis3D: [
    'type',
    'name',
    'nameLocation',
    'nameGap',
    'nameTextStyle',
    'data',
    'axisLabel',
    'axisLine',
    'axisTick',
    'splitLine',
    'splitArea',
    'min',
    'max',
    'interval',
    'inverse',
    'show',
    'position',
  ],
}

export type EchartsSanitizeResult =
  | { ok: true; option: Record<string, unknown>; warnings: string[] }
  | { ok: false; error: string; warnings: string[] }

type SanitizeState = {
  warnings: string[]
  points: number
  /** 被截断的地方：非空即代表数据丢了，最终必须按错误返回。 */
  truncations: string[]
}

function warn(state: SanitizeState, message: string) {
  if (state.warnings.includes(message)) return
  if (state.warnings.length < 20) state.warnings.push(message)
}

/** 记录一次截断。截断＝用户数据丢了，最终一律报错，不当成功。 */
function markTruncated(state: SanitizeState, message: string) {
  warn(state, message)
  if (state.truncations.includes(message)) return
  if (state.truncations.length < 10) state.truncations.push(message)
}

function sanitizeString(raw: string, state: SanitizeState): string {
  const cleaned = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  const lower = cleaned.trim().toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    warn(state, '已移除不安全的链接文本')
    return ''
  }
  if (cleaned.length > ECHARTS_MAX_STRING_LEN) {
    markTruncated(state, `文本超过 ${ECHARTS_MAX_STRING_LEN} 字已被截断`)
    return cleaned.slice(0, ECHARTS_MAX_STRING_LEN)
  }
  return cleaned
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 数据项里的对象字段（symbolSize 等）走通用白名单。 */
function sanitizeDataItemObject(item: Record<string, unknown>, state: SanitizeState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(item)) {
    if (!DATA_ITEM_KEYS.includes(key)) {
      warn(state, `已移除不支持的数据字段：${key}`)
      continue
    }
    if (key === 'value') {
      out.value = sanitizeDataValue(item.value, state)
      continue
    }
    if (key === 'children' || key === 'links') {
      out[key] = sanitizeSeriesData(item[key], state)
      continue
    }
    const childAllowed = CHILD_KEYS[key] ?? null
    const sanitized = sanitizeNode(item[key], childAllowed, state, 1)
    if (sanitized === null && item[key] !== null) continue
    out[key] = sanitized
  }
  return out
}

/** 数据项里的 value：数字 / 数组 / 字符串。 */
function sanitizeDataValue(raw: unknown, state: SanitizeState): unknown {
  if (typeof raw === 'number') {
    state.points += 1
    return Number.isFinite(raw) ? raw : 0
  }
  if (typeof raw === 'string') {
    state.points += 1
    return sanitizeString(raw, state)
  }
  if (Array.isArray(raw)) {
    const arr: unknown[] = []
    for (const cell of raw.slice(0, 32)) {
      if (typeof cell === 'number') {
        state.points += 1
        arr.push(Number.isFinite(cell) ? cell : 0)
      } else if (typeof cell === 'string') {
        state.points += 1
        arr.push(sanitizeString(cell, state))
      } else {
        arr.push(null)
      }
    }
    return arr
  }
  return null
}

function sanitizeSeriesData(raw: unknown, state: SanitizeState): unknown[] {
  if (!Array.isArray(raw)) return []
  const out: unknown[] = []
  // 数据数组按「数据点上限」截断；超出的部分计入总数，由外层报错（不做静默截断）
  const len = Math.min(raw.length, ECHARTS_MAX_DATA_POINTS)
  if (raw.length > len) {
    state.points += raw.length - len
    markTruncated(state, `数据点超过 ${ECHARTS_MAX_DATA_POINTS} 个已被截断`)
  }
  for (let i = 0; i < len; i += 1) {
    const item = raw[i]
    if (typeof item === 'number') {
      state.points += 1
      out.push(Number.isFinite(item) ? item : 0)
      continue
    }
    if (typeof item === 'string') {
      state.points += 1
      out.push(sanitizeString(item, state))
      continue
    }
    if (Array.isArray(item)) {
      const pair: unknown[] = []
      for (const cell of item.slice(0, 8)) {
        if (typeof cell === 'number') {
          state.points += 1
          pair.push(Number.isFinite(cell) ? cell : 0)
        } else if (typeof cell === 'string') {
          state.points += 1
          pair.push(sanitizeString(cell, state))
        } else {
          pair.push(null)
        }
      }
      out.push(pair)
      continue
    }
    if (isPlainObject(item)) {
      out.push(sanitizeDataItemObject(item, state))
      continue
    }
    if (item == null) {
      out.push(null)
      continue
    }
    // 其他类型直接丢弃
  }
  return out
}

function sanitizeSeriesList(raw: unknown, state: SanitizeState): unknown[] {
  if (!Array.isArray(raw)) return []
  const out: unknown[] = []
  const len = Math.min(raw.length, ECHARTS_MAX_SERIES)
  if (raw.length > len) {
    markTruncated(state, `系列数超过 ${ECHARTS_MAX_SERIES} 个已被截断`)
  }
  for (const item of raw.slice(0, len)) {
    if (!isPlainObject(item)) continue
    const type = typeof item.type === 'string' ? item.type : ''
    if (!ECHARTS_SERIES_TYPES.includes(type)) {
      warn(state, `已移除不支持的图表类型：${type || '未知'}`)
      continue
    }
    const sanitized = sanitizeNode(item, SERIES_KEYS, state, 1)
    if (isPlainObject(sanitized)) out.push(sanitized)
  }
  return out
}

/** custom 系列的 renderItem 只允许内置白名单预设名。 */
function sanitizeRenderItem(raw: unknown, state: SanitizeState): string | null {
  if (typeof raw !== 'string') {
    warn(state, '已移除不支持的 renderItem（只允许内置预设）')
    return null
  }
  if (!CUSTOM_RENDER_ITEM_IDS.includes(raw as (typeof CUSTOM_RENDER_ITEM_IDS)[number])) {
    warn(state, '已移除不支持的 renderItem（只允许内置预设）')
    return null
  }
  return raw
}

/**
 * aria（无障碍播报）净化：只保留白名单字段。
 *
 * - aria.enabled：是否开启内置播报；
 * - aria.label.enabled / aria.label.description：是否播报 / 自定义描述；
 * - aria.decal.show：是否给数据图形加纹理（色觉障碍友好）。
 *
 * 其它 aria 字段一律丢弃（aria 是用户可控的 JSON，不能放行任意结构）。
 */
function sanitizeAria(raw: unknown, state: SanitizeState): Record<string, unknown> {
  if (!isPlainObject(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (ARIA_KEYS.includes(key)) {
      if (typeof raw[key] === 'boolean') out[key] = raw[key]
      else warn(state, `已移除不支持的配置：aria.${key}`)
      continue
    }
    if (key === 'label') {
      const label = sanitizeAriaLabel(raw[key], state)
      if (label) out.label = label
      continue
    }
    if (key === 'decal') {
      const decal = sanitizeAriaDecal(raw[key], state)
      if (decal) out.decal = decal
      continue
    }
    warn(state, `已移除不支持的配置：aria.${key}`)
  }
  return out
}

/** aria.label：enabled / description。 */
function sanitizeAriaLabel(raw: unknown, state: SanitizeState): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (!ARIA_LABEL_KEYS.includes(key)) {
      warn(state, `已移除不支持的配置：aria.label.${key}`)
      continue
    }
    if (key === 'enabled') {
      if (typeof raw[key] === 'boolean') out[key] = raw[key]
      continue
    }
    // description 只接受纯文本（对象 / 数组等一律丢弃，不做字符串化）
    if (typeof raw[key] !== 'string') {
      warn(state, `已移除不支持的配置：aria.label.${key}`)
      continue
    }
    const text = sanitizeString(raw[key], state)
    if (text) out[key] = text
  }
  return Object.keys(out).length ? out : null
}

/** aria.decal：show。 */
function sanitizeAriaDecal(raw: unknown, state: SanitizeState): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (!ARIA_DECAL_KEYS.includes(key)) {
      warn(state, `已移除不支持的配置：aria.decal.${key}`)
      continue
    }
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  return Object.keys(out).length ? out : null
}

function sanitizeNode(
  value: unknown,
  allowed: readonly string[] | null,
  state: SanitizeState,
  depth: number,
): unknown {
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return sanitizeString(value, state)
  if (Array.isArray(value)) {
    const len = Math.min(value.length, ECHARTS_MAX_ARRAY_LEN)
    if (value.length > len) {
      markTruncated(state, `数组超过 ${ECHARTS_MAX_ARRAY_LEN} 项已被截断`)
    }
    const out: unknown[] = []
    for (let i = 0; i < len; i += 1) {
      out.push(sanitizeNode(value[i], null, state, depth + 1))
    }
    return out
  }
  if (!isPlainObject(value)) return null
  if (depth > ECHARTS_MAX_DEPTH) {
    markTruncated(state, `层级超过 ${ECHARTS_MAX_DEPTH} 层已被截断`)
    return null
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    if (BANNED_KEYS.has(key)) {
      warn(state, `已移除不支持的配置：${key}`)
      continue
    }
    if (allowed && !allowed.includes(key)) {
      warn(state, `已移除不支持的配置：${key}`)
      continue
    }
    if (key === 'data' && allowed === SERIES_KEYS) {
      out[key] = sanitizeSeriesData(value[key], state)
      continue
    }
    if (key === 'series') {
      out[key] = sanitizeSeriesList(value[key], state)
      continue
    }
    if (key === 'aria') {
      const aria = sanitizeAria(value[key], state)
      if (Object.keys(aria).length) out[key] = aria
      continue
    }
    if (key === 'renderItem') {
      const preset = sanitizeRenderItem(value[key], state)
      if (preset) out[key] = preset
      continue
    }
    if (key === 'rich') {
      out[key] = sanitizeRich(value[key], state, depth)
      continue
    }
    const childAllowed = CHILD_KEYS[key] ?? null
    const sanitized = sanitizeNode(value[key], childAllowed, state, depth + 1)
    if (sanitized === null && value[key] !== null) continue
    out[key] = sanitized
  }
  return out
}

/** label.rich：{ 名称: { 样式 } } */
function sanitizeRich(raw: unknown, state: SanitizeState, depth: number): Record<string, unknown> {
  if (!isPlainObject(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    const name = sanitizeString(key, state)
    if (!name) continue
    const style = raw[key]
    if (!isPlainObject(style)) continue
    const sanitized = sanitizeNode(style, RICH_KEYS, state, depth + 1)
    if (isPlainObject(sanitized)) out[name] = sanitized
  }
  return out
}

/** option 文本的 UTF-8 字节数。 */
export function estimateEchartsOptionBytes(raw: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(raw).length
  return raw.length
}

/**
 * 白名单净化。返回新的对象（深拷贝），非法内容一律丢弃或直接报错。
 */
export function sanitizeEchartsOption(raw: unknown): EchartsSanitizeResult {
  const state: SanitizeState = { warnings: [], points: 0, truncations: [] }
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'option 必须是一个 JSON 对象', warnings: [] }
  }
  const sanitized = sanitizeNode(raw, TOP_LEVEL_KEYS, state, 0)
  if (!isPlainObject(sanitized)) {
    return { ok: false, error: 'option 必须是一个 JSON 对象', warnings: state.warnings }
  }
  const series = sanitized.series
  if (Array.isArray(series)) {
    const kept = series.filter((item) => {
      if (!isPlainObject(item)) return false
      const type = typeof item.type === 'string' ? item.type : ''
      if (!ECHARTS_SERIES_TYPES.includes(type)) {
        warn(state, `已移除不支持的图表类型：${type || '未知'}`)
        return false
      }
      return true
    })
    sanitized.series = kept
  }
  if (state.points > ECHARTS_MAX_DATA_POINTS) {
    return {
      ok: false,
      error: `数据点过多（${state.points} 个，上限 ${ECHARTS_MAX_DATA_POINTS} 个）`,
      warnings: state.warnings,
    }
  }
  if (state.truncations.length) {
    return {
      ok: false,
      error: `option 超出限制已被截断（${state.truncations.join('；')}），请精简后重试`,
      warnings: state.warnings,
    }
  }
  const text = JSON.stringify(sanitized)
  const bytes = estimateEchartsOptionBytes(text)
  if (bytes > ECHARTS_OPTION_MAX_BYTES) {
    return {
      ok: false,
      error: `option 体积过大（${bytes} 字节，上限 ${ECHARTS_OPTION_MAX_BYTES} 字节）`,
      warnings: state.warnings,
    }
  }
  return { ok: true, option: sanitized, warnings: state.warnings }
}

/** 解析并净化 option 文本。JSON 非法时不抛异常，返回可读错误。 */
export function safeParseEchartsOption(raw: unknown): EchartsSanitizeResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'option 必须是 JSON 文本', warnings: [] }
  }
  const text = raw.trim()
  if (!text) {
    return { ok: false, error: 'option 不能为空', warnings: [] }
  }
  if (estimateEchartsOptionBytes(text) > ECHARTS_OPTION_MAX_BYTES) {
    return {
      ok: false,
      error: `option 体积过大（上限 ${ECHARTS_OPTION_MAX_BYTES} 字节）`,
      warnings: [],
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `option JSON 解析失败：${message}`, warnings: [] }
  }
  return sanitizeEchartsOption(parsed)
}

/** 单行 JSON 文本（HTML 属性里不能有换行）。 */
export function serializeEchartsOption(option: unknown): string {
  try {
    return JSON.stringify(option)
  } catch {
    return ''
  }
}

/** 表格数据（从编辑器里的表格抽取）。 */
export type EchartsTableData = {
  headers: string[]
  rows: string[][]
}

function toNumber(value: string): number | null {
  const text = String(value ?? '').trim().replace(/,/g, '')
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

const SAMPLE_LABELS = ['一月', '二月', '三月', '四月', '五月', '六月']

/** 内置示例数据的柱状/折线 option。 */
function categoryOnYAxis(option: Record<string, unknown>): boolean {
  const raw = option.yAxis
  const axes = Array.isArray(raw) ? raw : raw ? [raw] : []
  return axes.some((axis) => {
    if (!isPlainObject(axis)) return false
    if (axis.type === 'value' || axis.type === 'time' || axis.type === 'log') return false
    return axis.type === 'category' || Array.isArray(axis.data)
  })
}

function seriesLabelAt(
  option: Record<string, unknown>,
  index: number,
): { show: true; position?: string; formatter?: string } | undefined {
  const series = option.series
  if (!Array.isArray(series)) return undefined
  const item = series[index]
  if (!isPlainObject(item) || !isPlainObject(item.label) || item.label.show !== true) return undefined
  const label: { show: true; position?: string; formatter?: string } = { show: true }
  if (typeof item.label.position === 'string' && item.label.position.trim()) label.position = item.label.position.trim()
  if (typeof item.label.formatter === 'string') {
    const formatter = item.label.formatter.trim()
    if (formatter && !/javascript:|function\s*\(/i.test(formatter)) label.formatter = formatter
  }
  return label
}

function seriesColorAt(option: Record<string, unknown>, index: number): string | undefined {
  const series = option.series
  if (!Array.isArray(series)) return undefined
  const item = series[index]
  if (!isPlainObject(item)) return undefined
  const style = item.itemStyle
  if (!isPlainObject(style) || typeof style.color !== 'string') return undefined
  const color = style.color.trim()
  if (!color || /url\(|expression\(|javascript:/i.test(color)) return undefined
  return color
}

function seriesStackAt(option: Record<string, unknown>, index: number): string | undefined {
  const series = option.series
  if (!Array.isArray(series)) return undefined
  const item = series[index]
  if (!isPlainObject(item) || typeof item.stack !== 'string') return undefined
  const stack = item.stack.trim()
  return stack || undefined
}

function tooltipLayout(option: Record<string, unknown>): Record<string, unknown> {
  const place: Record<string, unknown> = { trigger: 'axis' }
  const tooltip = option.tooltip
  if (!isPlainObject(tooltip)) return place
  if (tooltip.trigger === 'item' || tooltip.trigger === 'axis' || tooltip.trigger === 'none') place.trigger = tooltip.trigger
  if (typeof tooltip.confine === 'boolean') place.confine = tooltip.confine
  if (typeof tooltip.show === 'boolean') place.show = tooltip.show
  for (const key of ['backgroundColor', 'borderColor'] as const) {
    const value = tooltip[key]
    if (typeof value === 'string' && value.trim() && value.length <= 40 && !/url\(|expression\(/i.test(value)) {
      place[key] = value.trim()
    }
  }
  if (typeof tooltip.borderWidth === 'number' && Number.isFinite(tooltip.borderWidth)) place.borderWidth = tooltip.borderWidth
  return place
}

function gridMargins(option: Record<string, unknown>): Record<string, unknown> | undefined {
  const grid = option.grid
  if (!isPlainObject(grid)) return undefined
  const place: Record<string, unknown> = {}
  for (const key of ['left', 'right', 'top', 'bottom'] as const) {
    const value = grid[key]
    if (typeof value === 'string' && value.trim()) place[key] = value.trim()
    else if (typeof value === 'number' && Number.isFinite(value)) place[key] = value
  }
  if (grid.containLabel === false) place.containLabel = false
  return Object.keys(place).length ? place : undefined
}

function lineLooks(option: Record<string, unknown>): Array<{ straight: boolean; filled: boolean } | null> {
  if (!Array.isArray(option.series)) return []
  return option.series.map((item) => {
    if (!isPlainObject(item) || item.type !== 'line') return null
    return { straight: item.smooth !== true, filled: isPlainObject(item.areaStyle) }
  })
}

function legendLayout(option: Record<string, unknown>): Record<string, unknown> {
  const legend = option.legend
  const place: Record<string, unknown> = {}
  if (isPlainObject(legend)) {
    for (const key of ['left', 'top', 'right', 'bottom', 'orient'] as const) {
      const value = legend[key]
      if (typeof value === 'string' && value.trim()) place[key] = value.trim()
      else if (typeof value === 'number' && Number.isFinite(value)) place[key] = value
    }
  }
  if (!('left' in place) && !('right' in place) && !('top' in place) && !('bottom' in place)) place.bottom = 0
  return place
}

function categoryLabelRotate(option: Record<string, unknown>): number | undefined {
  const axis = categoryOnYAxis(option) ? option.yAxis : option.xAxis
  const node = Array.isArray(axis) ? axis[0] : axis
  if (!isPlainObject(node) || !isPlainObject(node.axisLabel)) return undefined
  const rotate = node.axisLabel.rotate
  if (typeof rotate !== 'number' || !Number.isFinite(rotate) || rotate === 0) return undefined
  return Math.max(-90, Math.min(90, rotate))
}

function valueAxisBounds(option: Record<string, unknown>): { min?: number; max?: number } {
  const axis = categoryOnYAxis(option) ? option.xAxis : option.yAxis
  const node = Array.isArray(axis) ? axis[0] : axis
  if (!isPlainObject(node)) return {}
  const read = (key: 'min' | 'max') => {
    const value = node[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.trim()))) return Number(value.trim())
    return undefined
  }
  const min = read('min')
  const max = read('max')
  if (min != null && max != null && min > max) return {}
  return { min, max }
}

function axisTitle(axis: unknown): string | undefined {
  const node = Array.isArray(axis) ? axis[0] : axis
  if (!isPlainObject(node) || typeof node.name !== 'string') return undefined
  const name = node.name.trim()
  return name || undefined
}

function cartesianAxisNames(option: Record<string, unknown>): { category?: string; value?: string } {
  const horizontal = categoryOnYAxis(option)
  return {
    category: axisTitle(horizontal ? option.yAxis : option.xAxis),
    value: axisTitle(horizontal ? option.xAxis : option.yAxis),
  }
}

function buildCartesianOption(
  type: 'bar' | 'line',
  title: string,
  labels: string[],
  series: Array<{
    name: string
    data: Array<number | null>
    stack?: string
    color?: string
    label?: { show: true; position?: string; formatter?: string }
  }>,
  horizontal = false,
  names?: { category?: string; value?: string },
  bounds?: { min?: number; max?: number },
  categoryRotate?: number,
  legendPlace?: Record<string, unknown>,
  looks?: Array<{ straight: boolean; filled: boolean } | null>,
  margins?: Record<string, unknown>,
  tip?: Record<string, unknown>,
): Record<string, unknown> {
  const category = {
    type: 'category' as const,
    data: labels,
    axisTick: { alignWithLabel: true },
    ...(names?.category ? { name: names.category } : {}),
    ...(categoryRotate != null ? { axisLabel: { rotate: categoryRotate } } : {}),
  }
  const value = {
    type: 'value' as const,
    name: names?.value || '数值',
    ...(bounds?.min != null ? { min: bounds.min } : {}),
    ...(bounds?.max != null ? { max: bounds.max } : {}),
  }
  return {
    color: FEISHU_TEXT_COLORS.filter((item) => item !== '#1f2329' && item !== '#8f959e'),
    title: { text: title, left: 'center' },
    tooltip: tip || { trigger: 'axis' },
    legend: { ...(legendPlace || { bottom: 0 }), data: series.map((item) => item.name) },
    grid: { left: 48, right: 24, top: 48, bottom: 56, containLabel: true, ...(margins || {}) },
    xAxis: horizontal ? value : category,
    yAxis: horizontal ? category : value,
    series: series.map((item, index) => ({
      name: item.name,
      type,
      data: item.data,
      ...(item.stack ? { stack: item.stack } : {}),
      ...(item.color ? { itemStyle: { color: item.color } } : {}),
      ...(item.label ? { label: item.label } : {}),
      smooth: type === 'line' ? looks?.[index]?.straight !== true : undefined,
      areaStyle:
        type === 'line' && (looks?.[index] ? looks[index]!.filled : true) ? { opacity: 0.12 } : undefined,
    })),
  }
}

/**
 * 生成带示例数据的可用 option。
 *
 * type 可以是官方类别 id（'bar' / 'candlestick' …），
 * 也可以是模板 id（'candlestick-volume' …）。
 */
export function buildTemplateOption(
  type: EchartsChartType,
  opts: { title?: string; table?: EchartsTableData | null } = {},
): Record<string, unknown> {
  const title = (opts.title ?? '').trim()
  if (opts.table && opts.table.rows.length) {
    const fromTable = buildOptionFromTable(type, opts.table, title)
    if (fromTable) return fromTable
  }
  const template = findEchartsTemplate(type) || findCategoryFirstTemplate(type)
  if (template) return template.build({ title })
  switch (type) {
    case 'bar':
      return buildCartesianOption('bar', title || '季度销售额', SAMPLE_LABELS.slice(0, 4), [
        { name: '本年', data: [120, 200, 150, 80] },
        { name: '去年', data: [100, 160, 140, 90] },
      ])
    case 'line':
      return buildCartesianOption('line', title || '月度趋势', SAMPLE_LABELS, [
        { name: '新增用户', data: [820, 932, 901, 934, 1290, 1330] },
        { name: '活跃用户', data: [620, 682, 741, 790, 850, 920] },
      ])
    default:
      return buildCartesianOption('bar', title || '示例图表', SAMPLE_LABELS.slice(0, 4), [
        { name: '系列一', data: [120, 200, 150, 80] },
      ])
  }
}

/** 按类别 id 取该类别的第一个模板。 */
export function findCategoryFirstTemplate(categoryId: string): EchartsTemplateDef | null {
  const category = ECHARTS_CATEGORIES.find((item) => item.id === categoryId)
  return category?.templates[0] || null
}

/**
 * 按模板 id 生成 option（带示例数据）。
 *
 * 表格优先：有光标所在表格时用表格数据生成，否则用模板自带的示例数据。
 */
export function buildEchartsTemplateOption(
  templateId: string,
  opts: { title?: string; table?: EchartsTableData | null } = {},
): Record<string, unknown> | null {
  const template = findEchartsTemplate(templateId)
  if (!template) return null
  const title = (opts.title ?? '').trim()
  if (opts.table && opts.table.rows.length) {
    const fromTable = buildOptionFromTable(template.categoryId, opts.table, title)
    if (fromTable) return fromTable
  }
  return template.build({ title })
}

/**
 * 用表格数据生成 option。第一行当表头，第一列当分类轴，其余数值列当系列。
 */
export function buildOptionFromTable(
  type: EchartsChartType,
  table: EchartsTableData,
  title = '',
): Record<string, unknown> | null {
  const headers = (table.headers || []).map((item) => String(item ?? '').trim())
  const rows = (table.rows || []).filter((row) => Array.isArray(row))
  if (!rows.length) return null

  const labels = rows.map((row) => String(row[0] ?? '').trim())
  const numericColumns: Array<{ name: string; data: number[] }> = []
  const startCol = type === 'bar' || type === 'line' ? 1 : 0
  for (let col = startCol; col < headers.length; col += 1) {
    const values = rows.map((row) => toNumber(String(row[col] ?? '')))
    if (values.every((value) => value === null)) continue
    numericColumns.push({
      name: headers[col] || `系列${numericColumns.length + 1}`,
      data: values.map((value) => (value === null ? 0 : value)),
    })
  }

  if (type === 'pie') {
    const data = rows
      .map((row) => ({
        name: String(row[0] ?? '').trim() || '数据',
        value: toNumber(String(row[1] ?? '')) ?? 0,
      }))
      .filter((item) => item.name)
    if (!data.length) return null
    return {
      title: { text: title || '占比构成', left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          name: '占比',
          type: 'pie',
          radius: ['38%', '64%'],
          center: ['50%', '46%'],
          label: { formatter: '{b} {d}%' },
          data,
        },
      ],
    }
  }

  if (type === 'scatter') {
    const pairs: Array<[number, number]> = []
    for (const row of rows) {
      const x = toNumber(String(row[0] ?? ''))
      const y = toNumber(String(row[1] ?? ''))
      if (x === null || y === null) continue
      pairs.push([x, y])
    }
    if (!pairs.length) return null
    return {
      title: { text: title || '相关性分析', left: 'center' },
      tooltip: { trigger: 'item' },
      grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
      xAxis: { type: 'value', name: headers[0] || 'X' },
      yAxis: { type: 'value', name: headers[1] || 'Y' },
      series: [{ name: '样本', type: 'scatter', symbolSize: 12, data: pairs }],
    }
  }

  if (type === 'radar') {
    const indicators = headers
      .filter((name) => !!name)
      .map((name) => ({ name, max: 100 }))
    if (indicators.length < 3) return null
    const data = rows.slice(0, 2).map((row, index) => {
      const values = headers.map((_, col) => toNumber(String(row[col] ?? '')) ?? 0)
      return { name: index === 0 ? '当前' : '对比', value: values }
    })
    return {
      title: { text: title || '多维对比', left: 'center' },
      tooltip: {},
      radar: { indicator: indicators, center: ['50%', '54%'], radius: '62%' },
      series: [{ name: '对比', type: 'radar', data }],
    }
  }

  if (!numericColumns.length) return null
  // 到这里只可能是柱状图或折线图（其余类型上面已提前返回）
  const cartesianType = type === 'line' ? 'line' : 'bar'
  return buildCartesianOption(cartesianType, title || '表格数据', labels, numericColumns)
}

/** 深拷贝（option 走 JSON，天然可序列化）。 */
export function cloneEchartsOption(option: unknown): unknown {
  if (option === null || typeof option !== 'object') return option
  return JSON.parse(JSON.stringify(option))
}

/**
 * 换图表类型：沿用标题，柱状/折线之间切换时尽量保留原数据。
 */
function asChartNumber(value: number | string | null): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value).trim()
  if (!text) return null
  const percent = text.endsWith('%')
  const body = (percent ? text.slice(0, -1) : text).replace(/,/g, '').trim()
  const num = Number(body)
  if (!Number.isFinite(num)) return null
  return percent ? num / 100 : num
}

function buildPieFromModel(
  title: string,
  seriesName: string,
  categories: string[],
  values: Array<number | string>,
): Record<string, unknown> {
  return {
    title: { text: title || '占比构成', left: 'center' },
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        name: seriesName || '占比',
        type: 'pie',
        radius: ['38%', '64%'],
        center: ['50%', '46%'],
        label: { formatter: '{b} {d}%' },
        data: categories.map((name, index) => ({
          name: name || '数据',
          value: asChartNumber(values[index] ?? 0) ?? 0,
        })),
      },
    ],
  }
}

export function retypeEchartsOption(
  option: Record<string, unknown>,
  type: EchartsChartType,
): Record<string, unknown> {
  const parsed = sanitizeEchartsOption(option)
  const base = parsed.ok ? parsed.option : {}
  const titleNode = base.title
  const titleText =
    isPlainObject(titleNode) && typeof titleNode.text === 'string' ? titleNode.text : ''
  const model = optionToDataModel(base)
  const usable = model.categories.length > 0 && model.series.some((item) => item.data.length > 0)
  if (usable && (type === 'bar' || type === 'line')) {
    return buildCartesianOption(
      type,
      titleText || (type === 'line' ? '趋势' : '对比'),
      model.categories,
      model.series.map((item, index) => ({
        name: item.name,
        data: item.data.map((value) => asChartNumber(value)),
        stack: seriesStackAt(base, index),
        color: seriesColorAt(base, index),
        label: seriesLabelAt(base, index),
      })),
      categoryOnYAxis(base),
      cartesianAxisNames(base),
      valueAxisBounds(base),
      categoryLabelRotate(base),
      legendLayout(base),
      lineLooks(base),
      gridMargins(base),
      tooltipLayout(base),
    )
  }
  if (usable && type === 'pie') {
    const first = model.series[0]!
    return buildPieFromModel(titleText, first.name, model.categories, first.data)
  }
  return buildTemplateOption(type, { title: titleText })
}
