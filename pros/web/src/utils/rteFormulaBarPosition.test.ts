// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { findSelectedCell } from './rteTableFormulaOps'
import { BAR_GAP, placeFormulaBar, resolveTableElement } from './rteFormulaBarPosition'

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('resolveTableElement', () => {
  it('由 tablePos 找到 <table>（domAtPos(tablePos) 只会落在父容器）', () => {
    editor = new Editor({
      element: document.createElement('div'),
      content: '<p>前</p><table><tbody><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
      extensions: [StarterKit, Table, TableRow, RteTableCell, RteTableHeader],
    })
    let cellPos = -1
    editor.state.doc.descendants((n, pos) => {
      if (cellPos < 0 && n.type.name === 'tableCell') cellPos = pos
    })
    editor.commands.setTextSelection(cellPos + 2)
    const loc = findSelectedCell(editor.state)
    expect(loc).toBeTruthy()
    const el = resolveTableElement(editor, loc!.tablePos)
    expect(el?.tagName).toBe('TABLE')
    expect(editor.view.dom.contains(el)).toBe(true)
  })
})

describe('placeFormulaBar', () => {
  const vp = { width: 1280, height: 800 }
  const bar = { width: 340, height: 36 }
  it('上方有空间：贴表格上方，左对齐', () => {
    const p = placeFormulaBar({ top: 500, bottom: 600, left: 182, right: 878 }, bar, vp, 100)
    expect(p).toEqual({ top: 500 - BAR_GAP - 36, left: 182 })
  })
  it('上方被吸顶工具栏挡住：放到表格下方', () => {
    const p = placeFormulaBar({ top: 120, bottom: 300, left: 182, right: 878 }, bar, vp, 100)
    expect(p.top).toBe(300 + BAR_GAP)
  })
  it('上下都放不下：贴工具栏下沿，且不出视口', () => {
    const p = placeFormulaBar({ top: 110, bottom: 790, left: 1200, right: 1400 }, bar, vp, 100)
    expect(p.top).toBe(100 + BAR_GAP)
    expect(p.left + bar.width).toBeLessThanOrEqual(vp.width)
  })
})
