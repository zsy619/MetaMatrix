// @vitest-environment happy-dom
/** 选中的段落进入分栏，改栏数时文字还在，栏数和比例跟实际列数对齐。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Column, Columns, columnRatiosAfterRemoval } from './columns'

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
  it('栏宽比例可以用顿号', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1、2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏间距写成 3rex 时按 24 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="3rex"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*24px/)
  })

  it('栏间距写成 2rcap 时按 22 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="2rcap"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*22px/)
  })

  it('栏间距写成 2cap 时按 22 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="2cap"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*22px/)
  })

  it('栏间距写成 1lh 时按 24 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="1lh"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*24px/)
  })

  it('栏间距写成 2ic 时按 32 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="2ic"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*32px/)
  })

  it('栏间距写成 3ex 时按 24 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="3ex"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*24px/)
  })

  it('栏间距写成 4ch 时按 32 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="4ch"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*32px/)
  })

  it('栏间距写成 2rem 时按 32 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="2rem"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*32px/)
  })

  it('栏间距写成 1.5em 时按 24 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="1.5em"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*24px/)
  })

  it('栏间距写成 16q 时按 15 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="16q"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*15px/)
  })

  it('栏间距写成 2pc 时按 32 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="2pc"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*32px/)
  })

  it('栏间距写成 0.25in 时按 24 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="0.25in"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*24px/)
  })

  it('栏间距写成 0.5cm 时按 19 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="0.5cm"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*19px/)
  })

  it('栏间距写成 3mm 时按 11 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="3mm"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*11px/)
  })

  it('栏间距写成 6pt 时按 8 像素留下', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="6pt"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*8px/)
  })

  it('栏宽比例可以用空格分开', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1 2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏间距写成全角 ８px 时仍是 8', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="８px"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*8px/)
  })

  it('栏宽比例可以用乘号', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1×2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏宽比例可以用分号', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1；2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏宽比例可以用全角数字', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="１：２"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏宽比例可以用比字', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1比2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏宽比例可以用斜杠', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1/2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('分栏边框可以画成双线', () => {
    const ed = mount('<p>甲</p><p>乙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '乙', 'end') })
    ed.chain().focus().setColumns(2).run()
    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, undefined, { ...columns!.attrs, borderStyle: 'double', borderWidth: 3 }))
    expect(ed.getHTML()).toContain('double')
    expect(ed.state.doc.firstChild?.attrs.borderStyle).toBe('double')
  })

  it('栏间距写成 8 px 时仍是 8', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="8 px"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.state.doc.firstChild?.attrs.gap).toBe(8)
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*8px/)
  })

  it('栏间距写成 8px 时仍是 8', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-gap="8px"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    expect(ed.state.doc.firstChild?.attrs.gap).toBe(8)
    expect(ed.getHTML()).toMatch(/--rte-col-gap:\s*8px/)
  })

  it('栏宽比例可以用中文冒号', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1：2"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1:2"')
    expect(html).toContain('1fr 2fr')
  })

  it('栏宽比例可以带小数', () => {
    const ed = mount('<p></p>')
    ed.commands.setContent(
      '<div data-type="columns" data-cols="2" data-ratios="1.5:2.5"><div data-type="column"><p>甲</p></div><div data-type="column"><p>乙</p></div></div>',
    )
    const html = ed.getHTML()
    expect(html).toContain('data-ratios="1.5:2.5"')
    expect(html).toContain('1.5fr 2.5fr')
  })

  it('分栏边框可以画成点线', () => {
    const ed = mount('<p>甲</p><p>乙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '乙', 'end') })
    ed.chain().focus().setColumns(2).run()
    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, undefined, { ...columns!.attrs, borderStyle: 'dotted' }))
    expect(ed.getHTML()).toContain('dotted')
    expect(ed.state.doc.firstChild?.attrs.borderStyle).toBe('dotted')
  })

  it('分栏边框可以用 rgb 颜色', () => {
    const ed = mount('<p>甲</p><p>乙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '乙', 'end') })
    ed.chain().focus().setColumns(2).run()
    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(0, undefined, { ...columns!.attrs, borderColor: 'rgb(91, 140, 255)', borderStyle: 'solid' }),
    )
    expect(ed.getHTML()).toContain('rgb(91, 140, 255)')
  })

  it('四段分三栏时每一栏都有字', () => {
    const ed = mount('<p>甲</p><p>乙</p><p>丙</p><p>丁</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '丁', 'end') })
    expect(ed.chain().focus().setColumns(3).run()).toBe(true)
    expect(columnTexts(ed)).toEqual([['甲', '乙'], ['丙'], ['丁']])
  })

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

  it('栏首退格把这段接到上一栏，内边距写在栏上', () => {
    const ed = mount('<p>甲</p><p>乙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '乙', 'end') })
    ed.chain().focus().setColumns(2).run()
    ed.commands.setTextSelection(textPos(ed, '乙', 'start'))
    expect(pressKey(ed, 'Backspace')).toBe(true)
    expect(columnTexts(ed)).toEqual([['甲乙'], ['']])
    expect(selectionColumn(ed)).toBe(0)

    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, undefined, { ...columns!.attrs, padding: 24 }))
    const html = ed.getHTML()
    expect(html).toContain('--rte-col-pad: 24px')
    expect(html).not.toContain('padding: 8px')
    expect(html).not.toContain('padding:8px')
  })

  it('改栏数时保留边框和间距', () => {
    const ed = mount('<p>甲</p><p>乙</p><p>丙</p>')
    ed.commands.setTextSelection({ from: textPos(ed, '甲', 'start'), to: textPos(ed, '丙', 'end') })
    ed.chain().focus().setColumns(3, [1, 2, 1]).run()
    const columns = ed.state.doc.firstChild
    expect(columns?.type.name).toBe('columns')
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(0, undefined, {
        ...columns!.attrs,
        gap: 4,
        padding: 24,
        borderStyle: 'solid',
      }),
    )
    ed.chain().focus().setColumns(2).run()
    const next = ed.state.doc.firstChild
    expect(next?.attrs.gap).toBe(4)
    expect(next?.attrs.padding).toBe(24)
    expect(next?.attrs.borderStyle).toBe('solid')
    expect(columnTexts(ed)).toEqual([
      ['甲'],
      ['乙', '丙'],
    ])
  })

  it('空栏退格会删掉这一栏，只剩两栏时取消分栏', () => {
    expect(columnRatiosAfterRemoval('1:2:3', 3, 1)).toBe('1:3')
    expect(columnRatiosAfterRemoval('1:2:1', 3, 1)).toBeNull()
    const ed = mount(
      '<div data-type="columns" data-cols="3" data-ratios="1:2:3" data-gap="6"><div data-type="column"><p>甲</p></div><div data-type="column"><p></p></div><div data-type="column"><p>丙</p></div></div>',
    )
    let empty = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.content.size === 0) empty = pos + 1
    })
    ed.commands.setTextSelection(empty)
    expect(pressKey(ed, 'Backspace')).toBe(true)
    expect(columnTexts(ed)).toEqual([['甲'], ['丙']])
    expect(ed.state.doc.firstChild?.attrs.ratios).toBe('1:3')
    expect(ed.state.doc.firstChild?.attrs.gap).toBe(6)
    expect(ed.state.doc.firstChild?.childCount).toBe(2)

    const two = mount(
      '<div data-type="columns" data-cols="2"><div data-type="column"><p>甲</p></div><div data-type="column"><p></p></div></div>',
    )
    let blank = -1
    two.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.content.size === 0) blank = pos + 1
    })
    two.commands.setTextSelection(blank)
    expect(pressKey(two, 'Backspace')).toBe(true)
    expect(two.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(two.getText()).toContain('甲')
    expect(two.getHTML()).not.toContain('data-type="columns"')
  })
})
