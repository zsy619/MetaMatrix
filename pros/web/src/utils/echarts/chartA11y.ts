/**
 * 图表无障碍：把 option 里的数据变成「可读文本 + 视觉隐藏数据表」。
 *
 * 背景：ECharts 画出来的是 canvas / svg，屏幕阅读器读不到里面的数据。
 * 这里做两件事：
 * 1. 生成一段人能听懂的摘要（图表类型、标题、系列名、类目、数值），
 *    放进图表容器的 `aria-label`；
 * 2. 生成一张视觉隐藏的数据表（`role="img"` 的兄弟节点，不放在 role="img" 里面，
 *    否则会被当成图片的替代文本吞掉），让读屏用户能逐行读数据。
 *
 * 只覆盖基础图（折线 / 柱 / 饼）；其余类型退化成「系列名 + 数值」的通用摘要。
 */

/** 单个系列在摘要里最多列出的数据项。 */
export const CHART_A11Y_MAX_ITEMS_PER_SERIES = 8
/** 视觉隐藏数据表最多多少行。 */
export const CHART_A11Y_MAX_TABLE_ROWS = 50
/** 摘要文本的最大长度（aria-label 太长反而不好读）。 */
export const CHART_A11Y_MAX_TEXT_LEN = 600

/** 视觉隐藏数据表。 */
export type ChartA11yTable = {
  caption: string
  headers: string[]
  rows: string[][]
}

/** 图表的无障碍摘要。 */
export type ChartA11ySummary = {
  /** 图表类型的中文名（折线图 / 柱状图 / 饼图…）。 */
  chartLabel: string
  /** 放进 `aria-label` 的文本。 */
  ariaLabel: string
  /** 详细描述（视觉隐藏区域的段落文本）。 */
  description: string
  /** 视觉隐藏的数据表；没有可读数据时为 null。 */
  table: ChartA11yTable | null
}

const CHART_TYPE_LABELS: Record<string, string> = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  scatter: '散点图',
  radar: '雷达图',
  candlestick: 'K 线图',
  boxplot: '箱线图',
  heatmap: '热力图',
  graph: '关系图',
  gauge: '仪表盘',
  funnel: '漏斗图',
  sunburst: '旭日图',
  treemap: '矩形树图',
  sankey: '桑基图',
  parallel: '平行坐标系',
  themeRiver: '主题河流图',
  pictorialBar: '象形柱图',
  calendar: '日历图',
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 图表类型的中文名。 */
export function chartTypeLabel(type: string): string {
  return CHART_TYPE_LABELS[type] || '图表'
}

/** 数字转可读文本（非有限数按 0 处理）。 */
function formatNumber(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0'
    return String(Math.round(value * 1e6) / 1e6)
  }
  if (typeof value === 'string') return value.trim()
  return ''
}

/**
 * 取一个数据点的可读值：
 * - 数字 → 数字本身
 * - [x, y] 坐标对 → "x, y"
 * - { name, value } → 名字 + 数值
 */
function readDataPoint(item: unknown): { label: string; value: string } {
  if (typeof item === 'number' || typeof item === 'string') {
    return { label: '', value: formatNumber(item) }
  }
  if (Array.isArray(item)) {
    const cells = item.map((cell) => formatNumber(cell)).filter((cell) => cell !== '')
    return { label: '', value: cells.join('，') }
  }
  if (isPlainObject(item)) {
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const raw = item.value
    let value = ''
    if (Array.isArray(raw)) {
      value = raw.map((cell) => formatNumber(cell)).filter((cell) => cell !== '').join('，')
    } else {
      value = formatNumber(raw)
    }
    if (!value && name) return { label: '', value: name }
    return { label: name, value }
  }
  return { label: '', value: '' }
}

/** 取 xAxis（分类轴）上的类目。 */
function readCategories(option: Record<string, unknown>): string[] {
  const xAxis = option.xAxis
  const axis = Array.isArray(xAxis) ? xAxis[0] : xAxis
  if (!isPlainObject(axis)) return []
  const data = axis.data
  if (!Array.isArray(data)) return []
  return data.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item)
    if (isPlainObject(item) && typeof item.value === 'string') return item.value
    return ''
  })
}

/** 取标题文本。 */
export function readChartTitle(option: Record<string, unknown>): string {
  const title = option.title
  const node = Array.isArray(title) ? title[0] : title
  if (isPlainObject(node) && typeof node.text === 'string') {
    const text = node.text.trim()
    if (text) return text
  }
  if (typeof title === 'string') return title.trim()
  return ''
}

/** 系列里能读出来的数据（名字 + 每一项的值）。 */
type SeriesData = {
  name: string
  type: string
  items: Array<{ label: string; value: string }>
}

function readSeries(option: Record<string, unknown>): SeriesData[] {
  const series = option.series
  if (!Array.isArray(series)) return []
  const out: SeriesData[] = []
  series.forEach((item, index) => {
    if (!isPlainObject(item)) return
    const type = typeof item.type === 'string' ? item.type : ''
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `系列${index + 1}`
    const data = Array.isArray(item.data) ? item.data : []
    const items = data.map((entry) => readDataPoint(entry))
    out.push({ name, type, items })
  })
  return out
}

/**
 * 生成图表的无障碍摘要。
 *
 * - 折线 / 柱（以及其它类目轴图）：按类目逐行列出各系列的数值；
 * - 饼图：按扇区列出「名称 数值」；
 * - 其余类型：退化成「系列名：数值、数值…」。
 *
 * 长数据会被截断，并在文本里说明省略了多少项。
 */
export function buildChartA11ySummary(option: unknown): ChartA11ySummary {
  const opt = isPlainObject(option) ? option : {}
  const series = readSeries(opt)
  const categories = readCategories(opt)
  const title = readChartTitle(opt)
  const chartType = series[0]?.type || 'chart'
  const chartLabel = chartTypeLabel(chartType)

  const parts: string[] = []
  const header = title ? `${chartLabel}「${title}」` : `${chartLabel}`
  parts.push(header)

  const rows: string[][] = []
  let headers: string[] = []

  const isPie = chartType === 'pie'
  if (isPie) {
    headers = ['类目', '数值']
    const pieSeries = series[0]
    const items = pieSeries?.items || []
    parts.push(`共 ${items.length} 个数据项`)
    const shown = items.slice(0, CHART_A11Y_MAX_ITEMS_PER_SERIES)
    shown.forEach((point, index) => {
      const name = point.label || `数据${index + 1}`
      rows.push([name, point.value])
      parts.push(`${name} ${point.value}`)
    })
    if (items.length > shown.length) {
      parts.push(`共 ${items.length} 项，已省略 ${items.length - shown.length} 项`)
    }
  } else if (categories.length) {
    headers = ['类目', ...series.map((item) => item.name)]
    parts.push(`共 ${series.length} 个系列、${categories.length} 个类目`)
    series.forEach((item) => {
      const shown = item.items.slice(0, CHART_A11Y_MAX_ITEMS_PER_SERIES)
      const pairs = shown.map((point, index) => {
        const category = categories[index] || `第${index + 1}项`
        const value = point.value
        return `${category} ${value}`
      })
      parts.push(`${item.name}：${pairs.join('，')}`)
      if (item.items.length > shown.length) {
        parts.push(`${item.name} 共 ${item.items.length} 项，已省略 ${item.items.length - shown.length} 项`)
      }
    })
    const maxRows = Math.min(categories.length, CHART_A11Y_MAX_TABLE_ROWS)
    for (let index = 0; index < maxRows; index += 1) {
      const row = [categories[index] || `第${index + 1}项`]
      series.forEach((item) => {
        const point = item.items[index]
        row.push(point ? point.value : '')
      })
      rows.push(row)
    }
    if (categories.length > maxRows) {
      parts.push(`共 ${categories.length} 个类目，数据表已省略 ${categories.length - maxRows} 行`)
    }
  } else {
    headers = ['系列', '数值']
    parts.push(`共 ${series.length} 个系列`)
    series.forEach((item) => {
      const shown = item.items.slice(0, CHART_A11Y_MAX_ITEMS_PER_SERIES)
      const values = shown.map((point) => point.value)
      parts.push(`${item.name}：${values.join('，')}`)
      if (item.items.length > shown.length) {
        parts.push(`${item.name} 共 ${item.items.length} 项，已省略 ${item.items.length - shown.length} 项`)
      }
    })
    series.forEach((item) => {
      item.items.slice(0, CHART_A11Y_MAX_TABLE_ROWS).forEach((point, index) => {
        rows.push([`${item.name} ${point.label || index + 1}`, point.value])
      })
    })
  }

  const text = parts.join('；')
  const ariaLabel = text.length > CHART_A11Y_MAX_TEXT_LEN
    ? `${text.slice(0, CHART_A11Y_MAX_TEXT_LEN)}……（全文见图表数据表）`
    : text
  const description = ariaLabel

  const table: ChartA11yTable | null = rows.length
    ? {
        caption: title ? `${chartLabel}「${title}」数据表` : `${chartLabel}数据表`,
        headers,
        rows,
      }
    : null

  return { chartLabel, ariaLabel, description, table }
}
