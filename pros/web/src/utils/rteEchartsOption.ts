/**
 * ECharts 图表块的 option 处理：白名单净化、体积上限、深拷贝、内置模板。
 *
 * 约束（见 docs/rte-feishu-gap.md 与可行性报告）：
 * - option 只能是纯 JSON，不能带函数；
 * - 入库（parseHTML）与渲染（setOption）两处都要过净化器，粘贴路径同样受管；
 * - 禁掉会带出交互出口或富文本的字段（toolbox / graphic / markPoint / rich 等）；
 * - 单图 option 体积上限 64KB，数据点上限 5000。
 *
 * 上限语义（与单测一一对应，勿随手改）：
 * - 「数据点」只统计 series 里的数据项：一个数值算 1 点，坐标对 [x, y] 算 2 点。
 *   超过上限直接报错，不做截断。
 * - 任何「被截断」的情况（数组超长、字符串超长、层级过深、系列数超限）
 *   一律按错误返回，绝不静默截断后当成功——用户拿到的图表必须和自己写的一致。
 */

/** 支持的图表类型（与 echartsRuntime 注册的图表一一对应）。 */
export type EchartsChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'radar'

export const ECHARTS_CHART_TYPES: ReadonlyArray<{
  value: EchartsChartType
  label: string
  hint: string
}> = [
  { value: 'bar', label: '柱状图', hint: '分类对比' },
  { value: 'line', label: '折线图', hint: '趋势变化' },
  { value: 'pie', label: '饼图', hint: '占比构成' },
  { value: 'scatter', label: '散点图', hint: '相关性' },
  { value: 'radar', label: '雷达图', hint: '多维评分' },
]

export const ECHARTS_CHART_TYPE_VALUES: readonly EchartsChartType[] = ECHARTS_CHART_TYPES.map(
  (item) => item.value,
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

/** 一律丢弃的字段：交互出口、富文本、可执行内容。 */
const BANNED_KEYS = new Set([
  'toolbox',
  'graphic',
  'markPoint',
  'markArea',
  'rich',
  'dataset',
  'dataZoom',
  'brush',
  'visualMap',
  'polar',
  'singleAxis',
  'calendar',
  'themeRiver',
  'parallel',
  'gantt',
  'funnel',
  'sunburst',
  'treemap',
  'boxplot',
  'candlestick',
  'heatmap',
  'graph',
  'sankey',
  'gauge',
  'pictorialBar',
  'themeRiver',
  'markPoint',
])

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
  'textStyle',
]

const STYLE_KEYS: readonly string[] = [
  'color',
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
  ],
  grid: ['left', 'right', 'top', 'bottom', 'width', 'height', 'containLabel', 'show'],
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
  ],
  xAxis: [
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
  yAxis: [
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
  ],
  series: [
    'type',
    'name',
    'data',
    'stack',
    'yAxisIndex',
    'xAxisIndex',
    'smooth',
    'showSymbol',
    'symbol',
    'symbolSize',
    'radius',
    'center',
    'roseType',
    'coordinateSystem',
    'areaStyle',
    'lineStyle',
    'barStyle',
    'itemStyle',
    'label',
    'emphasis',
    'animation',
    'animationDuration',
    'encode',
    'markLine',
    'z',
    'silent',
  ],
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
  axisPointer: ['type', 'show', 'label', 'lineStyle', 'shadowStyle', 'snap', 'triggerOn'],
  markLine: ['symbol', 'symbolSize', 'lineStyle', 'label', 'data', 'animation', 'animationDuration'],
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
      const obj: Record<string, unknown> = {}
      if (typeof item.name === 'string') obj.name = sanitizeString(item.name, state)
      const value = item.value
      if (Array.isArray(value)) {
        const arr: unknown[] = []
        for (const cell of value.slice(0, 32)) {
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
        obj.value = arr
      } else if (typeof value === 'number') {
        state.points += 1
        obj.value = Number.isFinite(value) ? value : 0
      }
      out.push(obj)
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
    if (!ECHARTS_CHART_TYPE_VALUES.includes(type as EchartsChartType)) {
      warn(state, `已移除不支持的图表类型：${type || '未知'}`)
      continue
    }
    const sanitized = sanitizeNode(item, CHILD_KEYS.series, state, 1)
    if (isPlainObject(sanitized)) out.push(sanitized)
  }
  return out
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
    if (key === 'data' && allowed === CHILD_KEYS.series) {
      out[key] = sanitizeSeriesData(value[key], state)
      continue
    }
    if (key === 'series') {
      out[key] = sanitizeSeriesList(value[key], state)
      continue
    }
    const childAllowed = CHILD_KEYS[key] ?? null
    const sanitized = sanitizeNode(value[key], childAllowed, state, depth + 1)
    if (sanitized === null && value[key] !== null) continue
    out[key] = sanitized
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
      if (!ECHARTS_CHART_TYPE_VALUES.includes(type as EchartsChartType)) {
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
function buildCartesianOption(
  type: 'bar' | 'line',
  title: string,
  labels: string[],
  series: Array<{ name: string; data: number[] }>,
): Record<string, unknown> {
  return {
    title: { text: title, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: series.map((item) => item.name), bottom: 0 },
    grid: { left: 48, right: 24, top: 48, bottom: 56, containLabel: true },
    xAxis: { type: 'category', data: labels, axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value', name: '数值' },
    series: series.map((item) => ({
      name: item.name,
      type,
      data: item.data,
      smooth: type === 'line' ? true : undefined,
      areaStyle: type === 'line' ? { opacity: 0.12 } : undefined,
    })),
  }
}

/**
 * 生成带示例数据的可用 option。
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
    case 'pie':
      return {
        title: { text: title || '渠道占比', left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
          {
            name: '渠道占比',
            type: 'pie',
            radius: ['38%', '64%'],
            center: ['50%', '46%'],
            label: { formatter: '{b} {d}%' },
            data: [
              { name: '直接访问', value: 1048 },
              { name: '搜索引擎', value: 735 },
              { name: '邮件营销', value: 580 },
              { name: '联盟广告', value: 484 },
              { name: '视频广告', value: 300 },
            ],
          },
        ],
      }
    case 'scatter':
      return {
        title: { text: title || '相关性分析', left: 'center' },
        tooltip: { trigger: 'item' },
        grid: { left: 56, right: 24, top: 48, bottom: 48, containLabel: true },
        xAxis: { type: 'value', name: 'X' },
        yAxis: { type: 'value', name: 'Y' },
        series: [
          {
            name: '样本',
            type: 'scatter',
            symbolSize: 12,
            data: [
              [10, 8],
              [18, 15],
              [26, 22],
              [35, 28],
              [42, 36],
              [50, 41],
              [58, 49],
            ],
          },
        ],
      }
    case 'radar':
      return {
        title: { text: title || '能力雷达', left: 'center' },
        tooltip: {},
        radar: {
          indicator: [
            { name: '性能', max: 100 },
            { name: '稳定', max: 100 },
            { name: '易用', max: 100 },
            { name: '安全', max: 100 },
            { name: '成本', max: 100 },
          ],
          center: ['50%', '54%'],
          radius: '62%',
        },
        series: [
          {
            name: '本期',
            type: 'radar',
            data: [{ value: [82, 74, 68, 90, 76] }],
          },
          {
            name: '上期',
            type: 'radar',
            data: [{ value: [70, 66, 72, 80, 84] }],
          },
        ],
      }
    default:
      return buildCartesianOption('bar', title || '示例图表', SAMPLE_LABELS.slice(0, 4), [
        { name: '系列一', data: [120, 200, 150, 80] },
      ])
  }
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
export function retypeEchartsOption(
  option: Record<string, unknown>,
  type: EchartsChartType,
): Record<string, unknown> {
  const parsed = sanitizeEchartsOption(option)
  const base = parsed.ok ? parsed.option : {}
  const titleNode = base.title
  const titleText =
    isPlainObject(titleNode) && typeof titleNode.text === 'string' ? titleNode.text : ''
  const next = buildTemplateOption(type, { title: titleText })
  const oldSeries = Array.isArray(base.series) ? base.series : []
  const newSeries = Array.isArray(next.series) ? (next.series as Array<Record<string, unknown>>) : []
  if ((type === 'bar' || type === 'line') && oldSeries.length && newSeries.length) {
    const first = oldSeries[0]
    if (isPlainObject(first) && Array.isArray(first.data) && first.data.length) {
      newSeries[0].data = first.data
      if (typeof first.name === 'string') newSeries[0].name = first.name
    }
  }
  return next
}
