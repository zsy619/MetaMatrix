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

function selectionColumn(ed: Editor): number {
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'column') return $from.index(depth - 1)
  }
  return -1
}

function pressKey(ed: Editor, key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
  return ed.view.someProp('handleKeyDown', (fn) => fn(ed.view, event))
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

  it('左右宽度按比例画，等宽样式不再盖住', () => {
    const ed = mount('<p>甲</p><p>乙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '乙', 'end') })
    ed.chain().focus().setColumns(2, [1, 2]).run()
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('--rte-col-grid: 1fr 2fr')
    expect(html).toContain('grid-template-columns: 1fr 2fr')
  })

  it('Tab 进下一栏，列表里的 Tab 留在本栏', () => {
    const ed = mount()
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '丙', 'end') })
    ed.chain().focus().setColumns(2).run()
    expect(selectionColumn(ed)).toBe(0)
    expect(pressKey(ed, 'Tab')).toBe(true)
    expect(selectionColumn(ed)).toBe(1)
    expect(ed.state.selection.$from.parent.textContent).toBe('丙')
    expect(pressKey(ed, 'Tab', true)).toBe(true)
    expect(selectionColumn(ed)).toBe(0)

    ed.commands.setTextSelection(textPos(ed, '乙', 'start'))
    expect(pressKey(ed, 'ArrowRight')).not.toBe(true)
    expect(selectionColumn(ed)).toBe(0)
    ed.commands.setTextSelection(textPos(ed, '乙', 'end'))
    expect(pressKey(ed, 'ArrowRight')).toBe(true)
    expect(selectionColumn(ed)).toBe(1)
  })

  it('列表里按 Tab 仍留在本栏', () => {
    const ed = mount(
      '<div data-type="columns" data-cols="2"><div data-type="column"><ul><li><p>甲</p></li></ul></div><div data-type="column"><p>乙</p></div></div>',
    )
    ed.commands.setTextSelection(textPos(ed, '甲', 'start'))
    expect(selectionColumn(ed)).toBe(0)
    pressKey(ed, 'Tab')
    expect(selectionColumn(ed)).toBe(0)
  })
})
