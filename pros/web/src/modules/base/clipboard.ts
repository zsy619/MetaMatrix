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
 * - 空值写 null（清空单元格）；
 * - **按字段类型解析**（见 parseCellValue），不再一律当字符串覆盖。
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
      out.push({
        recordId: row.id,
        fieldId: field.id,
        value: text === '' ? null : parseCellValue(text, field.type),
      })
    })
  })
  return out
}

/** 布尔真值（中文 / 英文 / 符号都认）。 */
const TRUTHY = new Set(['是', 'true', 'yes', 'y', '1', '√', '✓', 'on', '开'])
/** 布尔假值。 */
const FALSY = new Set(['否', 'false', 'no', 'n', '0', '×', '✗', 'off', '关'])

/**
 * 按字段类型解析一个粘贴进来的单元格文本（E-01）。
 *
 * 为什么不能一律当字符串：多维表格的字段是**有类型的**，
 * 把 `2024-01-05` 写进日期列、把 `1,200` 写进金额列，
 * 服务端要么拒收、要么存成字符串 —— 用户看到的是「粘进去了但值不对」。
 *
 * 规则（认不出来就**原样返回文本**，交给服务端报错，不要静默改写用户的数据）：
 *
 * | 字段类型 | 解析 |
 * | --- | --- |
 * | 数字 / 金额 / 百分比 / 评分 | 去千分位与货币符号后转数字 |
 * | 复选框 | 是 / 否 / true / false / 1 / 0 → 布尔 |
 * | 日期 | `2024-01-05`、`2024/1/5` → `YYYY-MM-DD` |
 * | 日期时间 | `2024-01-05 13:45` → `YYYY-MM-DD HH:mm:ss` |
 * | 多选 | 按 `,` `、` `;` 拆成数组 |
 * | 单选 / 文本 / 长文本 / 邮箱 / 网址 / 电话 | 原样保留 |
 */
export function parseCellValue(text: string, type?: string): unknown {
  const value = text.trim()
  if (value === '') return null
  switch (type) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating': {
      const num = parseLooseNumber(value)
      return num === null ? value : num
    }
    case 'checkbox': {
      const lower = value.toLowerCase()
      if (TRUTHY.has(lower)) return true
      if (FALSY.has(lower)) return false
      return value
    }
    case 'date': {
      const parsed = parseLooseDate(value)
      return parsed ? parsed.slice(0, 10) : value
    }
    case 'datetime': {
      const parsed = parseLooseDate(value)
      if (!parsed) return value
      return parsed.length >= 19 ? parsed.slice(0, 19) : `${parsed} 00:00:00`
    }
    case 'multi_select': {
      const items = value
        .split(/[,、;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
      return items.length ? items : value
    }
    default:
      return value
  }
}

/**
 * 宽松地解析数字：`1,200` / `￥1,200.50` / `85%` / `1 200`。
 *
 * 解析不出来返回 null（调用方保留原文本，不静默变成 0 ——
 * 「粘错了一格」比「粘进去变成 0」更容易被发现）。
 */
export function parseLooseNumber(text: string): number | null {
  const cleaned = text
    .replace(/[\s,，_]/g, '')
    .replace(/[￥$€£¥]/g, '')
    .replace(/%$/, '')
  if (cleaned === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(cleaned)) {
    return null
  }
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

/**
 * 宽松地解析日期：`2024-01-05` / `2024/1/5` / `2024.1.5` /
 * `2024-01-05 13:45` / `2024-01-05T13:45:00`。
 *
 * 只接受「年月日」形态 —— 不猜「01/02/2024 是 1 月 2 日还是 2 月 1 日」
 * 这种有歧义的写法，猜错比不猜更糟。
 */
export function parseLooseDate(text: string): string | null {
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    text.trim(),
  )
  if (!match) return null
  const [, y, m, d, hh, mm, ss] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const hour = hh ? Number(hh) : 0
  const minute = mm ? Number(mm) : 0
  const second = ss ? Number(ss) : 0
  if (hour > 23 || minute > 59 || second > 59) return null
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${pad(year, 4)}-${pad(month)}-${pad(day)}` +
    ` ${pad(hour)}:${pad(minute)}:${pad(second)}`
  )
}
