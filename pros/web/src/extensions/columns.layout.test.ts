// @vitest-environment happy-dom
/** 选中的段落进入分栏，改栏数时文字还在，栏数和比例跟实际列数对齐。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Column, Columns } from './columns'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content = '<p>甲</p><p>乙</p><p>丙</p>') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ dropcursor: false }), Columns, Column],
    content,
  })
  return editor
}

function textPos(ed: Editor, text: string, edge: 'start' | 'end') {
  let pos = -1
  ed.state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false
    if (node.isText && node.text === text) pos = edge === 'start' ? nodePos : nodePos + node.nodeSize
    return pos < 0
  })
  return pos
}

function columnTexts(ed: Editor): string[][] {
  const columns: string[][] = []
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'column') return
    const blocks: string[] = []
    node.forEach((block) => blocks.push(block.textContent))
    columns.push(blocks)
    return false
  })
  return columns
}

describe('分栏装入选区和栏数', () => {
  it('选中的段落按顺序进入各栏', () => {
    const ed = mount()
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '丙', 'end') })
    expect(ed.chain().focus().setColumns(2).run()).toBe(true)
    expect(columnTexts(ed)).toEqual([
      ['甲', '乙'],
      ['丙'],
    ])
    expect(ed.getHTML()).toContain('data-cols="2"')
    expect(ed.getHTML()).not.toContain('data-ratios')
  })

  it('光标在已有分栏里改栏数时，多出来的文字并进最后一栏', () => {
    const ed = mount()
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '丙', 'end') })
    ed.chain().focus().setColumns(3, [1, 2, 1]).run()
    expect(columnTexts(ed)).toEqual([['甲'], ['乙'], ['丙']])
    expect(ed.getHTML()).toContain('data-ratios="1:2:1"')
    ed.chain().focus().setColumns(2).run()
    expect(columnTexts(ed)).toEqual([
      ['甲'],
      ['乙', '丙'],
    ])
    expect(ed.state.doc.firstChild?.attrs.ratios).toBeNull()
    expect(ed.state.doc.firstChild?.childCount).toBe(2)
  })

  it('栏数或比例和实际列数对不上时改回实际列数', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="3" data-ratios="1:2:1"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    expect(columns?.childCount).toBe(2)
    expect(columns?.attrs.cols).toBe(2)
    expect(columns?.attrs.ratios).toBeNull()
    expect(ed.getHTML()).toContain('甲')
    expect(ed.getHTML()).toContain('乙')
  })

  it('取消分栏后，各栏文字按顺序回到正文，空栏不留下', () => {
    const ed = mount('<p>甲</p>')
    ed.commands.setTextSelection(textPos(ed, '甲', 'start'))
    ed.chain().focus().setColumns(3).run()
    expect(ed.state.doc.firstChild?.type.name).toBe('columns')
    expect(ed.chain().focus().unsetColumns().run()).toBe(true)
    expect(ed.state.doc.firstChild?.type.name).not.toBe('columns')
    expect(ed.getText()).toContain('甲')
    expect(ed.getHTML()).not.toContain('data-type="columns"')
  })
})
