/**
 * 图表数据的「表格 ⇄ JSON」双向同步。
 *
 * 数据模型（ChartDataModel）是中间层：
 * - categories：类目轴（X 轴 / 名称列）的一列文本；
 * - series：每个系列一行，data 与 categories 等长。
 *
 * 表格视图按「行 = 类目，列 = 系列」呈现；JSON 视图就是这个模型的 JSON。
 * 两边任何一侧改动都先落到模型，再写回 ECharts option，因此天然同步。
 */

/** 图表数据模型。 */
export type ChartDataModel = {
  categories: string[]
  series: Array<{ name: string; data: Array<number | string> }>
}

/** 表格视图的行数据。 */
export type ChartDataRow = {
  category: string
  values: Array<number | string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 把一个数据项转成文本。 */
function itemToText(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number' || typeof raw === 'string') return String(raw)
  if (isPlainObject(raw)) {
    if ('value' in raw) return itemToText(raw.value)
    if ('name' in raw) return itemToText(raw.name)
  }
  return String(raw)
}

/** 把文本转回数值 / 文本。 */
export function textToValue(text: string): number | string {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  const num = Number(trimmed)
  if (Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(trimmed)) return num
  return trimmed
}

/** 从 option 抽出数据模型。 */
export function optionToDataModel(option: unknown): ChartDataModel {
  const empty: ChartDataModel = { categories: [], series: [] }
  if (!isPlainObject(option)) return empty
  const seriesRaw = Array.isArray(option.series) ? option.series : []
  const xAxisRaw = option.xAxis
  const xAxisFirst = Array.isArray(xAxisRaw) ? xAxisRaw[0] : xAxisRaw
  const axisCategories =
    isPlainObject(xAxisFirst) && Array.isArray(xAxisFirst.data)
      ? xAxisFirst.data.map((item) => itemToText(item))
      : []

  const series: ChartDataModel['series'] = []
  let categories = axisCategories
  for (const item of seriesRaw) {
    if (!isPlainObject(item)) continue
    const dataRaw = Array.isArray(item.data) ? item.data : []
    const name = typeof item.name === 'string' ? item.name : `系列${series.length + 1}`
    if (dataRaw.length && isPlainObject(dataRaw[0])) {
      // { name, value } 形态：类目来自数据项自身
      const values = dataRaw.map((entry) =>
        isPlainObject(entry) && 'value' in entry ? itemToValue(entry.value) : itemToValue(entry),
      )
      const names = dataRaw.map((entry) =>
        isPlainObject(entry) && 'name' in entry ? itemToText(entry.name) : '',
      )
      if (!categories.length) categories = names
      series.push({ name, data: values })
      continue
    }
    const values = dataRaw.map((entry) => itemToValue(entry))
    if (!categories.length && values.length) {
      categories = values.map((_, index) => String(index + 1))
    }
    series.push({ name, data: values })
  }
  return { categories, series }
}

/**
 * 把数据模型写回 option。
 *
 * - 类目轴存在时写回 xAxis.data；
 * - 类目轴不存在且数据是 { name, value } 形态时，按类目写回数据项的 name。
 */
export function dataModelToOption(
  option: unknown,
  model: ChartDataModel,
): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(option) ? { ...option } : {}
  const seriesRaw = Array.isArray(base.series) ? base.series : []
  const xAxisRaw = base.xAxis
  const xAxisFirst = Array.isArray(xAxisRaw) ? xAxisRaw[0] : xAxisRaw
  const hasAxis = isPlainObject(xAxisFirst)

  const nextSeries = seriesRaw.map((item, index) => {
    if (!isPlainObject(item)) return item
    const target = model.series[index]
    if (!target) return item
    const original = Array.isArray(item.data) ? item.data : []
    const useObjectShape = original.length > 0 && isPlainObject(original[0])
    const data = target.data.map((value, cellIndex) => {
      if (!useObjectShape) return value
      const origin = original[cellIndex]
      const name =
        isPlainObject(origin) && typeof origin.name === 'string'
          ? origin.name
          : model.categories[cellIndex] ?? ''
      return { ...(isPlainObject(origin) ? origin : {}), name, value }
    })
    return { ...item, name: target.name || item.name, data }
  })

  const next: Record<string, unknown> = { ...base, series: nextSeries }
  if (isPlainObject(base.legend) && Array.isArray(base.legend.data)) {
    next.legend = {
      ...base.legend,
      data: model.series.map((item) => item.name).filter(Boolean),
    }
  }
  if (hasAxis && model.categories.length) {
    const axisData = model.categories
    if (Array.isArray(xAxisRaw)) {
      next.xAxis = xAxisRaw.map((item, index) =>
        index === 0 && isPlainObject(item) ? { ...item, data: axisData } : item,
      )
    } else {
      next.xAxis = { ...(xAxisFirst as Record<string, unknown>), data: axisData }
    }
  }
  return next
}

/** 模型 → 表格行。 */
export function dataModelToRows(model: ChartDataModel): ChartDataRow[] {
  const length = Math.max(
    model.categories.length,
    ...model.series.map((item) => item.data.length),
    0,
  )
  const rows: ChartDataRow[] = []
  for (let index = 0; index < length; index += 1) {
    rows.push({
      category: model.categories[index] ?? '',
      values: model.series.map((item) => item.data[index] ?? ''),
    })
  }
  return rows
}

/** 表格行 → 模型（保持系列名，值按文本解析）。 */
export function rowsToDataModel(
  rows: ChartDataRow[],
  seriesNames: string[],
  previous?: ChartDataModel,
): ChartDataModel {
  const names = seriesNames.length
    ? seriesNames
    : previous?.series.map((item) => item.name) || []
  const count = Math.max(names.length, previous?.series.length || 0)
  const series = Array.from({ length: count }, (_, index) => ({
    name: names[index] || previous?.series[index]?.name || `系列${index + 1}`,
    data: rows.map((row) => {
      const raw = row.values[index]
      if (raw === '' || raw === undefined || raw === null) return ''
      return typeof raw === 'number' ? raw : textToValue(String(raw))
    }),
  }))
  return { categories: rows.map((row) => row.category), series }
}

/** 模型 → JSON 文本。 */
export function dataModelToJson(model: ChartDataModel): string {
  return JSON.stringify(model, null, 2)
}

/** 把一个数据项转成「数值保持数值、其余转文本」。 */
function itemToValue(raw: unknown): number | string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return itemToText(raw)
}

/** JSON 文本 → 模型。解析失败返回 null。 */
export function jsonToDataModel(text: string): ChartDataModel | null {
  try {
    const parsed = JSON.parse(text)
    if (!isPlainObject(parsed)) return null
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.map((item) => itemToText(item))
      : []
    const seriesRaw = Array.isArray(parsed.series) ? parsed.series : []
    const series = seriesRaw
      .filter((item): item is Record<string, unknown> => isPlainObject(item))
      .map((item, index) => ({
        name: typeof item.name === 'string' ? item.name : `系列${index + 1}`,
        data: Array.isArray(item.data) ? item.data.map((entry) => itemToValue(entry)) : [],
      }))
    if (!series.length) return null
    return { categories, series }
  } catch {
    return null
  }
}
