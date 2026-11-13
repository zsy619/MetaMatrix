// @vitest-environment happy-dom
/**
 * 表筛选画在 tr 上。编辑器一更新就会按文档重画表格，筛选必须再画一次，否则隐藏的行会回来。
 * 筛选不写入文档 HTML。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { applyTableRowFilter, findTablePos, mapTableFilterPos, paintTableFilterAt } from './rteWave21'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const TABLE = `<table><tbody>
<tr><th><p>品名</p></th></tr>
<tr><td><p>苹果</p></td></tr>
<tr><td><p>香蕉</p></td></tr>
</tbody></table>`

function rowDisplays(ed: Editor): string[] {
  return [...ed.view.dom.querySelectorAll('tr')].map((row) => (row as HTMLElement).style.display)
}

describe('表格行筛选在编辑后仍在', () => {
  it('改单元格后隐藏行还在，正文 HTML 不含筛选', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
      content: TABLE,
    })
    const ed = editor
    ed.commands.setTextSelection(4)
    const pos = findTablePos(ed)
    expect(pos).not.toBeNull()
    expect(applyTableRowFilter(ed, '苹果')).toBe(1)
    expect(rowDisplays(ed)[2]).toBe('none')

    let tracked = pos as number
    const reapply = ({ transaction }: { transaction: Transaction }) => {
      tracked = mapTableFilterPos(tracked, [transaction])
      paintTableFilterAt(ed, tracked, '苹果')
    }
    ed.on('transaction', reapply)
    ed.chain().focus().insertContent('红').run()
    ed.off('transaction', reapply)

    expect(rowDisplays(ed)[2]).toBe('none')
    expect(ed.getHTML()).not.toContain('rteFilterHide')
    expect(ed.getHTML()).toContain('香蕉')
    expect(ed.getHTML()).toContain('红')
  })

  it('没有表头时第一行数据也能被筛掉，合计行留着', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
      content: `<table><tbody>
        <tr><td><p>香蕉</p></td></tr>
        <tr><td><p>苹果</p></td></tr>
        <tr><td><p>合计</p></td></tr>
      </tbody></table>`,
    })
    expect(applyTableRowFilter(editor, '苹果')).toBe(1)
    expect(rowDisplays(editor)).toEqual(['none', '', ''])
  })
})
