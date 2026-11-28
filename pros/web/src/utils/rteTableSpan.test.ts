// @vitest-environment happy-dom
/** 合并单元格按屏幕上的列计算地址、公式和复制结果。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'
import { applyCellInput, findSelectedCell, tableGrid } from './rteTableFormulaOps'
import { tableToDelimited } from './rteWave21'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const html = `<table><tbody>
  <tr><td colspan="2"><p>10</p></td><td><p>右</p></td></tr>
  <tr><td rowspan="2"><p>左</p></td><td><p>中</p></td><td><p>右2</p></td></tr>
  <tr><td><p>下</p></td><td><p>末</p></td></tr>
</tbody></table>`

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

function focusText(ed: Editor, text: string) {
  let pos = -1
  ed.state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.textContent === text) {
      pos = nodePos
    }
    return pos < 0
  })
  ed.commands.setTextSelection(pos + 2)
  return pos
}

describe('合并单元格的列', () => {
  it('跨列跨行后，公式地址、网格和 CSV 按视觉列对齐', () => {
    const ed = makeEditor()
    focusText(ed, '右')
    expect(findSelectedCell(ed.state)?.address).toBe('C1')
    focusText(ed, '下')
    const loc = findSelectedCell(ed.state)
    expect(loc?.address).toBe('B3')
    expect(tableGrid(loc!.table)).toEqual([
      ['10', '', '右'],
      ['左', '中', '右2'],
      ['', '下', '末'],
    ])
    expect(tableToDelimited(ed, ',')).toBe('10,,右\n左,中,右2\n,下,末')
    expect(applyCellInput(ed, loc!, '=A1').display).toBe('10')
    expect(ed.getHTML()).toContain('>10<')
    expect(ed.getHTML()).toContain('data-formula="=A1"')
  })
})
