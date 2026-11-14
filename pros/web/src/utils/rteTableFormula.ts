/**
 * 表格单元格公式：解析、计算与错误语义。
 *
 * 单元格文本以 = 开头即视为公式。支持的写法：
 * - =SUM(ABOVE) / =AVERAGE(ABOVE) / =COUNT(ABOVE) / =MAX(ABOVE) / =MIN(ABOVE)
 * - =SUM(A1:B2)、=SUM(A1,A2)
 * - =B2*3、=B2+1、=B2-1、=B2/2、=50%+1
 * - =SUM(B1:B3)*2（函数结果参与运算）
 * - 公式单元格可以引用其它公式单元格（递归求值）
 *
 * grid 是二维数组，grid[row][col]，row/col 从 0 开始；单元格地址 A1 是第 1 列第 1 行。
 *
 * 错误语义（写入单元格与公式栏都会显示这些错误码）：
 * - #REF!   引用无效（越界、地址非法）或循环引用
 * - #VALUE! 操作数不是数值 / 公式语法非法
 * - #DIV/0! 除数为 0，或 AVERAGE 没有可参与计算的数字
 * - #NAME?  未知函数名
 */

/** 单元格地址。col / row 都是 1 基。 */
export type CellAddress = { col: number; row: number }

/** 公式错误码。 */
export type FormulaErrorCode = '#REF!' | '#VALUE!' | '#DIV/0!' | '#NAME?'

/** 全部错误码，供 UI 展示 / 校验用。 */
export const FORMULA_ERROR_CODES: readonly FormulaErrorCode[] = [
  '#REF!',
  '#VALUE!',
  '#DIV/0!',
  '#NAME?',
]

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

/** 中文输入法打出来的全角括号、冒号和百分号，收成公式认得的符号。 */
export function normalizeFormulaPunctuation(text: string): string {
  return text
    .replace(/\u00a0|\u3000/g, ' ')
    .replace(/\uFF08/g, '(')
    .replace(/\uFF09/g, ')')
    .replace(/\uFF1A/g, ':')
    .replace(/\uFF0C/g, ',')
    .replace(/\uFF05/g, '%')
    .replace(/\uFF0B/g, '+')
    .replace(/\uFF0D/g, '-')
    .replace(/\u00D7/g, '*')
    .replace(/\u00F7/g, '/')
    .replace(/\uFF3E/g, '^')
    .replace(/\uFF1E/g, '>')
    .replace(/\uFF1C/g, '<')
    .replace(/\uFF1D/g, '=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2260/g, '<>')
}

/** 公式里提到的单元格和区域，按出现顺序去重。 */
export function formulaReferences(formula: string): string[] {
  const body = String(formula ?? '').trim().replace(/^=/, '')
  const found = body.match(/\$?[A-Za-z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Za-z]{1,3}\$?[1-9][0-9]*)?/g) || []
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of found) {
    const key = token.replace(/\$/g, '').toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function relockRef(text: string, colAbs: boolean, rowAbs: boolean): string {
  if (text === '#REF!' || (!colAbs && !rowAbs)) return text
  return text.replace(/([A-Za-z]+)([0-9]+)/g, (_, col: string, row: string) => `${colAbs ? '$' : ''}${col}${rowAbs ? '$' : ''}${row}`)
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

/**
 * 行列被插入、删除或对调以后，公式里的地址跟着格子走。
 * 映射返回 null 表示那一行或那一列已经不在了，写成 #REF!。
 * 区域还连成一块时收成新的区域；中间插入的空行会把区域撑开。
 */
export function remapFormulaByAxis(
  formula: string,
  mapRow: (row: number) => number | null,
  mapCol: (col: number) => number | null,
): string {
  const source = String(formula ?? '')
  if (!source.trim().startsWith('=')) return source
  const raw = normalizeFormulaPunctuation(source)
  const held: string[] = []
  const ranged = raw.replace(
    /(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*):(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)/g,
    (all, c1lock: string, c1: string, r1lock: string, r1: string, c2lock: string, c2: string, r2lock: string, r2: string) => {
      const from = parseCellAddress(`${c1}${r1}`)
      const to = parseCellAddress(`${c2}${r2}`)
      if (!from || !to) return all
      const token = `\u0000${held.length}\u0000`
      const next = remapFormulaRange(from, to, mapRow, mapCol)
      held.push(relockRef(next, c1lock === '$' && c2lock === '$', r1lock === '$' && r2lock === '$'))
      return token
    },
  )
  const cells = ranged.replace(/(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)\b/g, (all, colLock: string, col: string, rowLock: string, row: string) => {
    const addr = parseCellAddress(`${col}${row}`)
    if (!addr) return all
    const next = remapOneAddress(addr, mapRow, mapCol, `${col}${row}`)
    return relockRef(next, colLock === '$', rowLock === '$')
  })
  return cells.replace(/\u0000(\d+)\u0000/g, (_all, index: string) => held[Number(index)] ?? '#REF!')
}

function remapOneAddress(
  addr: CellAddress,
  mapRow: (row: number) => number | null,
  mapCol: (col: number) => number | null,
  original: string,
): string {
  const row = mapRow(addr.row)
  const col = mapCol(addr.col)
  if (row == null || col == null) return '#REF!'
  if (row === addr.row && col === addr.col) return original || formatCellAddress(addr)
  return formatCellAddress({ col, row })
}

function remapFormulaRange(
  from: CellAddress,
  to: CellAddress,
  mapRow: (row: number) => number | null,
  mapCol: (col: number) => number | null,
): string {
  const rowFrom = Math.min(from.row, to.row)
  const rowTo = Math.max(from.row, to.row)
  const colFrom = Math.min(from.col, to.col)
  const colTo = Math.max(from.col, to.col)
  const count = (rowTo - rowFrom + 1) * (colTo - colFrom + 1)
  if (count > 2000) {
    const start = remapOneAddress(from, mapRow, mapCol, '')
    const end = remapOneAddress(to, mapRow, mapCol, '')
    if (start === '#REF!' || end === '#REF!') return '#REF!'
    return start === end ? start : `${start}:${end}`
  }
  const seen = new Set<string>()
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let col = colFrom; col <= colTo; col += 1) {
      const nextRow = mapRow(row)
      const nextCol = mapCol(col)
      if (nextRow == null || nextCol == null) continue
      seen.add(`${nextCol},${nextRow}`)
      minRow = Math.min(minRow, nextRow)
      maxRow = Math.max(maxRow, nextRow)
      minCol = Math.min(minCol, nextCol)
      maxCol = Math.max(maxCol, nextCol)
    }
  }
  if (!seen.size) return '#REF!'
  const box = (maxRow - minRow + 1) * (maxCol - minCol + 1)
  const solid = seen.size === box
  const inserted = !solid && rangeGapsAreInserts(mapRow, mapCol, minRow, maxRow, minCol, maxCol, seen)
  if (!solid && !inserted) {
    const start = remapOneAddress(from, mapRow, mapCol, '')
    const end = remapOneAddress(to, mapRow, mapCol, '')
    if (start === '#REF!' || end === '#REF!') return '#REF!'
    return start === end ? start : `${start}:${end}`
  }
  if (minRow === maxRow && minCol === maxCol) return formatCellAddress({ col: minCol, row: minRow })
  return `${formatCellAddress({ col: minCol, row: minRow })}:${formatCellAddress({ col: maxCol, row: maxRow })}`
}

/** 区域中间的空档没有任何旧格子移进来，说明那是新插入的行或列。 */
function rangeGapsAreInserts(
  mapRow: (row: number) => number | null,
  mapCol: (col: number) => number | null,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  seen: Set<string>,
): boolean {
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (seen.has(`${col},${row}`)) continue
      for (let sourceRow = 1; sourceRow <= 400; sourceRow += 1) {
        if (mapRow(sourceRow) !== row) continue
        for (let sourceCol = 1; sourceCol <= 80; sourceCol += 1) {
          if (mapCol(sourceCol) === col) return false
        }
      }
    }
  }
  return true
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

/* ------------------------------------------------------------------ *
 * 词法 / 语法
 * ------------------------------------------------------------------ */

type LexToken =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }
  | { t: 'colon' }
  | { t: 'pct' }
  | { t: 'cmp'; v: string }
  | { t: 'err'; v: FormulaErrorCode }

class FormulaError extends Error {
  code: FormulaErrorCode
  constructor(code: FormulaErrorCode) {
    super(`formula error ${code}`)
    this.code = code
  }
}

function lex(src: string): LexToken[] {
  const tokens: LexToken[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!
      tokens.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i))!
      tokens.push({ t: 'ident', v: m[0] })
      i += m[0].length
      continue
    }
    if (ch === '#') {
      const err = /^#(REF!|VALUE!|DIV\/0!|NAME\?)/.exec(src.slice(i))
      if (!err) throw new FormulaError('#VALUE!')
      tokens.push({ t: 'err', v: err[0] as FormulaErrorCode })
      i += err[0].length
      continue
    }
    if (ch === '(') tokens.push({ t: 'lp' })
    else if (ch === ')') tokens.push({ t: 'rp' })
    else if (ch === ',') tokens.push({ t: 'comma' })
    else if (ch === ':') tokens.push({ t: 'colon' })
    else if (ch === '%') tokens.push({ t: 'pct' })
    else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') tokens.push({ t: 'op', v: ch })
    else if (ch === '<' || ch === '>' || ch === '=') {
      const next = src[i + 1]
      let op = ch
      if (ch === '<' && (next === '>' || next === '=')) op = ch + next
      else if (ch === '>' && next === '=') op = ch + next
      if (op.length === 2) i += 1
      tokens.push({ t: 'cmp', v: op })
    } else throw new FormulaError('#VALUE!')
    i += 1
  }
  return tokens
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'err'; code: FormulaErrorCode }
  | { k: 'ref'; addr: CellAddress }
  | { k: 'range'; from: CellAddress; to: CellAddress }
  | { k: 'above' }
  | { k: 'left' }
  | { k: 'unary'; op: string; arg: Node }
  | { k: 'pct'; arg: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'cmp'; op: string; l: Node; r: Node }
  | { k: 'call'; name: string; args: Node[] }

const FUNC_NAMES = new Set(['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'ROUND', 'AND', 'OR', 'ABS', 'INT', 'MOD', 'POWER', 'SQRT', 'SIGN'])

class Parser {
  tokens: LexToken[]
  pos = 0
  constructor(tokens: LexToken[]) {
    this.tokens = tokens
  }
  peek(): LexToken | undefined {
    return this.tokens[this.pos]
  }
  next(): LexToken | undefined {
    return this.tokens[this.pos++]
  }
  parseCompare(): Node {
    let left = this.parseExpr()
    const token = this.peek()
    if (!token || token.t !== 'cmp') return left
    this.next()
    const right = this.parseExpr()
    return { k: 'cmp', op: token.v, l: left, r: right }
  }
  parseExpr(): Node {
    let left = this.parseTerm()
    for (;;) {
      const t = this.peek()
      if (!t || t.t !== 'op' || (t.v !== '+' && t.v !== '-')) break
      this.next()
      const right = this.parseTerm()
      left = { k: 'bin', op: t.v, l: left, r: right }
    }
    return left
  }
  parseTerm(): Node {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (!t || t.t !== 'op' || (t.v !== '*' && t.v !== '/')) break
      this.next()
      const right = this.parseUnary()
      left = { k: 'bin', op: t.v, l: left, r: right }
    }
    return left
  }
  parseUnary(): Node {
    const t = this.peek()
    if (t && t.t === 'op' && (t.v === '+' || t.v === '-')) {
      this.next()
      const arg = this.parseUnary()
      return t.v === '-' ? { k: 'unary', op: '-', arg } : arg
    }
    return this.parsePower()
  }
  parsePower(): Node {
    const left = this.parsePostfix()
    const token = this.peek()
    if (!token || token.t !== 'op' || token.v !== '^') return left
    this.next()
    return { k: 'bin', op: '^', l: left, r: this.parseUnary() }
  }
  parsePostfix(): Node {
    let node = this.parsePrimary()
    while (this.peek()?.t === 'pct') {
      this.next()
      node = { k: 'pct', arg: node }
    }
    return node
  }
  parsePrimary(): Node {
    const t = this.next()
    if (!t) throw new FormulaError('#VALUE!')
    if (t.t === 'err') return { k: 'err', code: t.v }
    if (t.t === 'num') return { k: 'num', v: t.v }
    if (t.t === 'lp') {
      const inner = this.parseExpr()
      const close = this.next()
      if (!close || close.t !== 'rp') throw new FormulaError('#VALUE!')
      return inner
    }
    if (t.t === 'ident') {
      const upper = t.v.toUpperCase()
      // 区域：A1:B3
      if (this.peek()?.t === 'colon') {
        this.next()
        const endTok = this.next()
        if (!endTok || endTok.t !== 'ident') throw new FormulaError('#REF!')
        const from = parseCellAddress(t.v)
        const to = parseCellAddress(endTok.v)
        if (!from || !to) throw new FormulaError('#REF!')
        return { k: 'range', from, to }
      }
      // 函数
      if (this.peek()?.t === 'lp') {
        this.next()
        if (!FUNC_NAMES.has(upper)) throw new FormulaError('#NAME?')
        const args: Node[] = []
        if (this.peek()?.t !== 'rp') {
          for (;;) {
            // 括号里可以是加减和比较。括号外的 * 不会被吃进去，SUM(A1:B2)*2 仍然先求和再乘。
            args.push(this.parseCompare())
            if (this.peek()?.t === 'comma') {
              this.next()
              continue
            }
            break
          }
        }
        const close = this.next()
        if (!close || close.t !== 'rp') throw new FormulaError('#VALUE!')
        return { k: 'call', name: upper, args }
      }
      if (upper === 'ABOVE') return { k: 'above' }
      if (upper === 'LEFT') return { k: 'left' }
      const addr = parseCellAddress(t.v)
      if (!addr) throw new FormulaError('#NAME?')
      return { k: 'ref', addr }
    }
    throw new FormulaError('#VALUE!')
  }
}

function parseFormula(body: string): Node {
  const tokens = lex(body)
  if (!tokens.length) throw new FormulaError('#VALUE!')
  const parser = new Parser(tokens)
  const node = parser.parseCompare()
  if (parser.pos !== parser.tokens.length) throw new FormulaError('#VALUE!')
  return node
}

/* ------------------------------------------------------------------ *
 * 求值
 * ------------------------------------------------------------------ */

type Ctx = {
  grid: readonly (readonly string[])[]
  /** 正在求值的公式单元格（1 基），用于循环引用检测。 */
  visiting: Set<string>
}

type CellValue =
  | { kind: 'num'; v: number }
  | { kind: 'blank' }
  | { kind: 'missing' }
  | { kind: 'text' }
  | { kind: 'err'; error: FormulaErrorCode }

function visitKey(row: number, col: number): string {
  return `${row}:${col}`
}

function cellTextAt(ctx: Ctx, addr: CellAddress): string | null {
  const row = ctx.grid[addr.row - 1]
  if (!row) return null
  const text = row[addr.col - 1]
  if (text == null) return null
  return String(text)
}

/** 求某个单元格的数值：常量取数字，公式单元格递归求值。 */
function resolveCell(ctx: Ctx, addr: CellAddress): CellValue {
  const text = cellTextAt(ctx, addr)
  if (text == null) return { kind: 'missing' }
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'blank' }
  if (isFormulaCell(trimmed)) {
    const key = visitKey(addr.row, addr.col)
    if (ctx.visiting.has(key)) return { kind: 'err', error: '#REF!' }
    ctx.visiting.add(key)
    try {
      const value = evalFormulaText(trimmed.slice(1), ctx, addr)
      if (typeof value === 'object') return { kind: 'err', error: value.error }
      return { kind: 'num', v: value }
    } catch (err) {
      if (err instanceof FormulaError) return { kind: 'err', error: err.code }
      throw err
    } finally {
      ctx.visiting.delete(key)
    }
  }
  const num = parseCellNumber(trimmed)
  if (num == null) return { kind: 'text' }
  return { kind: 'num', v: num }
}

/** 区域展开（1 基，含首尾）。 */
function expandRange(from: CellAddress, to: CellAddress): CellAddress[] {
  const rowFrom = Math.min(from.row, to.row)
  const rowTo = Math.max(from.row, to.row)
  const colFrom = Math.min(from.col, to.col)
  const colTo = Math.max(from.col, to.col)
  const out: CellAddress[] = []
  for (let r = rowFrom; r <= rowTo; r += 1) {
    for (let c = colFrom; c <= colTo; c += 1) out.push({ col: c, row: r })
  }
  return out
}

/** ABOVE / LEFT 展开成单元格列表。 */
function expandRelative(kind: 'above' | 'left', at: CellAddress): CellAddress[] {
  const out: CellAddress[] = []
  if (kind === 'above') {
    for (let r = 1; r < at.row; r += 1) out.push({ col: at.col, row: r })
  } else {
    for (let c = 1; c < at.col; c += 1) out.push({ col: c, row: at.row })
  }
  return out
}

type EvalError = { error: FormulaErrorCode }
type EvalValue = number | EvalError

function isError(v: EvalValue): v is EvalError {
  return typeof v === 'object'
}

/** 节点对应的单元格集合（用于聚合函数）。 */
function cellsOf(node: Node, at: CellAddress): CellAddress[] | null {
  if (node.k === 'ref') return [node.addr]
  if (node.k === 'range') return expandRange(node.from, node.to)
  if (node.k === 'above') return expandRelative('above', at)
  if (node.k === 'left') return expandRelative('left', at)
  return null
}

function roundHalfAway(value: number, digits: number): number {
  const factor = 10 ** digits
  const scaled = value * factor
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled))
  return rounded / factor
}

function evalRound(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (!args.length || args.length > 2) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  let digits = 0
  if (args[1]) {
    const places = evalNode(args[1], ctx, at)
    if (isError(places)) return places
    digits = Math.max(-6, Math.min(6, Math.trunc(places)))
  }
  return roundHalfAway(value, digits)
}

function raisePower(base: number, exp: number): EvalValue {
  if (base === 0 && exp < 0) return { error: '#DIV/0!' }
  if (base < 0 && !Number.isInteger(exp)) return { error: '#VALUE!' }
  const result = base ** exp
  if (!Number.isFinite(result)) return { error: '#VALUE!' }
  return result
}

function evalSign(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 1) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

function evalSqrt(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 1) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  if (value < 0) return { error: '#VALUE!' }
  return Math.sqrt(value)
}

function evalPower(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 2) return { error: '#VALUE!' }
  const base = evalNode(args[0]!, ctx, at)
  if (isError(base)) return base
  const exp = evalNode(args[1]!, ctx, at)
  if (isError(exp)) return exp
  return raisePower(base, exp)
}

function evalMod(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 2) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  const divisor = evalNode(args[1]!, ctx, at)
  if (isError(divisor)) return divisor
  if (divisor === 0) return { error: '#DIV/0!' }
  return value - divisor * Math.floor(value / divisor)
}

function evalInt(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 1) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  return Math.floor(value)
}

function evalAbs(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length !== 1) return { error: '#VALUE!' }
  const value = evalNode(args[0]!, ctx, at)
  if (isError(value)) return value
  return Math.abs(value)
}

function evalLogic(name: 'AND' | 'OR', args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (!args.length) return { error: '#VALUE!' }
  if (name === 'AND') {
    for (const arg of args) {
      const value = evalNode(arg, ctx, at)
      if (isError(value)) return value
      if (value === 0) return 0
    }
    return 1
  }
  for (const arg of args) {
    const value = evalNode(arg, ctx, at)
    if (isError(value)) return value
    if (value !== 0) return 1
  }
  return 0
}

function evalIf(args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (args.length < 2 || args.length > 3) return { error: '#VALUE!' }
  const cond = evalNode(args[0]!, ctx, at)
  if (isError(cond)) return cond
  const chosen = cond !== 0 ? args[1] : args[2]
  if (!chosen) return 0
  return evalNode(chosen, ctx, at)
}

function evalCall(name: string, args: Node[], ctx: Ctx, at: CellAddress): EvalValue {
  if (name === 'IF') return evalIf(args, ctx, at)
  if (name === 'AND' || name === 'OR') return evalLogic(name, args, ctx, at)
  if (name === 'ABS') return evalAbs(args, ctx, at)
  if (name === 'INT') return evalInt(args, ctx, at)
  if (name === 'MOD') return evalMod(args, ctx, at)
  if (name === 'POWER') return evalPower(args, ctx, at)
  if (name === 'SQRT') return evalSqrt(args, ctx, at)
  if (name === 'SIGN') return evalSign(args, ctx, at)
  if (name === 'ROUND') return evalRound(args, ctx, at)
  const values: number[] = []
  for (const arg of args) {
    const cells = cellsOf(arg, at)
    if (cells) {
      let sawCell = false
      let sawMissing = false
      for (const addr of cells) {
        const cell = resolveCell(ctx, addr)
        if (cell.kind === 'missing') {
          sawMissing = true
          continue
        }
        sawCell = true
        if (cell.kind === 'err') return cell
        if (cell.kind === 'num') values.push(cell.v)
        // 空白和文字在求和、平均里跳过。整段都在表格外才是 #REF!。
      }
      if (!sawCell && sawMissing) return { error: '#REF!' }
      continue
    }
    const v = evalNode(arg, ctx, at)
    if (isError(v)) return v
    values.push(v)
  }
  if (name === 'COUNT') return values.length
  if (name === 'SUM') return values.reduce((a, b) => a + b, 0)
  if (name === 'AVERAGE') {
    if (!values.length) return { error: '#DIV/0!' }
    return values.reduce((a, b) => a + b, 0) / values.length
  }
  if (name === 'MAX') return values.length ? Math.max(...values) : 0
  if (name === 'MIN') return values.length ? Math.min(...values) : 0
  return { error: '#NAME?' }
}

function evalNode(node: Node, ctx: Ctx, at: CellAddress): EvalValue {
  switch (node.k) {
    case 'num':
      return node.v
    case 'err':
      return { error: node.code }
    case 'unary': {
      const v = evalNode(node.arg, ctx, at)
      if (isError(v)) return v
      return -v
    }
    case 'pct': {
      const v = evalNode(node.arg, ctx, at)
      if (isError(v)) return v
      return v / 100
    }
    case 'cmp': {
      const l = evalNode(node.l, ctx, at)
      if (isError(l)) return l
      const r = evalNode(node.r, ctx, at)
      if (isError(r)) return r
      const ok =
        node.op === '>' ? l > r
        : node.op === '<' ? l < r
        : node.op === '>=' ? l >= r
        : node.op === '<=' ? l <= r
        : node.op === '<>' ? l !== r
        : l === r
      return ok ? 1 : 0
    }
    case 'bin': {
      const l = evalNode(node.l, ctx, at)
      if (isError(l)) return l
      const r = evalNode(node.r, ctx, at)
      if (isError(r)) return r
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          if (r === 0) return { error: '#DIV/0!' }
          return l / r
        case '^':
          return raisePower(l, r)
        default:
          return { error: '#VALUE!' }
      }
    }
    case 'call':
      return evalCall(node.name, node.args, ctx, at)
    case 'ref':
    case 'range':
    case 'above':
    case 'left': {
      const cells = cellsOf(node, at)!
      if (!cells.length) return { error: '#REF!' }
      // 区域/相对区域出现在标量位置时，只在恰好指向一格时取值
      if (cells.length > 1) return { error: '#VALUE!' }
      const cell = resolveCell(ctx, cells[0]!)
      if (cell.kind === 'err') return cell
      if (cell.kind === 'missing') return { error: '#REF!' }
      if (cell.kind === 'blank') return 0
      if (cell.kind === 'text') return { error: '#VALUE!' }
      return cell.v
    }
    default:
      return { error: '#VALUE!' }
  }
}

/** 求公式主体（不含前导 =）。抛 FormulaError 表示公式非法。 */
function evalFormulaText(body: string, ctx: Ctx, at: CellAddress): EvalValue {
  const text = normalizeFormulaPunctuation(String(body ?? '')).trim().replace(/\$/g, '')
  if (!text) throw new FormulaError('#VALUE!')
  const node = parseFormula(text)
  return evalNode(node, ctx, at)
}

/* ------------------------------------------------------------------ *
 * 对外 API
 * ------------------------------------------------------------------ */

/** 公式求值结果。 */
export type FormulaEvalResult =
  | { ok: true; value: string; error: null }
  | { ok: false; value: null; error: FormulaErrorCode }

/**
 * 求值一个公式单元格。formula 是单元格文本（可以带前导 =）。
 * grid 为整个表格的二维文本；row / col 是公式自身的位置（0 基）。
 */
export function evaluateFormula(
  formula: string,
  grid: readonly (readonly string[])[],
  row = 0,
  col = 0,
): FormulaEvalResult {
  const raw = String(formula ?? '').trim()
  if (!raw.startsWith('=')) return { ok: false, value: null, error: '#VALUE!' }
  const ctx: Ctx = { grid, visiting: new Set() }
  try {
    const value = evalFormulaText(raw.slice(1), ctx, { row: row + 1, col: col + 1 })
    if (isError(value)) return { ok: false, value: null, error: value.error }
    if (!Number.isFinite(value)) return { ok: false, value: null, error: '#VALUE!' }
    return { ok: true, value: formatCellNumber(value), error: null }
  } catch (err) {
    if (err instanceof FormulaError) return { ok: false, value: null, error: err.code }
    return { ok: false, value: null, error: '#VALUE!' }
  }
}

/**
 * 求值一个公式单元格，只返回结果文本；出错返回 null（历史行为）。
 */
export function evaluateCellFormula(
  formula: string,
  grid: readonly (readonly string[])[],
  row = 0,
  col = 0,
): string | null {
  const result = evaluateFormula(formula, grid, row, col)
  return result.ok ? result.value : null
}

/** 单个单元格的重算结果。 */
export type FormulaCellOutcome = {
  row: number
  col: number
  /** 公式原文（单元格文本以 = 开头）。 */
  formula: string
  /** 计算结果文本；出错时是错误码。 */
  result: string
  /** 错误码；无错为 null。 */
  error: FormulaErrorCode | null
}

/**
 * 重算整张表：公式单元格替换为计算结果（错误单元格写入错误码）。
 * grid 的每个元素若是公式（以 = 开头），会被解析；否则视为常量。
 */
export function evaluateTableFormulas(grid: readonly (readonly string[])[]): {
  grid: string[][]
  cells: FormulaCellOutcome[]
} {
  const source = (grid || []).map((row) => (row || []).map((cell) => String(cell ?? '')))
  const out = source.map((row) => [...row])
  const cells: FormulaCellOutcome[] = []
  for (let r = 0; r < source.length; r += 1) {
    for (let c = 0; c < source[r]!.length; c += 1) {
      const text = source[r]![c]!
      if (!isFormulaCell(text)) continue
      const result = evaluateFormula(text, source, r, c)
      const value = result.ok ? result.value : result.error
      out[r]![c] = value
      cells.push({ row: r, col: c, formula: text, result: value, error: result.error })
    }
  }
  return { grid: out, cells }
}

/**
 * 重算整张表：公式单元格替换为计算结果（历史行为：出错写空串）。
 */
export function recalculateTable(grid: readonly (readonly string[])[]): string[][] {
  const source = (grid || []).map((row) => (row || []).map((cell) => String(cell ?? '')))
  const out = source.map((row) => [...row])
  for (let r = 0; r < source.length; r += 1) {
    for (let c = 0; c < source[r]!.length; c += 1) {
      const text = source[r]![c]!
      if (!isFormulaCell(text)) continue
      const result = evaluateFormula(text, source, r, c)
      out[r]![c] = result.ok ? result.value : ''
    }
  }
  return out
}

/** 文本是不是公式错误码。 */
export function isErrorCode(text: string): boolean {
  const value = String(text ?? '').trim()
  return (FORMULA_ERROR_CODES as readonly string[]).includes(value)
}
