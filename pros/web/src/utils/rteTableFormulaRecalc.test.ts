// @vitest-environment happy-dom
/** 已保存的表格公式在引用单元格改动后自动重算。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { applyCellInput, findSelectedCell } from './rteTableFormulaOps'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const html = `
<table>
  <tbody>
    <tr><td><p>44</p></td><td><p></p></td></tr>
    <tr><td><p>222</p></td><td><p></p></td></tr>
    <tr><td><p></p></td><td><p></p></td></tr>
  </tbody>
</table>`

function makeEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), Table, TableRow, RteTableHeader, RteTableCell],
    content: html,
  })
  return editor
}

function focusCell(ed: Editor, row: number, col: number) {
  let tablePos = -1
  ed.state.doc.descendants((node, pos) => {
    if (tablePos >= 0) return false
    if (node.type.name === 'table') tablePos = pos
    return tablePos < 0
  })
  const table = ed.state.doc.nodeAt(tablePos)!
  let cellPos = -1
  let rowIndex = 0
  table.forEach((rowNode, rowOffset) => {
    if (cellPos >= 0) return
    const rowPos = tablePos + 1 + rowOffset
    let colIndex = 0
    rowNode.forEach((_cell, cellOffset) => {
      if (cellPos >= 0) return
      if (rowIndex === row && colIndex === col) cellPos = rowPos + 1 + cellOffset
      colIndex += 1
    })
    rowIndex += 1
  })
  ed.commands.setTextSelection(cellPos + 2)
  return cellPos
}

describe('表格公式自动重算', () => {
  it('改引用单元格后，公式单元格跟着变', () => {
    const ed = makeEditor()
    focusCell(ed, 2, 1)
    const loc = findSelectedCell(ed.state)
    expect(loc?.address).toBe('B3')
    expect(applyCellInput(ed, loc!, '=SUM(A1:A2)').display).toBe('266')
    expect(ed.getHTML()).toContain('>266<')

    focusCell(ed, 0, 0)
    const from = ed.state.selection.from
    ed.commands.insertContentAt({ from, to: from + 2 }, '50')
    expect(ed.getHTML()).toContain('>272<')
    expect(ed.getHTML()).toContain('data-formula="=SUM(A1:A2)"')
  })
})
