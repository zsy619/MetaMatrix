/** 多维表格剪贴板：TSV 粘贴的行列映射（供 Grid 与单测共用）。 */

export type PasteTarget = {
  /** 行（记录）标识。 */
  recordId: string
  /** 目标字段 ID。 */
  fieldId: string
  /** 写入值（空串按 null 处理）。 */
  value: unknown
}

export type PasteSource = {
  /** 剪贴板纯文本。 */
  text: string
  /** 当前视图的行（按显示顺序）。 */
  rows: Array<{ id: string }>
  /** 当前视图的列（按显示顺序）。 */
  fields: Array<{ id: string; type?: string }>
  /** 起始行下标。 */
  startRow: number
  /** 起始列下标。 */
  startCol: number
  /** 不可写字段（公式）直接跳过。 */
  isReadonly?: (fieldId: string) => boolean
}

/** 单元格值转成复制文本。 */
export function cellToText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

/**
 * 把剪贴板 TSV 文本映射成一批单元格写入。
 * - `\t` 分列、`\n` 分行，兼容 CRLF；
 * - 超出当前视图范围的行列忽略；
 * - 空值写 null（清空单元格）。
 */
export function buildPasteCells(source: PasteSource): PasteTarget[] {
  const out: PasteTarget[] = []
  const lines = source.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  lines.forEach((line, lineIndex) => {
    const row = source.rows[source.startRow + lineIndex]
    if (!row) return
    line.split('\t').forEach((raw, cellIndex) => {
      const field = source.fields[source.startCol + cellIndex]
      if (!field) return
      if (source.isReadonly?.(field.id)) return
      const text = raw.trim()
      out.push({ recordId: row.id, fieldId: field.id, value: text === '' ? null : text })
    })
  })
  return out
}
