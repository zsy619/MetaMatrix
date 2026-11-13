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

/** 把文本转回数值 / 文本。千分位和百分号按数字处理。 */
export function textToValue(text: string): number | string {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  const percent = trimmed.endsWith('%')
  const body = (percent ? trimmed.slice(0, -1) : trimmed).replace(/,/g, '').trim()
  if (/^-?\d+(\.\d+)?$/.test(body)) {
    const num = Number(body)
    return percent ? num / 100 : num
  }
  return trimmed
}

function axisEntries(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isPlainObject)
  return isPlainObject(raw) ? [raw] : []
}

function isCategoryAxis(axis: Record<string, unknown>): boolean {
  if (axis.type === 'value' || axis.type === 'time' || axis.type === 'log') return false
  return axis.type === 'category' || Array.isArray(axis.data)
}

/** 类目在横轴，或只在纵轴（横向柱状图）。 */
function readCategoryAxis(
  option: Record<string, unknown>,
): { key: 'xAxis' | 'yAxis'; index: number; categories: string[] } | null {
  for (const key of ['xAxis', 'yAxis'] as const) {
    const axes = axisEntries(option[key])
    for (let index = 0; index < axes.length; index += 1) {
      const axis = axes[index]!
      if (!isCategoryAxis(axis) || !Array.isArray(axis.data)) continue
      if (key === 'yAxis' && axis.type !== 'category') continue
      return { key, index, categories: axis.data.map((item) => itemToText(item)) }
    }
  }
  return null
}

function asValueList(raw: unknown): Array<number | string> | null {
  if (!Array.isArray(raw) || !raw.length) return null
  if (raw.some((item) => Array.isArray(item) || isPlainObject(item))) return null
  return raw.map((item) => itemToValue(item))
}

function isRadarChart(option: Record<string, unknown>, seriesRaw: unknown[]): boolean {
  if (option.radar) return true
  return seriesRaw.some((item) => isPlainObject(item) && item.type === 'radar')
}

function radarIndicatorList(option: Record<string, unknown>): unknown[] {
  const radar = option.radar
  const node = Array.isArray(radar) ? radar.find(isPlainObject) : isPlainObject(radar) ? radar : null
  if (!node || !Array.isArray(node.indicator)) return []
  return node.indicator
}

function indicatorName(item: unknown, index: number): string {
  if (typeof item === 'string' && item.trim()) return item.trim()
  if (isPlainObject(item)) {
    const name = itemToText(item.name).trim()
    if (name) return name
  }
  return `指标${index + 1}`
}

function radarEntryValues(entry: unknown): Array<number | string> | null {
  if (isPlainObject(entry)) return asValueList(entry.value)
  return asValueList(entry)
}

/** 雷达图：指标是行，每个数据项是一列。数值保持数组，不压成一段文本。 */
function readRadarModel(option: Record<string, unknown>, seriesRaw: unknown[]): ChartDataModel | null {
  const vectors: ChartDataModel['series'] = []
  for (const item of seriesRaw) {
    if (!isPlainObject(item) || !Array.isArray(item.data)) continue
    const looks =
      item.type === 'radar' ||
      item.data.some((entry) => (isPlainObject(entry) ? Array.isArray(entry.value) : Array.isArray(entry)))
    if (!looks) continue
    item.data.forEach((entry) => {
      const values = radarEntryValues(entry)
      if (!values) return
      const named = isPlainObject(entry) && typeof entry.name === 'string' ? entry.name.trim() : ''
      const seriesName = typeof item.name === 'string' ? item.name.trim() : ''
      const name = named || (item.data.length === 1 ? seriesName : '') || `系列${vectors.length + 1}`
      vectors.push({ name, data: values })
    })
  }
  if (!vectors.length) return null
  const indicators = radarIndicatorList(option)
  const width = Math.max(indicators.length, ...vectors.map((item) => item.data.length))
  const categories = Array.from({ length: width }, (_, index) => indicatorName(indicators[index], index))
  return {
    categories,
    series: vectors.map((item) => ({
      name: item.name,
      data: Array.from({ length: width }, (_, index) => item.data[index] ?? ''),
    })),
  }
}

function writeRadarIndicators(radar: unknown, categories: string[]): unknown {
  const apply = (node: Record<string, unknown>) => {
    const indicators = Array.isArray(node.indicator) ? node.indicator : []
    return {
      ...node,
      indicator: categories.map((name, index) => {
        const origin = indicators[index]
        if (isPlainObject(origin)) return { ...origin, name }
        if (typeof origin === 'string') return name
        return { name, max: 100 }
      }),
    }
  }
  if (Array.isArray(radar)) {
    let used = false
    return radar.map((item) => {
      if (used || !isPlainObject(item)) return item
      used = true
      return apply(item)
    })
  }
  if (isPlainObject(radar)) return apply(radar)
  return { indicator: categories.map((name) => ({ name, max: 100 })) }
}

function radarValueList(data: Array<number | string>, width: number): Array<number | string> {
  return Array.from({ length: width }, (_, index) => {
    const value = data[index]
    return value === '' || value == null ? 0 : value
  })
}

function writeRadarOption(base: Record<string, unknown>, model: ChartDataModel): Record<string, unknown> {
  const seriesRaw = Array.isArray(base.series) ? base.series : []
  let cursor = 0
  let lastRadar = -1
  const nextSeries = seriesRaw.map((item, seriesIndex) => {
    if (!isPlainObject(item) || !Array.isArray(item.data)) return item
    const looks =
      item.type === 'radar' ||
      item.data.some((entry) => (isPlainObject(entry) ? Array.isArray(entry.value) : Array.isArray(entry)))
    if (!looks) return item
    lastRadar = seriesIndex
    const data = item.data.flatMap((entry) => {
      if (!radarEntryValues(entry)) return [entry]
      const target = model.series[cursor]
      cursor += 1
      if (!target) return []
      const list = radarValueList(target.data, model.categories.length)
      if (Array.isArray(entry)) return [list]
      const origin = isPlainObject(entry) ? entry : {}
      return [{ ...origin, name: target.name || origin.name, value: list }]
    })
    return { ...item, data }
  })
  if (lastRadar >= 0 && cursor < model.series.length) {
    const host = nextSeries[lastRadar]
    if (isPlainObject(host) && Array.isArray(host.data)) {
      const extra = model.series.slice(cursor).map((item) => ({
        name: item.name,
        value: radarValueList(item.data, model.categories.length),
      }))
      nextSeries[lastRadar] = { ...host, data: [...host.data, ...extra] }
    }
  }
  const next: Record<string, unknown> = {
    ...base,
    series: nextSeries,
    radar: writeRadarIndicators(base.radar, model.categories),
  }
  if (isPlainObject(base.legend) && Array.isArray(base.legend.data)) {
    next.legend = {
      ...base.legend,
      data: model.series.map((item) => item.name).filter(Boolean),
    }
  }
  return next
}

function writeAxisData(raw: unknown, index: number, data: string[]): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item, itemIndex) =>
      itemIndex === index && isPlainObject(item) ? { ...item, data } : item,
    )
  }
  if (isPlainObject(raw) && index === 0) return { ...raw, data }
  return raw
}

/** 从 option 抽出数据模型。 */
export function optionToDataModel(option: unknown): ChartDataModel {
  const empty: ChartDataModel = { categories: [], series: [] }
  if (!isPlainObject(option)) return empty
  const seriesRaw = Array.isArray(option.series) ? option.series : []
  if (isRadarChart(option, seriesRaw)) {
    const radarModel = readRadarModel(option, seriesRaw)
    if (radarModel) return radarModel
  }
  const categoryAxis = readCategoryAxis(option)
  const axisCategories = categoryAxis?.categories ?? []

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
 * - 类目轴在横轴或纵轴时，写回那一根轴的 data；
 * - 类目轴不存在且数据是 { name, value } 形态时，按类目写回数据项的 name。
 */
export function dataModelToOption(
  option: unknown,
  model: ChartDataModel,
): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(option) ? { ...option } : {}
  const seriesRaw = Array.isArray(base.series) ? base.series : []
  if (isRadarChart(base, seriesRaw) && readRadarModel(base, seriesRaw)) {
    return writeRadarOption(base, model)
  }
  const categoryAxis = readCategoryAxis(base)

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
        model.categories[cellIndex]
        ?? (isPlainObject(origin) && typeof origin.name === 'string' ? origin.name : '')
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
  if (categoryAxis) {
    next[categoryAxis.key] = writeAxisData(base[categoryAxis.key], categoryAxis.index, model.categories)
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
