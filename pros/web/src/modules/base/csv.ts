/**
 * CSV 解析与序列化（RFC 4180 风格）。
 *
 * 支持：双引号包裹、字段内逗号 / 换行 / 转义双引号（""）、CRLF 换行、
 * 首行表头、TXT（制表符分隔）自动识别。
 */

/** 把 CSV / TSV 文本解析成二维数组。 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const raw = text.replace(/^\uFEFF/, '')
  const sep = delimiter ?? detectDelimiter(raw)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && raw[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.some((item) => item !== '')) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    if (row.some((item) => item !== '')) rows.push(row)
  }
  return rows
}

/** 猜测分隔符：优先逗号，其次制表符。 */
function detectDelimiter(text: string): string {
  const head = text.slice(0, 5000)
  const commas = (head.match(/,/g) ?? []).length
  const tabs = (head.match(/\t/g) ?? []).length
  return tabs > commas ? '\t' : ','
}

/** 把二维数组序列化成 CSV 文本。 */
export function toCsv(rows: string[][], delimiter = ','): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell ?? ''
          if (/[",\n\r]/.test(text) || text.includes(delimiter)) {
            return `"${text.replace(/"/g, '""')}"`
          }
          return text
        })
        .join(delimiter),
    )
    .join('\r\n')
}

/** 把 CSV 文本转成 Markdown 表格。 */
export function toMarkdownTable(rows: string[][]): string {
  if (!rows.length) return ''
  const escape = (cell: string) => (cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  const [head, ...body] = rows
  return [
    `| ${head.map(escape).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}
