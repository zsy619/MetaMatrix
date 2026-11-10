import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

function dispatch(view: EditorView, tr: Transaction): boolean {
  try {
    tr.doc.check()
  } catch {
    return false
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}

/** 把从 1 重开的有序列表接到上一列表的末号之后。 */
export function continueOrderedList(view: EditorView, listPos: number): boolean {
  if (!view.editable) return false
  const list = view.state.doc.nodeAt(listPos)
  if (!list || list.type.name !== 'orderedList') return false
  const $pos = view.state.doc.resolve(listPos)
  const parent = $pos.parent
  const index = $pos.index()
  let prevStart = 1
  let prevCount = 0
  for (let i = index - 1; i >= 0; i -= 1) {
    const sibling = parent.child(i)
    if (sibling.type.name === 'orderedList') {
      prevStart = Number(sibling.attrs.start) || 1
      prevCount = sibling.childCount
      break
    }
    if (!(sibling.type.name === 'paragraph' && sibling.content.size === 0)) break
  }
  if (!prevCount) return false
  const start = prevStart + prevCount
  if ((Number(list.attrs.start) || 1) === start) return false
  return dispatch(view, view.state.tr.setNodeMarkup(listPos, undefined, { ...list.attrs, start }))
}

/** 把表格第一行的普通单元格改成表头。 */
export function promoteTableHeader(view: EditorView, tablePos: number): boolean {
  if (!view.editable) return false
  const table = view.state.doc.nodeAt(tablePos)
  const headerType = view.state.schema.nodes.tableHeader
  if (!table || table.type.name !== 'table' || !headerType) return false
  const row = table.firstChild
  if (!row || row.type.name !== 'tableRow') return false
  const rowPos = tablePos + 1
  const cells: Array<{ pos: number; node: PMNode }> = []
  let cursor = rowPos + 1
  row.forEach((cell) => {
    cells.push({ pos: cursor, node: cell })
    cursor += cell.nodeSize
  })
  if (!cells.some((cell) => cell.node.type.name === 'tableCell')) return false
  let tr = view.state.tr
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const cell = cells[i]!
    if (cell.node.type.name === 'tableHeader') continue
    const from = tr.mapping.map(cell.pos)
    const header = headerType.create(cell.node.attrs, cell.node.content, cell.node.marks)
    tr = tr.replaceWith(from, from + cell.node.nodeSize, header)
  }
  return dispatch(view, tr)
}
