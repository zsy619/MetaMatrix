// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { listItemIndexAt, planListRenumber } from './rteListRenumber'

let editor: Editor | null = null

function mount(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit],
  })
  return editor
}

function textPos(ed: Editor, text: string): number {
  let found = -1
  ed.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === text) found = pos
  })
  return found
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('列表从此处重编号', () => {
  it('普通段落里没有方案', () => {
    const ed = mount('<p>正文</p>')
    expect(planListRenumber(ed.state.doc, textPos(ed, '正文'))).toBeNull()
    expect(listItemIndexAt(ed.state.doc, textPos(ed, '正文'))).toBeNull()
  })

  it('无序列表里没有方案', () => {
    const ed = mount('<ul><li><p>甲</p></li></ul>')
    expect(planListRenumber(ed.state.doc, textPos(ed, '甲'))).toBeNull()
  })

  it('有序列表里给出下标与两段 start', () => {
    const ed = mount('<ol><li><p>甲</p></li><li><p>乙</p></li><li><p>丙</p></li></ol>')
    const plan = planListRenumber(ed.state.doc, textPos(ed, '乙'))
    expect(plan).not.toBeNull()
    expect(plan!.itemIndex).toBe(1)
    expect(plan!.starts).toEqual([1, 1])
    expect(plan!.listPos).toBeGreaterThanOrEqual(0)
    expect(ed.state.doc.nodeAt(plan!.listPos)?.type.name).toBe('orderedList')
  })

  it('第一项且本来就是 1 时没有方案', () => {
    const ed = mount('<ol><li><p>甲</p></li><li><p>乙</p></li></ol>')
    expect(planListRenumber(ed.state.doc, textPos(ed, '甲'))).toBeNull()
  })

  it('原列表 start 不为 1 时，第一项也要重编号', () => {
    const ed = mount('<ol start="3"><li><p>甲</p></li><li><p>乙</p></li></ol>')
    const plan = planListRenumber(ed.state.doc, textPos(ed, '甲'))
    expect(plan).not.toBeNull()
    expect(plan!.starts).toEqual([3, 1])
  })

  it('两个同级列表时取光标所在的那个', () => {
    const ed = mount('<ol><li><p>甲</p></li></ol><ol><li><p>乙</p></li><li><p>丙</p></li></ol>')
    const plan = planListRenumber(ed.state.doc, textPos(ed, '丙'))
    expect(plan).not.toBeNull()
    expect(plan!.itemIndex).toBe(1)
    expect(listItemIndexAt(ed.state.doc, textPos(ed, '甲'))).toBe(0)
  })

  it('嵌套列表时命中内层列表', () => {
    const ed = mount(
      '<ol><li><p>甲</p><ol><li><p>子一</p></li><li><p>子二</p></li></ol></li><li><p>乙</p></li></ol>',
    )
    const plan = planListRenumber(ed.state.doc, textPos(ed, '子二'))
    expect(plan).not.toBeNull()
    expect(plan!.itemIndex).toBe(1)
    const inner = ed.state.doc.nodeAt(plan!.listPos)
    expect(inner?.type.name).toBe('orderedList')
    expect(inner?.childCount).toBe(2)
  })
})
