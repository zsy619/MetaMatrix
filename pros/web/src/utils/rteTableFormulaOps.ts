/**
 * 表格单元格与公式栏的文档操作。
 *
 * 这里只做「定位单元格 / 读取公式原文 / 回写公式并重算」三件事，
 * 计算逻辑全部在 rteTableFormula.ts 里（纯函数）。
 */

import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import {
  evaluateFormula,
  evaluateTableFormulas,
  formatCellAddress,
  isFormulaCell,
  remapFormulaByAxis,
  type FormulaErrorCode,
} from './rteTableFormula'

/** 自动重算事务的标记，避免写回结果后再触发一轮。 */
export const TABLE_FORMULA_RECALC = 'tableFormulaRecalc'

/** 排序、合计这类整表改写。公式要跟着重算，不能当成用户改了格子而清掉。 */
export const TABLE_STRUCTURE = 'tableStructure'

/** 定位到的单元格。 */
export type TableCellLocation = {
  /** 表格节点在文档中的位置。 */
  tablePos: number
  table: PmNode
  /** 行号（0 基，含表头行）。 */
  rowIndex: number
  /** 列号（0 基）。 */
  colIndex: number
  /** 单元格节点在文档中的位置。 */
  cellPos: number
  cell: PmNode
  /** 单元格地址，如 B3。 */
  address: string
}

const CELL_TYPES = new Set(['tableCell', 'tableHeader'])

function isCellNode(node: PmNode | undefined | null): node is PmNode {
  return !!node && CELL_TYPES.has(node.type.name)
}

/**
 * 从当前选区定位单元格。选区不在表格里返回 null。
 * 兼容普通文本选区（光标在单元格里）与 CellSelection（多选单元格）。
 *
 * ProseMirror 位置约定（容易踩坑）：
 * - ResolvedPos.index(d) 是「第 d+1 层节点」在父节点里的序号；
 * - ResolvedPos.before(d) 是「第 d 层节点」在父节点里的起始位置。
 */
export function findSelectedCell(state: {
  selection: {
    $head: { depth: number; node: (d: number) => PmNode; index: (d: number) => number; before: (d: number) => number }
    $headCell?: {
      depth: number
      node: (d?: number) => PmNode
      nodeAfter: PmNode | null
      index: (d: number) => number
      before: (d: number) => number
    }
  }
}): TableCellLocation | null {
  const sel = state.selection
  // 多选单元格：CellSelection 带 $headCell（位置落在「行里、单元格之前」）
  const headCell = sel.$headCell
  if (headCell) {
    const cell = headCell.nodeAfter
    if (!isCellNode(cell)) return null
    const depth = headCell.depth
    const row = headCell.node(depth - 1)
    const table = headCell.node(depth - 2)
    if (!row || row.type.name !== 'tableRow') return null
    if (!table || table.type.name !== 'table') return null
    const rowIndex = headCell.index(depth - 1)
    const colIndex = visualCellColumn(table, rowIndex, headCell.index(depth))
    if (rowIndex < 0 || colIndex < 0) return null
    const tablePos = headCell.before(depth - 1)
    const cellPos = cellPosition(tablePos, table, rowIndex, colIndex)
    if (cellPos == null) return null
    return {
      tablePos,
      table,
      rowIndex,
      colIndex,
      cellPos,
      cell,
      address: formatCellAddress({ col: colIndex + 1, row: rowIndex + 1 }),
    }
  }

  const $head = sel.$head
  let cellDepth = -1
  for (let d = $head.depth; d > 0; d -= 1) {
    if (isCellNode($head.node(d))) {
      cellDepth = d
      break
    }
  }
  if (cellDepth < 2) return null
  const rowDepth = cellDepth - 1
  const tableDepth = cellDepth - 2
  if ($head.node(rowDepth).type.name !== 'tableRow') return null
  if ($head.node(tableDepth).type.name !== 'table') return null
  const rowIndex = $head.index(tableDepth)
  const table = $head.node(tableDepth)
  const colIndex = visualCellColumn(table, rowIndex, $head.index(rowDepth))
  const tablePos = $head.before(tableDepth)
  const cellPos = cellPosition(tablePos, table, rowIndex, colIndex)
  if (cellPos == null) return null
  return {
    tablePos,
    table,
    rowIndex,
    colIndex,
    cellPos,
    cell: $head.node(cellDepth),
    address: formatCellAddress({ col: colIndex + 1, row: rowIndex + 1 }),
  }
}

/**
 * 单元格在文档中的位置；行列不存在返回 null。
 *
 * 注意：ProseMirror 的 forEach 回调第二个参数是「子节点在父内容里的起始偏移」，
 * 第三个参数才是序号；行位置 = tablePos + 1 + offset。
 */
export function cellPosition(tablePos: number, table: PmNode, rowIndex: number, colIndex: number): number | null {
  let found: number | null = null
  const occupied: boolean[][] = []
  table.forEach((rowNode, rowOffset, rowIdx) => {
    if (found != null) return false
    const rowPos = tablePos + 1 + rowOffset
    let cellPos = rowPos + 1
    let col = 0
    rowNode.forEach((cellNode) => {
      while (occupied[rowIdx]?.[col]) col += 1
      const { colspan, rowspan } = cellSpan(cellNode)
      if (rowIdx === rowIndex && col === colIndex) found = cellPos
      for (let down = 0; down < rowspan; down += 1) {
        if (!occupied[rowIdx + down]) occupied[rowIdx + down] = []
        for (let span = 0; span < colspan; span += 1) occupied[rowIdx + down]![col + span] = true
      }
      cellPos += cellNode.nodeSize
      col += colspan
    })
  })
  return found
}

/** 单元格公式原文：优先 data-formula，其次以 = 开头的文本。 */
export function cellFormulaText(cell: PmNode): string {
  const stored = typeof cell.attrs?.formula === 'string' ? cell.attrs.formula : ''
  if (stored) return stored
  const text = (cell.textContent || '').trim()
  return isFormulaCell(text) ? text : ''
}

/** 单元格显示文本。 */
export function cellDisplayText(cell: PmNode): string {
  return (cell.textContent || '').trim()
}

function cellSpan(cell: PmNode): { colspan: number; rowspan: number } {
  return {
    colspan: Math.max(1, Number(cell.attrs.colspan) || 1),
    rowspan: Math.max(1, Number(cell.attrs.rowspan) || 1),
  }
}

/** 把合并单元格铺成矩形网格。被跨过的格子是空字符串，起点格用 textOf。 */
export function tableTextGrid(table: PmNode, textOf: (cell: PmNode) => string): string[][] {
  const grid: string[][] = []
  const occupied: boolean[][] = []
  let rowIndex = 0
  table.forEach((rowNode) => {
    let col = 0
    rowNode.forEach((cellNode) => {
      while (occupied[rowIndex]?.[col]) col += 1
      const text = textOf(cellNode)
      const { colspan, rowspan } = cellSpan(cellNode)
      for (let row = 0; row < rowspan; row += 1) {
        if (!grid[rowIndex + row]) grid[rowIndex + row] = []
        if (!occupied[rowIndex + row]) occupied[rowIndex + row] = []
        for (let span = 0; span < colspan; span += 1) {
          const covered = grid[rowIndex + row]![col + span]
          grid[rowIndex + row]![col + span] = row === 0 && span === 0 ? text : (covered ?? '')
          occupied[rowIndex + row]![col + span] = true
        }
      }
      col += colspan
    })
    rowIndex += 1
  })
  const height = rowIndex
  const width = Math.max(0, ...grid.slice(0, height).map((row) => row.length))
  return Array.from({ length: height }, (_, index) => {
    const row = grid[index] ?? []
    return Array.from({ length: width }, (_, col) => row[col] ?? '')
  })
}

/** 子单元格在视觉网格里的起始列。上一行的 rowspan 会把后面的格子往右推。 */
export function visualCellColumn(table: PmNode, rowIndex: number, childIndex: number): number {
  let result = childIndex
  const occupied: boolean[][] = []
  let row = 0
  table.forEach((rowNode) => {
    let col = 0
    let child = 0
    rowNode.forEach((cellNode) => {
      while (occupied[row]?.[col]) col += 1
      if (row === rowIndex && child === childIndex) result = col
      const { colspan, rowspan } = cellSpan(cellNode)
      for (let down = 0; down < rowspan; down += 1) {
        if (!occupied[row + down]) occupied[row + down] = []
        for (let span = 0; span < colspan; span += 1) occupied[row + down]![col + span] = true
      }
      col += colspan
      child += 1
    })
    row += 1
  })
  return result
}

/** 表格的原始文本网格（公式单元格取公式原文，其它取显示文本）。 */
export function tableGrid(table: PmNode): string[][] {
  return tableTextGrid(table, (cell) => cellFormulaText(cell) || cellDisplayText(cell))
}

export type TableFormulaUpdate = {
  rowIndex: number
  childIndex: number
  formula: string
  display: string
  next: string
}

/** 按视觉列重算。合并单元格占掉的列也算进地址，公式不会读到旁边那一格。 */
export function tableFormulaUpdates(table: PmNode): TableFormulaUpdate[] {
  const { grid } = evaluateTableFormulas(tableGrid(table))
  const updates: TableFormulaUpdate[] = []
  table.forEach((row, _rowOffset, rowIndex) => {
    if (row.type.name !== 'tableRow') return
    row.forEach((cell, _cellOffset, childIndex) => {
      const formula = cellFormulaText(cell)
      if (!formula) return
      const colIndex = visualCellColumn(table, rowIndex, childIndex)
      updates.push({
        rowIndex,
        childIndex,
        formula,
        display: cellDisplayText(cell),
        next: grid[rowIndex]?.[colIndex] ?? '',
      })
    })
  })
  return updates
}

/** 回写结果。 */
export type ApplyFormulaResult = {
  /** 是否成功写入。 */
  ok: boolean
  /** 编辑后的单元格显示文本（计算值或错误码）。 */
  display: string
  /** 计算错误码；无错为 null。 */
  error: FormulaErrorCode | null
}

/**
 * 回写公式栏输入并重算整张表。
 *
 * - 输入以 = 开头：视为公式，原文写进单元格的 data-formula，显示文本写计算结果。
 * - 其它输入：视为普通文本，清掉 data-formula。
 * - 其它公式单元格一并重算；错误以 #REF! / #VALUE! 等错误码写入。
 */
export function applyCellInput(editor: Editor, loc: TableCellLocation, input: string): ApplyFormulaResult {
  const schema = editor.state.schema
  const trimmed = String(input ?? '').trim()
  const isFormula = isFormulaCell(trimmed)
  const grid = tableGrid(loc.table)
  if (!grid[loc.rowIndex]) return { ok: false, display: '', error: '#REF!' }
  grid[loc.rowIndex]![loc.colIndex] = trimmed
  const { grid: computed } = evaluateTableFormulas(grid)

  const target = computed[loc.rowIndex]?.[loc.colIndex] ?? trimmed
  const error = isFormula ? evaluateFormula(trimmed, grid, loc.rowIndex, loc.colIndex).error : null

  // 逐格算出新的显示文本与公式原文。
  // 从后往前替换，避免前面的改动影响后面的位置。
  const rowNodes: PmNode[] = []
  loc.table.forEach((rowNode) => rowNodes.push(rowNode))
  const updates: Array<{ cellPos: number; cell: PmNode; text: string; formula: string }> = []
  for (let rowIndex = 0; rowIndex < rowNodes.length; rowIndex += 1) {
    const rowNode = rowNodes[rowIndex]!
    let cellPos = loc.tablePos + 1
    for (let r = 0; r < rowIndex; r += 1) cellPos += rowNodes[r]!.nodeSize
    cellPos += 1
    const cellNodes: PmNode[] = []
    rowNode.forEach((cellNode) => cellNodes.push(cellNode))
    for (let childIndex = 0; childIndex < cellNodes.length; childIndex += 1) {
      const cellNode = cellNodes[childIndex]!
      const colIndex = visualCellColumn(loc.table, rowIndex, childIndex)
      const nextText = computed[rowIndex]?.[colIndex] ?? cellDisplayText(cellNode)
      const isTarget = rowIndex === loc.rowIndex && colIndex === loc.colIndex
      const nextFormula = isTarget ? (isFormula ? trimmed : '') : cellFormulaText(cellNode)
      const currentText = cellDisplayText(cellNode)
      const currentFormula = cellFormulaText(cellNode)
      if (nextText !== currentText || nextFormula !== currentFormula) {
        updates.push({ cellPos, cell: cellNode, text: nextText, formula: nextFormula })
      }
      cellPos += cellNode.nodeSize
    }
  }

  if (!updates.length) {
    return { ok: true, display: target, error }
  }

  const tr = editor.state.tr
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const item = updates[i]!
    tr.setNodeMarkup(item.cellPos, undefined, {
      ...item.cell.attrs,
      formula: item.formula || null,
    })
    const first = item.cell.firstChild
    if (!first) continue
    const from = item.cellPos + 2
    const to = item.cellPos + first.nodeSize
    if (to < from) continue
    if (item.text) tr.replaceWith(from, to, schema.text(item.text))
    else tr.delete(from, to)
  }
  tr.setMeta(TABLE_FORMULA_RECALC, true)
  editor.view.dispatch(tr)
  return { ok: true, display: target, error }
}

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo
}

/** 把各步改动的区间映射到事务结束时的文档位置。 */
export function editedRanges(transactions: readonly Transaction[]): Array<{ from: number; to: number }> {
  const maps = transactions.flatMap((tr) => tr.mapping.maps)
  const ranges: Array<{ from: number; to: number }> = []
  let index = 0
  for (const tr of transactions) {
    for (const map of tr.mapping.maps) {
      const after = index + 1
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        let from = newStart
        let to = newEnd
        for (let i = after; i < maps.length; i += 1) {
          from = maps[i]!.map(from, -1)
          to = maps[i]!.map(to, 1)
        }
        if (to < from) {
          const swap = from
          from = to
          to = swap
        }
        ranges.push({ from, to })
      })
      index += 1
    }
  }
  return ranges
}

/**
 * 已保存公式的单元格，在其它格子改动后重算显示值。
 * 正在手改的公式原文不动；手改成普通数字则清掉公式。
 */
export function formulaRecalcTransaction(
  state: EditorState,
  edited: readonly { from: number; to: number }[],
): Transaction | null {
  const updates: Array<{ cellPos: number; cell: PmNode; text: string; formula: string | null }> = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return
    const grid = tableGrid(node)
    const { grid: computed } = evaluateTableFormulas(grid)
    let rowIndex = 0
    node.forEach((rowNode, rowOffset) => {
      const rowPos = pos + 1 + rowOffset
      let cellPos = rowPos + 1
      let childIndex = 0
      rowNode.forEach((cellNode) => {
        const colIndex = visualCellColumn(node, rowIndex, childIndex)
        const stored = typeof cellNode.attrs?.formula === 'string' ? cellNode.attrs.formula.trim() : ''
        if (stored) {
          const display = cellDisplayText(cellNode)
          const next = computed[rowIndex]?.[colIndex] ?? display
          const contentFrom = cellPos + 1
          const contentTo = cellPos + cellNode.nodeSize - 1
          const touched = edited.some((range) => rangesOverlap(range.from, range.to, contentFrom, contentTo))
          if (touched && isFormulaCell(display)) {
            /* 格子里正在输入公式原文 */
          } else if (touched && display !== next) {
            updates.push({ cellPos, cell: cellNode, text: display, formula: null })
          } else if (!touched && display !== next) {
            updates.push({ cellPos, cell: cellNode, text: next, formula: stored })
          }
        }
        cellPos += cellNode.nodeSize
        childIndex += 1
      })
      rowIndex += 1
    })
    return false
  })
  if (!updates.length) return null
  let tr = state.tr
  updates.sort((a, b) => b.cellPos - a.cellPos)
  for (const item of updates) {
    const cellPos = tr.mapping.map(item.cellPos)
    const cell = tr.doc.nodeAt(cellPos)
    if (!cell) continue
    tr = tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, formula: item.formula })
    const first = cell.firstChild
    if (!first || !item.formula) continue
    const from = cellPos + 2
    const to = cellPos + first.nodeSize
    if (to < from) continue
    const live = tr.doc.nodeAt(cellPos)
    const liveFirst = live?.firstChild
    if (!liveFirst) continue
    const liveFrom = cellPos + 2
    const liveTo = cellPos + liveFirst.nodeSize
    if (item.text) tr = tr.replaceWith(liveFrom, liveTo, state.schema.text(item.text))
    else if (liveTo > liveFrom) tr = tr.delete(liveFrom, liveTo)
  }
  if (!tr.docChanged) return null
  tr.setMeta(TABLE_FORMULA_RECALC, true)
  return tr
}

type AxisMap = Map<number, number | null>

function tableRows(table: PmNode): PmNode[] {
  const rows: PmNode[] = []
  table.forEach((row) => {
    if (row.type.name === 'tableRow') rows.push(row)
  })
  return rows
}

function tableHasMerge(table: PmNode): boolean {
  let merged = false
  tableRows(table).forEach((row) => {
    row.forEach((cell) => {
      if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1) merged = true
    })
  })
  return merged
}

function cellAnchors(table: PmNode): Map<PmNode, { row: number; col: number }> {
  const anchors = new Map<PmNode, { row: number; col: number }>()
  tableRows(table).forEach((row, rowIndex) => {
    row.forEach((cell, _offset, colIndex) => {
      anchors.set(cell, { row: rowIndex + 1, col: colIndex + 1 })
    })
  })
  return anchors
}

function colWidth(table: PmNode): number {
  return tableRows(table).reduce((max, row) => Math.max(max, row.childCount), 0)
}

function missingIndexes(size: number, present: Set<number>): number[] {
  const missing: number[] = []
  for (let index = 1; index <= size; index += 1) {
    if (!present.has(index)) missing.push(index)
  }
  return missing
}

function voteAxis(
  pairs: Array<{ from: number; to: number }>,
  fromSize: number,
  missing: number[],
): AxisMap | null {
  const votes = new Map<number, Set<number>>()
  for (const pair of pairs) {
    const bucket = votes.get(pair.from) ?? new Set<number>()
    bucket.add(pair.to)
    votes.set(pair.from, bucket)
  }
  const map: AxisMap = new Map()
  for (const [from, bucket] of votes) {
    if (bucket.size !== 1) return null
    map.set(from, [...bucket][0]!)
  }
  for (const index of missing) map.set(index, null)
  if (map.size !== fromSize) return null
  return map
}

function axisSame(map: AxisMap, size: number): boolean {
  if (map.size !== size) return false
  for (let index = 1; index <= size; index += 1) {
    if (map.get(index) !== index) return false
  }
  return true
}

function formulaKey(row: PmNode): string | null {
  const parts: string[] = []
  let any = false
  row.forEach((cell) => {
    const stored = typeof cell.attrs.formula === 'string' ? cell.attrs.formula.trim() : ''
    const text = cell.textContent.trim()
    const formula = stored.startsWith('=') ? stored : text.startsWith('=') ? text : ''
    if (formula) any = true
    parts.push(formula)
  })
  return any ? parts.join('\u0001') : null
}

function planTableShift(oldTable: PmNode, newTable: PmNode): {
  rowMap: AxisMap
  colMap: AxisMap
  duplicateDeltas: Map<number, number>
} | null {
  if (tableHasMerge(oldTable) || tableHasMerge(newTable)) return null
  const oldRows = tableRows(oldTable)
  const newRows = tableRows(newTable)
  const oldAnchors = cellAnchors(oldTable)
  const newAnchors = cellAnchors(newTable)
  const pairs: Array<{ oldRow: number; oldCol: number; newRow: number; newCol: number }> = []
  newAnchors.forEach((neu, cell) => {
    const old = oldAnchors.get(cell)
    if (!old) return
    pairs.push({ oldRow: old.row, oldCol: old.col, newRow: neu.row, newCol: neu.col })
  })
  if (!pairs.length) return null
  const oldRowCount = oldRows.length
  const newRowCount = newRows.length
  const oldColCount = colWidth(oldTable)
  const newColCount = colWidth(newTable)
  const matchedOldRows = new Set(pairs.map((pair) => pair.oldRow))
  const matchedNewRows = new Set(pairs.map((pair) => pair.newRow))
  const matchedOldCols = new Set(pairs.map((pair) => pair.oldCol))
  const matchedNewCols = new Set(pairs.map((pair) => pair.newCol))
  const unmatchedOldRows = missingIndexes(oldRowCount, matchedOldRows)
  const unmatchedNewRows = missingIndexes(newRowCount, matchedNewRows)
  const unmatchedOldCols = missingIndexes(oldColCount, matchedOldCols)
  const unmatchedNewCols = missingIndexes(newColCount, matchedNewCols)
  const sameShape = oldRowCount === newRowCount && oldColCount === newColCount
  if (sameShape && unmatchedOldRows.length && unmatchedNewRows.length) return null
  if (sameShape && unmatchedOldCols.length && unmatchedNewCols.length) return null
  if (unmatchedNewRows.length && unmatchedNewCols.length) return null
  if (unmatchedOldRows.length && unmatchedOldCols.length) return null
  if (unmatchedNewRows.length && unmatchedOldCols.length) return null
  if (unmatchedOldRows.length && unmatchedNewCols.length) return null
  const rowMap = voteAxis(
    pairs.map((pair) => ({ from: pair.oldRow, to: pair.newRow })),
    oldRowCount,
    unmatchedOldRows,
  )
  const colMap = voteAxis(
    pairs.map((pair) => ({ from: pair.oldCol, to: pair.newCol })),
    oldColCount,
    unmatchedOldCols,
  )
  if (!rowMap || !colMap) return null
  const duplicateDeltas = new Map<number, number>()
  for (const rowIndex of unmatchedNewRows) {
    if (rowIndex < 2) continue
    const row = newRows[rowIndex - 1]
    const prev = newRows[rowIndex - 2]
    if (!row || !prev) continue
    const key = formulaKey(row)
    if (key && key === formulaKey(prev)) duplicateDeltas.set(rowIndex, 1)
  }
  if (axisSame(rowMap, oldRowCount) && axisSame(colMap, oldColCount) && !duplicateDeltas.size) return null
  return { rowMap, colMap, duplicateDeltas }
}

function mapPosBackward(pos: number, transactions: readonly Transaction[]): number {
  let at = pos
  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    at = transactions[index]!.mapping.invert().map(at, -1)
  }
  return at
}

/**
 * 插入、删除、移动行列后，公式地址跟着原来的格子走。
 * 复制出来的行按相对位置再错一格。返回的事务已经带上重算。
 */
export function formulaFollowTransaction(
  oldState: EditorState,
  newState: EditorState,
  transactions: readonly Transaction[],
): Transaction | null {
  const jobs: Array<{ cellPos: number; formula: string }> = []
  newState.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return
    const oldNode = oldState.doc.nodeAt(mapPosBackward(pos, transactions))
    if (!oldNode || oldNode.type.name !== 'table' || oldNode === node) return
    const plan = planTableShift(oldNode, node)
    if (!plan) return
    let rowIndex = 0
    node.forEach((rowNode, rowOffset) => {
      if (rowNode.type.name !== 'tableRow') return
      const rowNumber = rowIndex + 1
      rowIndex += 1
      const rowPos = pos + 1 + rowOffset
      let cellPos = rowPos + 1
      const delta = plan.duplicateDeltas.get(rowNumber)
      const mapRow = delta
        ? (row: number) => {
            const next = row + delta
            return next >= 1 ? next : null
          }
        : (row: number) => (plan.rowMap.has(row) ? plan.rowMap.get(row)! : row)
      const mapCol = (col: number) => (plan.colMap.has(col) ? plan.colMap.get(col)! : col)
      rowNode.forEach((cell) => {
        const formula = cellFormulaText(cell)
        if (formula.startsWith('=')) {
          const next = remapFormulaByAxis(formula, mapRow, mapCol)
          if (next !== formula) jobs.push({ cellPos, formula: next })
        }
        cellPos += cell.nodeSize
      })
    })
  })
  if (!jobs.length) return null
  let shifted = newState.tr
  jobs.sort((a, b) => b.cellPos - a.cellPos)
  for (const job of jobs) {
    const cell = shifted.doc.nodeAt(job.cellPos)
    if (!cell) continue
    shifted = shifted.setNodeMarkup(job.cellPos, undefined, { ...cell.attrs, formula: job.formula })
    const live = shifted.doc.nodeAt(job.cellPos)
    const first = live?.firstChild
    if (!first || !isFormulaCell(first.textContent || '')) continue
    const from = job.cellPos + 2
    const to = job.cellPos + first.nodeSize
    if (to <= from) continue
    shifted = shifted.replaceWith(from, to, newState.schema.text(job.formula))
  }
  if (!shifted.docChanged) return null
  // 不用 newState.apply：那会再跑一遍插件，把显示结果算进另一个状态，步骤却留在原地。
  const bare = EditorState.create({ schema: newState.schema, doc: shifted.doc })
  const recalc = formulaRecalcTransaction(bare, [])
  if (recalc) {
    for (const step of recalc.steps) {
      if (shifted.maybeStep(step).failed) break
    }
  }
  if (!shifted.docChanged) return null
  shifted.setMeta(TABLE_FORMULA_RECALC, true)
  return shifted
}
