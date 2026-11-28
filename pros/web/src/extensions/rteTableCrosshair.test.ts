// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from './rteTableCells'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function cellByText(text: string): HTMLTableCellElement {
  const cell = [...(editor!.view.dom.querySelectorAll('td, th') as NodeListOf<HTMLTableCellElement>)].find(
    (item) => item.textContent === text && !item.closest('thead'),
  )
  if (!cell) throw new Error(`找不到格子 ${text}`)
  return cell
}

describe('表格十字光标', () => {
  it('光标所在格的整行和整列会亮起', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, RteTableHeader, RteTableCell],
      content: '<table><tbody><tr><th><p>甲</p></th><th><p>乙</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
    })
    let pos = -1
    editor.state.doc.descendants((node, at) => {
      if (pos < 0 && node.isText && node.text === '2') pos = at
    })
    editor.commands.setTextSelection(pos)
    expect(cellByText('2').classList.contains('rte-cross-both')).toBe(true)
    expect(cellByText('1').classList.contains('rte-cross-row')).toBe(true)
    expect(cellByText('乙').classList.contains('rte-cross-col')).toBe(true)
    expect(cellByText('甲').className).not.toContain('rte-cross')

    cellByText('1').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(cellByText('1').classList.contains('rte-cross-both')).toBe(true)
    expect(cellByText('2').classList.contains('rte-cross-row')).toBe(true)
    expect(cellByText('甲').classList.contains('rte-cross-col')).toBe(true)
    expect(cellByText('乙').className).not.toContain('rte-cross')
  })
})
