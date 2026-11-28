/** 图表数据模型的共享类型与读写辅助。 */
export type ChartDataModel = {
  categories: string[]
  series: Array<{ name: string; data: Array<number | string | null> }>
}

/** 表格视图的行数据。 */
export type ChartDataRow = {
  category: string
  values: Array<number | string>
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 把一个数据项转成文本。 */
export function itemToText(raw: unknown): string {
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
export function readCategoryAxis(
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


/** 把一个数据项转成「数值保持数值、其余转文本」。 */
export function itemToValue(raw: unknown): number | string | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return itemToText(raw)
}

function valueOrEmpty(raw: unknown): number | string {
  return itemToValue(raw) ?? ''
}

/** 散点是 [x, y] 或 { value: [x, y] }。x 进类目列，y 进系列值，避免收成 "1,2"。 */
export function pointTuple(entry: unknown): Array<number | string> | null {
  const raw = isPlainObject(entry) && Array.isArray(entry.value) ? entry.value : entry
  if (!Array.isArray(raw) || raw.length < 2) return null
  if (raw.some((item) => Array.isArray(item) || isPlainObject(item))) return null
  return raw.map((item) => valueOrEmpty(item))
}

export function asValueList(raw: unknown): Array<number | string> | null {
  if (!Array.isArray(raw) || !raw.length) return null
  if (raw.some((item) => Array.isArray(item) || isPlainObject(item))) return null
  return raw.map((item) => valueOrEmpty(item))
}

export function writeAxisData(raw: unknown, index: number, data: string[]): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item, itemIndex) =>
      itemIndex === index && isPlainObject(item) ? { ...item, data } : item,
    )
  }
  if (isPlainObject(raw) && index === 0) return { ...raw, data }
  return raw
}

