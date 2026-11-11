// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ListStyleAttrs } from './listStyleAttrs'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [StarterKit, ListStyleAttrs],
    content,
  })
  return editor
}

describe('有序列表编号样式', () => {
  it('段落上第一次选字母就写成字母，不是数字', () => {
    const ed = mount('<p>甲</p>')
    ed.commands.setTextSelection(1)
    expect(ed.commands.setOrderedListStyle('lower-alpha')).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain('data-list-style="lower-alpha"')
    expect(html).toContain('list-style-type: lower-alpha')
    expect(html).not.toMatch(/<ol(?![^>]*data-list-style)/)
  })

  it('无序列表第一次改成罗马编号就生效', () => {
    const ed = mount('<ul><li><p>甲</p></li></ul>')
    ed.commands.setTextSelection(2)
    expect(ed.commands.setOrderedListStyle('lower-roman')).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain('<ol')
    expect(html).toContain('data-list-style="lower-roman"')
    expect(html).not.toContain('<ul')
  })

  it('已经是字母时，再改成数字会去掉字母样式', () => {
    const ed = mount('<ol data-list-style="lower-alpha" style="list-style-type: lower-alpha"><li><p>甲</p></li></ol>')
    ed.commands.setTextSelection(2)
    expect(ed.commands.setOrderedListStyle('decimal')).toBe(true)
    const html = ed.getHTML()
    expect(html).not.toContain('lower-alpha')
    expect(html).toContain('<ol')
  })
})