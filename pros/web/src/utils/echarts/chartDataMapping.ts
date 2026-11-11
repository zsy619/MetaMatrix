/**
 * 数据接口的响应 → 图表数据映射（纯函数，便于单测）。
 *
 * 与配置读写（chartDataSource.ts）、请求构造（chartDataRequest.ts）分开，
 * 保证每个文件都在 300 行以内。
 */
import type { ChartDataSourceMapping } from './chartDataSource'

/** 按路径取数组。 */
export function pickList(payload: unknown, listPath: string): unknown[] {
  const path = listPath.trim()
  let current: unknown = payload
  if (path) {
    for (const segment of path.split('.')) {
      if (!segment) continue
      if (Array.isArray(current)) {
        const index = Number(segment)
        if (!Number.isInteger(index)) return []
        current = current[index]
        continue
      }
      if (!current || typeof current !== 'object') return []
      current = (current as Record<string, unknown>)[segment]
    }
  }
  return Array.isArray(current) ? current : []
}

/** 映射后的图表数据。 */
export type MappedChartData = {
  /** 类目（X 轴）。 */
  categories: string[]
  /** 每个系列一条数据。 */
  series: Array<{ name: string; data: number[] }>
}

/**
 * 把接口响应映射成图表数据。
 *
 * - seriesField 有值：响应每条记录一个系列（字段名 → 系列名）；
 * - 否则：整体作为一个系列，categoryField → 类目，valueField → 数值。
 */
export function mapResponseToChartData(
  payload: unknown,
  mapping: ChartDataSourceMapping,
): MappedChartData {
  const list = pickList(payload, mapping.listPath)
  const categoryField = mapping.categoryField.trim()
  const valueField = mapping.valueField.trim()
  const seriesField = mapping.seriesField.trim()

  if (seriesField) {
    const groups = new Map<string, { categories: string[]; data: number[] }>()
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const name = String(row[seriesField] ?? '').trim() || '系列'
      const group = groups.get(name) || { categories: [], data: [] }
      group.categories.push(
        categoryField ? String(row[categoryField] ?? '') : String(group.categories.length + 1),
      )
      const rawValue = valueField ? row[valueField] : undefined
      group.data.push(toFiniteNumber(rawValue))
      groups.set(name, group)
    }
    const entries = Array.from(groups.entries())
    const series = entries.map(([name, group]) => ({
      name,
      data: group.data,
    }))
    const categories = entries[0]?.[1].categories || []
    return { categories, series }
  }

  const categories: string[] = []
  const data: number[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    categories.push(categoryField ? String(row[categoryField] ?? '') : String(data.length + 1))
    data.push(toFiniteNumber(valueField ? row[valueField] : undefined))
  }
  return { categories, series: [{ name: '数据', data }] }
}

function toFiniteNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}

/** 正文表格：第一列是类目，其余列是系列，第一行是表头。 */
export function tableGridToChartData(grid: string[][]): MappedChartData | null {
  if (grid.length < 2) return null
  const header = grid[0] || []
  const body = grid.slice(1).filter((row) => row.some((cell) => String(cell || '').trim()))
  if (!body.length || header.length < 2) return null
  const categories = body.map((row) => String(row[0] || ''))
  const series = []
  for (let column = 1; column < header.length; column += 1) {
    series.push({
      name: String(header[column] || '').trim() || `系列${column}`,
      data: body.map((row) => {
        const raw = String(row[column] || '').replace(/,/g, '')
        const value = Number(raw)
        return Number.isFinite(value) ? value : 0
      }),
    })
  }
  return series.length ? { categories, series } : null
}

/** 把映射结果写回 option（类目写 xAxis.data，数值写 series.data）。 */
export function applyMappedDataToOption(
  option: Record<string, unknown>,
  mapped: MappedChartData,
): Record<string, unknown> {
  const next = { ...option }
  if (mapped.categories.length) {
    const xAxis = next.xAxis
    if (Array.isArray(xAxis) && xAxis.length) {
      next.xAxis = xAxis.map((item, index) =>
        index === 0 && item && typeof item === 'object'
          ? { ...(item as Record<string, unknown>), data: mapped.categories }
          : item,
      )
    } else if (xAxis && typeof xAxis === 'object') {
      next.xAxis = { ...(xAxis as Record<string, unknown>), data: mapped.categories }
    }
  }
  const series = next.series
  if (Array.isArray(series) && series.length) {
    next.series = series.map((item, index) => {
      const target = mapped.series[index] || mapped.series[0]
      if (!item || typeof item !== 'object' || !target) return item
      return { ...(item as Record<string, unknown>), data: [...target.data] }
    })
  }
  return next
}
