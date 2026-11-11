// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { syncPrintTableHeads } from './rtePrintTableHead'
import { RteTableCell, RteTableHeader } from '../extensions/rteTableCells'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('打印表头', () => {
  it('第一行全是表头时复制进 thead，已有 thead 时不另做一份', () => {
    const root = document.createElement('div')
    const table = document.createElement('table')
    table.innerHTML = '<tbody><tr><th colspan="2">甲</th></tr><tr><td>1</td><td>2</td></tr></tbody>'
    root.appendChild(table)
    syncPrintTableHeads(root)
    const head = table.querySelector('thead.rte-print-head')
    expect(head?.textContent).toBe('甲')
    expect(head?.querySelector('th')?.getAttribute('colspan')).toBe('2')
    expect(table.querySelectorAll('thead')).toHaveLength(1)
    table.innerHTML = '<thead><tr><th>已有</th></tr></thead><tbody><tr><th>甲</th></tr></tbody>'
    syncPrintTableHeads(root)
    expect(table.querySelector('thead.rte-print-head')).toBeNull()
    expect(table.querySelector('thead')?.textContent).toBe('已有')
  })

  it('编辑器里的表头行会带上打印用的 thead，正文仍可改', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, RteTableHeader, RteTableCell],
      content: '<table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
    })
    await Promise.resolve()
    await Promise.resolve()
    const head = editor.view.dom.querySelector('thead.rte-print-head')
    expect(head?.textContent).toContain('甲')
    expect(head?.getAttribute('aria-hidden')).toBe('true')
    editor.commands.insertContent('丙')
    expect(editor.getText()).toContain('丙')
  })
})
