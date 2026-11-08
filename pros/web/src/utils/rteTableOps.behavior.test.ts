// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { CellSelection } from '@tiptap/pm/tables'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function cellAt(ed: Editor, row: number, col: number): number {
  let found = -1
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0 || node.type.name !== 'table') return false
    let at = pos + 1
    for (let r = 0; r < row; r += 1) at += node.child(r).nodeSize
    at += 1
    const rowNode = node.child(row)
    for (let c = 0; c < col; c += 1) at += rowNode.child(c).nodeSize
    found = at
    return false
  })
  if (found < 0) throw new Error('没有单元格')
  return found
}

function makeEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      RteTableHeader,
      RteTableCell,
    ],
    content: '<p>前</p>',
  })
  return editor
}

describe('表格合并、背景和列宽', () => {
  it('菜单用的同一条命令能合并、拆分、上色，撤销重做和重载都还在', async () => {
    const ed = makeEditor()
    expect(ed.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 600))
    const anchor = cellAt(ed, 1, 0)
    const head = cellAt(ed, 1, 1)
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, anchor, head)))
    expect(ed.chain().focus().mergeCells().run()).toBe(true)
    expect(ed.getHTML()).toContain('colspan="2"')
    ed.commands.undo()
    expect(ed.getHTML()).toContain('<table')
    expect(ed.getHTML()).not.toContain('colspan="2"')
    ed.commands.redo()
    expect(ed.getHTML()).toContain('colspan="2"')
    expect(ed.chain().focus().splitCell().run()).toBe(true)
    expect(ed.getHTML()).not.toContain('colspan="2"')

    const colored = cellAt(ed, 1, 0)
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, colored)))
    expect(ed.chain().focus().setCellAttribute('backgroundColor', '#eff6ff').run()).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain('data-bg="#eff6ff"')
    const saved = html
    ed.commands.undo()
    expect(ed.getHTML()).not.toContain('data-bg="#eff6ff"')
    ed.commands.setContent(saved)
    expect(ed.getHTML()).toContain('data-bg="#eff6ff"')
    expect(ed.getHTML()).toContain('<table')

    const widthPos = cellAt(ed, 0, 0)
    const cell = ed.state.doc.nodeAt(widthPos)
    expect(cell).toBeTruthy()
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(widthPos, undefined, { ...cell!.attrs, colwidth: [180] }),
    )
    const widened = ed.getHTML()
    expect(widened).toMatch(/colwidth="180"/)
    ed.commands.setContent(widened)
    const again = ed.state.doc.nodeAt(cellAt(ed, 0, 0))
    expect(again?.attrs.colwidth).toEqual([180])
    ed.commands.undo()
  })
})
