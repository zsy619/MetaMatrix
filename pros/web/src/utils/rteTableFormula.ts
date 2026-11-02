/**
 * 表格单元格公式。
 *
 * 单元格文本以 = 开头即视为公式。支持的写法：
 * - =SUM(ABOVE) / =AVERAGE(ABOVE) / =COUNT(ABOVE) / =MAX(ABOVE) / =MIN(ABOVE)
 * - =SUM(A1:B2)、=SUM(A1,A2)
 * - =B2*3、=B2+1、=B2-1、=B2/2
 * - =SUM(B1:B3)*2（函数结果参与运算）
 *
 * grid 是二维数组，grid[row][col]，row/col 从 0 开始；单元格地址 A1 是第 1 列第 1 行。
 */

/** 单元格地址。col / row 都是 1 基。 */
export type CellAddress = { col: number; row: number }

const ADDRESS_RE = /^([A-Za-z]{1,3})(\d{1,7})$/

/** 'B3' -> { col: 2, row: 3 }。非法返回 null。 */
export function parseCellAddress(text: string): CellAddress | null {
  const m = ADDRESS_RE.exec(String(text ?? '').trim())
  if (!m) return null
  const colLetters = m[1]!.toUpperCase()
  let col = 0
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  const row = Number(m[2])
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 1 || row < 1) return null
  return { col, row }
}

/** { col: 2, row: 3 } -> 'B3' */
export function formatCellAddress(addr: CellAddress): string {
  let col = Math.max(1, Math.floor(addr.col))
  const row = Math.max(1, Math.floor(addr.row))
  let letters = ''
  while (col > 0) {
    const rest = (col - 1) % 26
    letters = String.fromCharCode(65 + rest) + letters
    col = Math.floor((col - 1) / 26)
  }
  return `${letters}${row}`
}

/** 单元格文本是不是公式。 */
export function isFormulaCell(text: string): boolean {
  return String(text ?? '').trim().startsWith('=')
}

/** 解析数值：忽略千分位逗号，百分号按小数处理。非数字返回 null。 */
export function parseCellNumber(text: string): number | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const isPercent = raw.endsWith('%')
  const body = (isPercent ? raw.slice(0, -1) : raw).replace(/,/g, '').trim()
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(body)) return null
  const value = Number(body)
  if (!Number.isFinite(value)) return null
  return isPercent ? value / 100 : value
}

/** 数字转显示文本：整数不带小数点，最多 4 位小数并去掉多余的 0。 */
export function formatCellNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10000) / 10000)
}

function gridCell(grid: readonly (readonly string[])[], addr: CellAddress): string {
  const row = grid[addr.row - 1]
  if (!row) return ''
  return row[addr.col - 1] ?? ''
}

function numericAt(grid: readonly (readonly string[])[], addr: CellAddress): number | null {
  return parseCellNumber(gridCell(grid, addr))
}

/** 展开区域地址，如 'A1:B2'。 */
function expandRange(rangeText: string): CellAddress[] {
  const parts = rangeText.split(':')
  const start = parseCellAddress(parts[0] ?? '')
  if (!start) return []
  if (parts.length === 1) return [start]
  const end = parseCellAddress(parts[1] ?? '')
  if (!end) return []
  const out: CellAddress[] = []
  const rowFrom = Math.min(start.row, end.row)
  const rowTo = Math.max(start.row, end.row)
  const colFrom = Math.min(start.col, end.col)
  const colTo = Math.max(start.col, end.col)
  for (let r = rowFrom; r <= rowTo; r += 1) {
    for (let c = colFrom; c <= colTo; c += 1) out.push({ col: c, row: r })
  }
  return out
}

type FuncKind = 'SUM' | 'AVERAGE' | 'COUNT' | 'MAX' | 'MIN'

const FUNC_RE = /^(SUM|AVERAGE|COUNT|MAX|MIN)\(([^()]*)\)$/i

/** 求值上下文：公式自己所在的行列，ABOVE 需要它。 */
type EvalContext = {
  grid: readonly (readonly string[])[]
  /** 公式所在行（0 基） */
  row: number
  /** 公式所在列（0 基） */
  col: number
}

/** 求值一个函数的参数集合。返回 null 表示参数非法。 */
function evalFunction(
  kind: FuncKind,
  argText: string,
  ctx: EvalContext,
): number | null {
  const arg = argText.trim()
  if (!arg) return null
  const addresses: CellAddress[] = []
  if (/^above$/i.test(arg)) {
    // ABOVE：同列上方的所有单元格
    for (let r = 0; r < ctx.row; r += 1) {
      addresses.push({ col: ctx.col + 1, row: r + 1 })
    }
  } else if (/^left$/i.test(arg)) {
    // LEFT：同一行左侧的所有单元格
    for (let c = 0; c < ctx.col; c += 1) {
      addresses.push({ col: c + 1, row: ctx.row + 1 })
    }
  } else {
    for (const piece of arg.split(',')) {
      const part = piece.trim()
      if (!part) continue
      if (part.includes(':')) {
        addresses.push(...expandRange(part))
      } else {
        const addr = parseCellAddress(part)
        if (!addr) return null
        addresses.push(addr)
      }
    }
  }
  if (!addresses.length) {
    // 没有可聚合的单元格：COUNT 为 0，其余无值
    return kind === 'COUNT' ? 0 : null
  }
  const values: number[] = []
  for (const addr of addresses) {
    const n = numericAt(ctx.grid, addr)
    if (n != null) values.push(n)
  }
  if (kind === 'COUNT') return values.length
  if (!values.length) return null
  if (kind === 'SUM') return values.reduce((a, b) => a + b, 0)
  if (kind === 'AVERAGE') return values.reduce((a, b) => a + b, 0) / values.length
  if (kind === 'MAX') return Math.max(...values)
  return Math.min(...values)
}

/** 求值纯算术表达式（单元格地址替换成数值）。 */
function evalArithmetic(text: string, ctx: EvalContext): number | null {
  const expr = String(text ?? '').trim()
  if (!expr) return null
  // 百分号字面量：50% -> 0.5
  const percentFixed = expr.replace(/(\d+(?:\.\d+)?)%/g, (_m, num: string) => String(Number(num) / 100))
  const substituted = percentFixed.replace(/[A-Za-z]{1,3}\d{1,7}/g, (token) => {
    const addr = parseCellAddress(token)
    if (!addr) return token
    const n = numericAt(ctx.grid, addr)
    return n == null ? 'NaN' : String(n)
  })
  if (substituted.includes('NaN')) return null
  if (!/^[0-9+\-*/().\s]+$/.test(substituted)) return null
  try {
    // eslint-disable-next-line no-new-func
    const runner = new Function(`"use strict"; return (${substituted});`) as () => unknown
    const value = runner()
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return value
  } catch {
    return null
  }
}

/**
 * 求值公式主体（不含前导 =）。函数可以嵌套在算术里。
 */
function evalBody(body: string, ctx: EvalContext, depth = 0): number | null {
  if (depth > 8) return null
  const expr = String(body ?? '').trim()
  if (!expr) return null

  // 整体就是一个函数
  const whole = FUNC_RE.exec(expr)
  if (whole) {
    return evalFunction(whole[1]!.toUpperCase() as FuncKind, whole[2]!, ctx)
  }

  // 表达式里含函数：先把函数替换成数值
  if (/[A-Za-z]+\s*\(/.test(expr)) {
    const replaced = expr.replace(
      /(SUM|AVERAGE|COUNT|MAX|MIN)\(([^()]*)\)/gi,
      (_m, name: string, args: string) => {
        const value = evalFunction(name.toUpperCase() as FuncKind, args, ctx)
        return value == null ? 'NaN' : String(value)
      },
    )
    if (replaced.includes('NaN')) return null
    return evalArithmetic(replaced, ctx)
  }

  return evalArithmetic(expr, ctx)
}

/**
 * 求值一个公式单元格。formula 是单元格文本（可以带前导 =）。
 * grid 为整个表格的二维文本；row / col 是公式自身的位置（0 基）。
 * 无法求值时返回 null。
 */
export function evaluateCellFormula(
  formula: string,
  grid: readonly (readonly string[])[],
  row = 0,
  col = 0,
): string | null {
  const raw = String(formula ?? '').trim()
  if (!raw.startsWith('=')) return null
  const body = raw.slice(1).trim()
  if (!body) return null
  const value = evalBody(body, { grid, row, col })
  if (value == null) return null
  return formatCellNumber(value)
}

/**
 * 重算整张表：公式单元格替换为计算结果。
 * 按行优先计算，公式可以引用其它公式单元格（引用时用已算出的值）。
 */
export function recalculateTable(grid: readonly (readonly string[])[]): string[][] {
  const out = (grid || []).map((row) => (row || []).map((cell) => String(cell ?? '')))
  for (let r = 0; r < out.length; r += 1) {
    for (let c = 0; c < out[r]!.length; c += 1) {
      const text = out[r]![c]!
      if (!isFormulaCell(text)) continue
      const value = evaluateCellFormula(text, out, r, c)
      out[r]![c] = value == null ? '' : value
    }
  }
  return out
}
