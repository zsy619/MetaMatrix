/** 表格：复制当前行、把各列收成同样宽度。 */

import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'

const EQUAL_COL_WIDTH = 160

function tableAround(editor: Editor): { node: PmNode; pos: number } | null {
  const $from = editor.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'table') continue
    return { node, pos: $from.before(depth) }
  }
  return null
}

function rowAround(editor: Editor): { node: PmNode; pos: number } | null {
  const $from = editor.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'tableRow') continue
    return { node, pos: $from.before(depth) }
  }
  return null
}

/** 在当前行后面插入一份相同内容的行。 */
export function duplicateTableRow(editor: Editor): boolean {
  const row = rowAround(editor)
  if (!row) return false
  const copy = row.node.copy(row.node.content)
  const tr = editor.state.tr.insert(row.pos + row.node.nodeSize, copy)
  editor.view.dispatch(tr)
  return true
}

function sameWidths(current: unknown, next: number[]): boolean {
  if (!Array.isArray(current) || current.length !== next.length) return false
  return next.every((width, index) => Number(current[index]) === width)
}

/** 把当前行上移或下移一格。一次只产生一步撤销。 */
export function moveTableRow(editor: Editor, dir: -1 | 1): boolean {
  const table = tableAround(editor)
  if (!table) return false
  const { $from } = editor.state.selection
  let rowIndex = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'tableRow') rowIndex = $from.index(depth)
  }
  const rows: PmNode[] = []
  table.node.forEach((row) => rows.push(row))
  const next = rowIndex + dir
  if (rowIndex < 0 || next < 0 || next >= rows.length) return false
  const order = rows.slice()
  const [moved] = order.splice(rowIndex, 1)
  order.splice(next, 0, moved!)
  editor.view.dispatch(editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, table.node.type.create(table.node.attrs, order)))
  return true
}

/** 把当前列左移或右移。有合并单元格时不动。一次只产生一步撤销。 */
export function moveTableColumn(editor: Editor, dir: -1 | 1): boolean {
  const table = tableAround(editor)
  if (!table) return false
  const { $from } = editor.state.selection
  let colIndex = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') colIndex = $from.index(depth)
  }
  if (colIndex < 0) return false
  const rows: PmNode[] = []
  table.node.forEach((row) => rows.push(row))
  let merged = false
  rows.forEach((row) => {
    row.forEach((cell) => {
      if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1) merged = true
    })
  })
  if (merged) return false
  const width = rows[0]?.childCount || 0
  const next = colIndex + dir
  if (next < 0 || next >= width) return false
  const nextRows = rows.map((row) => {
    const cells: PmNode[] = []
    row.forEach((cell) => cells.push(cell))
    const order = cells.slice()
    const [moved] = order.splice(colIndex, 1)
    order.splice(next, 0, moved!)
    return row.type.create(row.attrs, order)
  })
  editor.view.dispatch(editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, table.node.type.create(table.node.attrs, nextRows)))
  return true
}

/** 当前表格每一列都写成同样的列宽。合并单元格按跨列数写多个宽度。 */
export function equalizeTableColumns(editor: Editor, width = EQUAL_COL_WIDTH): boolean {
  const table = tableAround(editor)
  if (!table) return false
  let tr = editor.state.tr
  let rowPos = table.pos + 1
  table.node.forEach((row) => {
    let cellPos = rowPos + 1
    row.forEach((cell) => {
      const span = Math.max(1, Number(cell.attrs.colspan) || 1)
      const next = Array.from({ length: span }, () => width)
      if (!sameWidths(cell.attrs.colwidth, next)) {
        tr = tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, colwidth: next })
      }
      cellPos += cell.nodeSize
    })
    rowPos += row.nodeSize
  })
  if (!tr.docChanged) return false
  editor.view.dispatch(tr)
  return true
}
