// @vitest-environment happy-dom
/**
 * 图表块引用正文表格后，表格里的数字改了，图也跟着改。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { RteTableCell, RteTableHeader } from './rteTableCells'
import { ListStyleAttrs } from './listStyleAttrs'
import { EchartsBlock } from './echartsBlock'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function chartOption(): { xAxis?: { data?: string[] }; series?: Array<{ name?: string; data?: number[] }> } {
  let raw = ''
  editor!.state.doc.descendants((node) => {
    if (node.type.name === 'echartsBlock') raw = String(node.attrs.option || '')
  })
  return JSON.parse(raw) as { xAxis?: { data?: string[] }; series?: Array<{ name?: string; data?: number[] }> }
}

describe('图表引用正文表格', () => {
  it('插入时带上表格编号，改单元格后系列数据跟着变', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        ListStyleAttrs,
        Table.configure({ resizable: false }),
        TableRow,
        RteTableHeader,
        RteTableCell,
        EchartsBlock,
      ],
      content: `
        <table data-xref-id="tbl-sales" data-table-caption="销售表">
          <tbody>
            <tr><th><p>月份</p></th><th><p>新增</p></th></tr>
            <tr><td><p>一月</p></td><td><p>10</p></td></tr>
            <tr><td><p>二月</p></td><td><p>20</p></td></tr>
          </tbody>
        </table>
      `,
    })
    expect(
      editor.commands.insertEchartsBlock({
        chartType: 'bar',
        tableRef: 'tbl-sales',
        option: JSON.stringify({
          xAxis: { type: 'category', data: ['旧'] },
          series: [{ type: 'bar', name: '旧', data: [1] }],
        }),
      }),
    ).toBe(true)
    expect(editor.getHTML()).toContain('data-table-ref="tbl-sales"')
    const first = chartOption()
    expect(first.xAxis?.data).toEqual(['一月', '二月'])
    expect(first.series?.[0]?.name).toBe('新增')
    expect(first.series?.[0]?.data).toEqual([10, 20])

    let from = -1
    editor.state.doc.descendants((node, pos) => {
      if (from < 0 && node.isText && node.text === '10') from = pos
    })
    expect(from).toBeGreaterThan(0)
    editor.chain().focus().insertContentAt({ from, to: from + 2 }, '30').run()
    expect(chartOption().series?.[0]?.data).toEqual([30, 20])
  })
})
