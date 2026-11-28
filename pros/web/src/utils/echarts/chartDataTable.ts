/** 图表数据的「表格 ⇄ JSON」双向同步。 */
import type { ChartDataModel, ChartDataRow } from './chartDataTableShared'
import {
  isPlainObject,
  itemToText,
  itemToValue,
  pointTuple,
  readCategoryAxis,
  textToValue,
  writeAxisData,
} from './chartDataTableShared'
import { isRadarChart, readRadarModel, writeRadarOption } from './chartDataTableRadar'
import { datasetRecord, readDatasetModel, seriesHasInlineData, writeDatasetOption } from './chartDataTableDataset'

export type { ChartDataModel, ChartDataRow } from './chartDataTableShared'
export { textToValue } from './chartDataTableShared'

export function optionToDataModel(option: unknown): ChartDataModel {
  const empty: ChartDataModel = { categories: [], series: [] }
  if (!isPlainObject(option)) return empty
  const seriesRaw = Array.isArray(option.series) ? option.series : []
  if (isRadarChart(option, seriesRaw)) {
    const radarModel = readRadarModel(option, seriesRaw)
    if (radarModel) return radarModel
  }
  if (!seriesHasInlineData(seriesRaw)) {
    const source = datasetRecord(option)?.source
    if (Array.isArray(source)) {
      const datasetModel = readDatasetModel(source)
      if (datasetModel) return datasetModel
    }
  }
  const categoryAxis = readCategoryAxis(option)
  const axisCategories = categoryAxis?.categories ?? []

  const series: ChartDataModel['series'] = []
  let categories = axisCategories
  for (const item of seriesRaw) {
    if (!isPlainObject(item)) continue
    const dataRaw = Array.isArray(item.data) ? item.data : []
    const name = typeof item.name === 'string' ? item.name : `系列${series.length + 1}`
    if (item.type === 'scatter' && dataRaw.length && dataRaw.every((entry) => pointTuple(entry))) {
      const points = dataRaw.map((entry) => pointTuple(entry)!)
      if (!categories.length) categories = points.map((point) => String(point[0] ?? ''))
      series.push({ name, data: points.map((point) => point[1] ?? '') })
      continue
    }
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
  if (!seriesHasInlineData(seriesRaw)) {
    const source = datasetRecord(base)?.source
    if (Array.isArray(source) && readDatasetModel(source)) return writeDatasetOption(base, model)
  }
  const categoryAxis = readCategoryAxis(base)

  const nextSeries = seriesRaw.map((item, index) => {
    if (!isPlainObject(item)) return item
    const target = model.series[index]
    if (!target) return item
    const original = Array.isArray(item.data) ? item.data : []
    const scatter = item.type === 'scatter' && (original.length === 0 || original.every((entry) => pointTuple(entry)))
    const useObjectShape = original.length > 0 && isPlainObject(original[0])
    const data = target.data.map((value, cellIndex) => {
      if (scatter) {
        const origin = original[cellIndex]
        const x = textToValue(String(model.categories[cellIndex] ?? ''))
        const y = value === '' || value == null ? '' : value
        if (isPlainObject(origin) && Array.isArray(origin.value)) {
          const next = origin.value.slice()
          next[0] = x
          next[1] = y
          return { ...origin, value: next }
        }
        if (Array.isArray(origin) && origin.length > 2) return [x, y, ...origin.slice(2)]
        return [x, y]
      }
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
