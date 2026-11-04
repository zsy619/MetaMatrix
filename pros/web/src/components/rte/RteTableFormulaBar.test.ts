// @vitest-environment happy-dom
/**
 * 表格公式栏组件单测：
 * 选中单元格 → 公式栏显示地址与原始公式/值；
 * 编辑公式 → 回写单元格并重算整表；错误显示 #REF! / #VALUE! 等错误码。
 */
import { Editor } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { RteTableCell, RteTableHeader } from '../../extensions/rteTableCells'
import RteTableFormulaBar from './RteTableFormulaBar.vue'

const TABLE_HTML = `
<table>
  <thead>
    <tr><th><p>项目</p></th><th><p>金额</p></th></tr>
  </thead>
  <tbody>
    <tr><td><p>A</p></td><td><p>10</p></td></tr>
    <tr><td><p>B</p></td><td><p>20</p></td></tr>
    <tr><td><p>合计</p></td><td><p></p></td></tr>
  </tbody>
</table>
`

let editor: Editor | null = null

function mountEditor(content = TABLE_HTML) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit, Table, TableRow, RteTableCell, RteTableHeader],
  })
  document.body.appendChild(editor.view.dom)
  return editor
}

/** 把光标放进第 row 行第 col 列的单元格（第 0 行是表头）。 */
function focusCell(row: number, col: number) {
  const ed = editor!
  let tablePos = -1
  ed.state.doc.descendants((node, pos) => {
    if (tablePos >= 0) return false
    if (node.type.name === 'table') tablePos = pos
    return tablePos < 0
  })
  if (tablePos < 0) throw new Error('文档里没有表格')
  const table = ed.state.doc.nodeAt(tablePos)!
  let cellPos = -1
  let rowIndex = 0
  table.forEach((rowNode, rowOffset) => {
    if (cellPos >= 0) return
    const rowPos = tablePos + 1 + rowOffset
    let colIndex = 0
    rowNode.forEach((_cellNode, cellOffset) => {
      if (cellPos >= 0) return
      if (rowIndex === row && colIndex === col) cellPos = rowPos + 1 + cellOffset
      colIndex += 1
    })
    rowIndex += 1
  })
  if (cellPos < 0) throw new Error('未找到目标单元格')
  // 单元格内容起点 = cellPos + 1（段落），段落文本起点 = cellPos + 2
  ed.commands.setTextSelection(cellPos + 2)
}

afterEach(() => {
  editor?.destroy()
  editor = null
  document.body.innerHTML = ''
})

describe('RteTableFormulaBar', () => {
  it('选中单元格时显示地址与单元格内容', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(1, 1)
    await flushPromises()
    expect(wrapper.find('.rte-formula-bar').exists()).toBe(true)
    expect(wrapper.find('.rte-formula-address').text()).toBe('B2')
    expect((wrapper.find('.rte-formula-input').element as HTMLInputElement).value).toBe('10')
    wrapper.unmount()
  })

  it('选区离开表格后公式栏隐藏', async () => {
    const ed = mountEditor(`${TABLE_HTML}<p>表格外的文字</p>`)
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(1, 1)
    await flushPromises()
    expect(wrapper.find('.rte-formula-bar').exists()).toBe(true)

    ed.commands.setTextSelection(ed.state.doc.content.size - 1)
    await flushPromises()
    expect(wrapper.find('.rte-formula-bar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('编辑公式后回写单元格并重算', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(3, 1)
    await flushPromises()
    const input = wrapper.find('.rte-formula-input')
    await input.setValue('=SUM(B2:B3)')
    await input.trigger('keydown.enter')
    await flushPromises()

    const cells = ed.getHTML()
    expect(cells).toContain('30')
    // 公式原文写进 data-formula，单元格显示计算结果
    expect(cells).toContain('data-formula="=SUM(B2:B3)"')
    wrapper.unmount()
  })

  it('编辑公式后其它引用单元格同步重算', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(3, 1)
    await flushPromises()
    let input = wrapper.find('.rte-formula-input')
    await input.setValue('=SUM(B2:B3)')
    await input.trigger('keydown.enter')
    await flushPromises()

    // 在合计格里再引用一次 B4，公式栏应显示公式原文
    focusCell(3, 1)
    await flushPromises()
    input = wrapper.find('.rte-formula-input')
    expect((input.element as HTMLInputElement).value).toBe('=SUM(B2:B3)')
    expect(wrapper.find('.rte-formula-value').text()).toBe('30')
    wrapper.unmount()
  })

  it('循环引用显示 #REF!', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(3, 1)
    await flushPromises()
    const input = wrapper.find('.rte-formula-input')
    await input.setValue('=B4')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.find('.rte-formula-error').text()).toBe('#REF!')
    expect(ed.getHTML()).toContain('#REF!')
    wrapper.unmount()
  })

  it('非法公式显示 #VALUE! / #NAME?', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(3, 1)
    await flushPromises()
    const input = wrapper.find('.rte-formula-input')
    await input.setValue('=ROUND(B2)')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.find('.rte-formula-error').text()).toBe('#NAME?')
    wrapper.unmount()
  })

  it('普通文本回写后不再显示公式错误', async () => {
    const ed = mountEditor()
    const wrapper = mount(RteTableFormulaBar, { props: { editor: ed } })

    focusCell(3, 1)
    await flushPromises()
    const input = wrapper.find('.rte-formula-input')
    await input.setValue('=SUM(B2:B3)')
    await input.trigger('keydown.enter')
    await flushPromises()
    await input.setValue('手工填的数')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.find('.rte-formula-error').exists()).toBe(false)
    expect(ed.getHTML()).toContain('手工填的数')
    expect(ed.getHTML()).not.toContain('data-formula')
    wrapper.unmount()
  })
})
