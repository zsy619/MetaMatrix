// @vitest-environment happy-dom
/** 已保存的表格公式在引用单元格改动后自动重算。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { applyCellInput, findSelectedCell, TABLE_FORMULA_RECALC } from './rteTableFormulaOps'
import { duplicateTableRow, moveTableColumn, moveTableRow } from './rteTableLayout'

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

function makeEditor(content = html) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), Table, TableRow, RteTableHeader, RteTableCell],
    content,
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

function formulasOf(ed: Editor): string[] {
  const out: string[] = []
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return
    if (node.attrs.formula) out.push(String(node.attrs.formula))
  })
  return out
}

function writeFormula(ed: Editor, row: number, col: number, formula: string) {
  const pos = focusCell(ed, row, col)
  const cell = ed.state.doc.nodeAt(pos)
  ed.view.dispatch(
    ed.state.tr
      .setNodeMarkup(pos, undefined, { ...cell!.attrs, formula })
      .setMeta(TABLE_FORMULA_RECALC, true),
  )
}

describe('行列变动后公式跟着格子', () => {
  it('在引用中间插入一行，求和区域跟着撑开', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>1</p></td></tr>
      <tr><td><p>2</p></td></tr>
      <tr><td><p>3</p></td></tr>
      <tr><td><p>6</p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 3, 0, '=SUM(A1:A3)')
    focusCell(ed, 0, 0)
    expect(ed.chain().focus().addRowAfter().run()).toBe(true)
    expect(formulasOf(ed)).toEqual(['=SUM(A1:A4)'])
    expect(ed.getHTML()).toContain('>6<')
    ed.commands.undo()
    expect(formulasOf(ed)).toEqual(['=SUM(A1:A3)'])
  })

  it('删掉被引用的行以后，公式变成 #REF!', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>1</p></td></tr>
      <tr><td><p>2</p></td></tr>
      <tr><td><p>2</p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 2, 0, '=A2')
    focusCell(ed, 1, 0)
    expect(ed.chain().focus().deleteRow().run()).toBe(true)
    expect(formulasOf(ed)).toEqual(['=#REF!'])
    expect(ed.getHTML()).toContain('>#REF!<')
  })

  it('下移的是光标所在行，公式行号跟着走，光标还在这格', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>甲</p></td><td><p>1</p></td></tr>
      <tr><td><p>乙</p></td><td><p>2</p></td></tr>
      <tr><td><p>丙</p></td><td><p>9</p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 2, 1, '=B2')
    focusCell(ed, 1, 0)
    expect(moveTableRow(ed, 1)).toBe(true)
    expect(ed.state.selection.$from.parent.textContent).toBe('乙')
    expect(formulasOf(ed)).toEqual(['=B3'])
    const rows: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name !== 'table') return
      node.forEach((row) => rows.push(row.child(0)?.textContent || ''))
      return false
    })
    expect(rows).toEqual(['甲', '丙', '乙'])
  })

  it('左移的是光标所在列，公式列号跟着走', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>5</p></td><td><p>9</p></td><td><p>9</p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 0, 2, '=B1')
    focusCell(ed, 0, 1)
    expect(moveTableColumn(ed, -1)).toBe(true)
    expect(ed.state.selection.$from.parent.textContent).toBe('9')
    expect(formulasOf(ed)).toEqual(['=A1'])
  })

  it('复制带公式的行时，新行的行号往下错一格', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>4</p></td><td><p></p></td></tr>
      <tr><td><p>4</p></td><td><p></p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 1, 1, '=A2')
    focusCell(ed, 1, 1)
    expect(duplicateTableRow(ed)).toBe(true)
    expect(formulasOf(ed)).toEqual(['=A2', '=A3'])
  })

  it('在公式左边插入一列，列字母跟着右移', () => {
    const ed = makeEditor(`<table><tbody>
      <tr><td><p>5</p></td><td><p>5</p></td></tr>
    </tbody></table>`)
    writeFormula(ed, 0, 1, '=A1')
    focusCell(ed, 0, 0)
    expect(ed.chain().focus().addColumnBefore().run()).toBe(true)
    expect(formulasOf(ed)).toEqual(['=B1'])
    expect(ed.getHTML()).toContain('>5<')
  })
})
