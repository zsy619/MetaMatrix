/** dataset 形态的图表数据读写。 */
import type { ChartDataModel } from './chartDataTableShared'
import { isPlainObject, itemToText, itemToValue, textToValue } from './chartDataTableShared'

export function datasetRecord(option: Record<string, unknown>): Record<string, unknown> | null {
  const dataset = option.dataset
  if (Array.isArray(dataset)) {
    const found = dataset.find((item) => isPlainObject(item) && Array.isArray(item.source))
    return isPlainObject(found) ? found : null
  }
  if (isPlainObject(dataset) && Array.isArray(dataset.source)) return dataset
  return null
}

export function seriesHasInlineData(seriesRaw: unknown[]): boolean {
  return seriesRaw.some((item) => isPlainObject(item) && Array.isArray(item.data) && item.data.length > 0)
}

/** dataset.source：首行是表头的二维表，或对象行。类目在第一列，其余列是系列。 */
export function readDatasetModel(source: unknown[]): ChartDataModel | null {
  if (source.every((row) => Array.isArray(row))) {
    const rows = source as unknown[][]
    if (!rows.length || !rows[0]?.length) return null
    const headerIsText = rows[0].every((cell) => typeof cell !== 'number')
    const body = headerIsText ? rows.slice(1) : rows
    if (!body.length) return null
    const names = headerIsText
      ? rows[0].slice(1).map((cell, index) => itemToText(cell) || `系列${index + 1}`)
      : body[0]!.slice(1).map((_, index) => `系列${index + 1}`)
    if (!names.length) return null
    return {
      categories: body.map((row) => itemToText(row[0])),
      series: names.map((name, index) => ({
        name,
        data: body.map((row) => itemToValue(row[index + 1])),
      })),
    }
  }
  if (!source.length || !source.every((row) => isPlainObject(row))) return null
  const rows = source as Record<string, unknown>[]
  const keys: string[] = []
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!keys.includes(key)) keys.push(key)
    })
  })
  if (keys.length < 2) return null
  const categoryKey = keys[0]!
  return {
    categories: rows.map((row) => itemToText(row[categoryKey])),
    series: keys.slice(1).map((key) => ({
      name: key,
      data: rows.map((row) => itemToValue(row[key])),
    })),
  }
}

export function writeDatasetOption(base: Record<string, unknown>, model: ChartDataModel): Record<string, unknown> {
  const node = datasetRecord(base)
  const source = Array.isArray(node?.source) ? node.source : []
  const objectRows = source.length > 0 && source.every((row) => isPlainObject(row))
  let nextSource: unknown[]
  if (objectRows) {
    const sample = source.find((row) => isPlainObject(row)) as Record<string, unknown>
    const categoryKey = Object.keys(sample)[0] || 'category'
    nextSource = model.categories.map((category, rowIndex) => {
      const origin = isPlainObject(source[rowIndex]) ? { ...(source[rowIndex] as Record<string, unknown>) } : {}
      origin[categoryKey] = category
      model.series.forEach((item) => {
        origin[item.name] = item.data[rowIndex] ?? ''
      })
      return origin
    })
  } else {
    const first = Array.isArray(source[0]) ? (source[0] as unknown[]) : []
    const corner = itemToText(first[0]) || '类目'
    nextSource = [
      [corner, ...model.series.map((item) => item.name)],
      ...model.categories.map((category, rowIndex) => [
        category,
        ...model.series.map((item) => item.data[rowIndex] ?? ''),
      ]),
    ]
  }
  const nextDataset = Array.isArray(base.dataset)
    ? base.dataset.map((item) => (item === node ? { ...node, source: nextSource } : item))
    : { ...(node || {}), source: nextSource }
  const seriesRaw = Array.isArray(base.series) ? base.series : []
  const series = model.series.map((item, index) => {
    const origin = seriesRaw[index]
    if (!isPlainObject(origin)) return { type: 'bar', name: item.name }
    const next = { ...origin }
    if (!Array.isArray(next.data) || next.data.length === 0) delete next.data
    if (!next.type) next.type = 'bar'
    return next
  })
  const next: Record<string, unknown> = { ...base, dataset: nextDataset, series }
  if (isPlainObject(base.legend) && Array.isArray(base.legend.data)) {
    next.legend = { ...base.legend, data: model.series.map((item) => item.name).filter(Boolean) }
  }
  return next
}

