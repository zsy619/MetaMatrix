/**
 * 表格单元格与公式栏的文档操作。
 *
 * 这里只做「定位单元格 / 读取公式原文 / 回写公式并重算」三件事，
 * 计算逻辑全部在 rteTableFormula.ts 里（纯函数）。
 */

import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import {
  evaluateFormula,
  evaluateTableFormulas,
  formatCellAddress,
  isFormulaCell,
  type FormulaErrorCode,
} from './rteTableFormula'

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

function isCellNode(node: PmNode | undefined | null): boolean {
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
    const colIndex = headCell.index(depth)
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
  const colIndex = $head.index(rowDepth)
  const table = $head.node(tableDepth)
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
  table.forEach((rowNode, rowOffset, rowIdx) => {
    if (found != null) return false
    if (rowIdx !== rowIndex) return
    const rowPos = tablePos + 1 + rowOffset
    let cellPos = rowPos + 1
    let col = 0
    rowNode.forEach((cellNode) => {
      if (col === colIndex) found = cellPos
      cellPos += cellNode.nodeSize
      col += 1
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

/** 表格的原始文本网格（公式单元格取公式原文，其它取显示文本）。 */
export function tableGrid(table: PmNode): string[][] {
  const grid: string[][] = []
  table.forEach((rowNode) => {
    const row: string[] = []
    rowNode.forEach((cellNode) => {
      const formula = cellFormulaText(cellNode)
      row.push(formula || cellDisplayText(cellNode))
    })
    grid.push(row)
  })
  return grid
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
    for (let colIndex = 0; colIndex < cellNodes.length; colIndex += 1) {
      const cellNode = cellNodes[colIndex]!
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
  editor.view.dispatch(tr)
  return { ok: true, display: target, error }
}
