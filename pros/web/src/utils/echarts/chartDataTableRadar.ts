/** 雷达图的数据模型读写。 */
import type { ChartDataModel } from './chartDataTableShared'
import { asValueList, isPlainObject, itemToText } from './chartDataTableShared'

export function isRadarChart(option: Record<string, unknown>, seriesRaw: unknown[]): boolean {
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
export function readRadarModel(option: Record<string, unknown>, seriesRaw: unknown[]): ChartDataModel | null {
  const vectors: ChartDataModel['series'] = []
  for (const item of seriesRaw) {
    if (!isPlainObject(item) || !Array.isArray(item.data)) continue
    const data = item.data
    const looks =
      item.type === 'radar' ||
      data.some((entry) => (isPlainObject(entry) ? Array.isArray(entry.value) : Array.isArray(entry)))
    if (!looks) continue
    data.forEach((entry) => {
      const values = radarEntryValues(entry)
      if (!values) return
      const named = isPlainObject(entry) && typeof entry.name === 'string' ? entry.name.trim() : ''
      const seriesName = typeof item.name === 'string' ? item.name.trim() : ''
      const name = named || (data.length === 1 ? seriesName : '') || `系列${vectors.length + 1}`
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

function radarValueList(data: Array<number | string | null | undefined>, width: number): Array<number | string> {
  return Array.from({ length: width }, (_, index) => {
    const value = data[index]
    return value === '' || value == null ? 0 : value
  })
}

export function writeRadarOption(base: Record<string, unknown>, model: ChartDataModel): Record<string, unknown> {
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

