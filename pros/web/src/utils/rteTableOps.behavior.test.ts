// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { CellSelection } from '@tiptap/pm/tables'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { compareTableCellText, sortTableByColumn, tableSortBlock, upsertTableSumRow } from './rteTableExtras'
import { TABLE_FORMULA_RECALC } from './rteTableFormulaOps'

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

function firstColumn(ed: Editor): string[] {
  const out: string[] = []
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'table') return
    node.forEach((row) => out.push(row.child(0)?.textContent || ''))
    return false
  })
  return out
}

function focusInsideTable(ed: Editor) {
  let pos = -1
  ed.state.doc.descendants((node, at) => {
    if (pos >= 0) return false
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      pos = at + 1
      return false
    }
  })
  ed.commands.setTextSelection(pos)
}

describe('表格排序和合计', () => {
  it('没有表头时每一行都参与排序', () => {
    const ed = makeEditor()
    ed.commands.setContent('<table><tbody><tr><td><p>b</p></td></tr><tr><td><p>a</p></td></tr></tbody></table>')
    focusInsideTable(ed)
    expect(tableSortBlock(ed)).toBeNull()
    expect(sortTableByColumn(ed, 0, true)).toBe(true)
    expect(firstColumn(ed)).toEqual(['a', 'b'])
  })

  it('表头留在上面，合计留在下面', () => {
    const ed = makeEditor()
    ed.commands.setContent(
      '<table><tbody><tr><th><p>名</p></th><th><p>数</p></th></tr><tr><td><p>乙</p></td><td><p>2</p></td></tr><tr><td><p>甲</p></td><td><p>1</p></td></tr><tr><td><p>合计</p></td><td><p>3</p></td></tr></tbody></table>',
    )
    focusInsideTable(ed)
    expect(sortTableByColumn(ed, 1, true)).toBe(true)
    expect(firstColumn(ed)).toEqual(['名', '甲', '乙', '合计'])
  })

  it('合并单元格时不排序', () => {
    const ed = makeEditor()
    ed.commands.setContent(
      '<table><tbody><tr><td colspan="2"><p>合</p></td></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    )
    focusInsideTable(ed)
    expect(tableSortBlock(ed)).toBe('merged')
    expect(sortTableByColumn(ed, 0, true)).toBe(false)
    expect(firstColumn(ed)[0]).toBe('合')
  })

  it('没有表头时合计把第一行也算进去', () => {
    const ed = makeEditor()
    ed.commands.setContent(
      '<table><tbody><tr><td><p>甲</p></td><td><p>1</p></td></tr><tr><td><p>乙</p></td><td><p>2</p></td></tr></tbody></table>',
    )
    focusInsideTable(ed)
    expect(upsertTableSumRow(ed)).toBe(true)
    const last = firstColumn(ed)
    expect(last[last.length - 1]).toBe('合计')
    let sum = ''
    ed.state.doc.descendants((node) => {
      if (node.type.name !== 'table') return
      const row = node.lastChild
      sum = row?.child(1)?.textContent || ''
      return false
    })
    expect(sum).toBe('3')
  })

  it('排序后公式里的行号跟着走', () => {
    const ed = makeEditor()
    ed.commands.setContent(
      '<table><tbody><tr><td><p>2</p></td></tr><tr><td><p>1</p></td></tr></tbody></table>',
    )
    focusInsideTable(ed)
    let formulaPos = -1
    ed.state.doc.descendants((node, pos) => {
      if (formulaPos < 0 && node.type.name === 'tableCell' && node.textContent === '2') formulaPos = pos
    })
    const formulaCell = ed.state.doc.nodeAt(formulaPos)
    ed.view.dispatch(
      ed.state.tr
        .setNodeMarkup(formulaPos, undefined, { ...formulaCell!.attrs, formula: '=A2' })
        .setMeta(TABLE_FORMULA_RECALC, true),
    )
    expect(sortTableByColumn(ed, 0, true)).toBe(true)
    const formulas: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell' && node.attrs.formula) formulas.push(String(node.attrs.formula))
    })
    expect(formulas).toEqual(['=A1'])
  })

  it('日期按年月日排，百分数和千分位按数值合计', () => {
    expect(compareTableCellText('2024-03-01', '2024-01-15', true)).toBeGreaterThan(0)
    expect(compareTableCellText('2024年1月2日', '2023年12月1日', true)).toBeGreaterThan(0)
    expect(compareTableCellText('10%', '2', true)).toBeLessThan(0)
    expect(compareTableCellText('12月', '3', true)).toBeGreaterThan(0)
    const ed = makeEditor()
    ed.commands.setContent(
      '<table><tbody><tr><th><p>日期</p></th><th><p>比例</p></th></tr><tr><td><p>2024-03-01</p></td><td><p>10%</p></td></tr><tr><td><p>2024-01-15</p></td><td><p>1,200</p></td></tr><tr><td><p>2023-12-01</p></td><td><p>20%</p></td></tr></tbody></table>',
    )
    focusInsideTable(ed)
    expect(sortTableByColumn(ed, 0, true)).toBe(true)
    expect(firstColumn(ed)).toEqual(['日期', '2023-12-01', '2024-01-15', '2024-03-01'])
    expect(upsertTableSumRow(ed)).toBe(true)
    let sum = ''
    ed.state.doc.descendants((node) => {
      if (node.type.name !== 'table') return
      sum = node.lastChild?.child(1)?.textContent || ''
      return false
    })
    expect(sum).toBe('1200.3')
  })
})
