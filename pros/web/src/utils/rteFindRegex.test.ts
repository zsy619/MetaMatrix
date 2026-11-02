// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { collectFindMatches } from './rteFindReplace'

let editor: Editor | null = null

function mount(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit],
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('查找替换支持正则', () => {
  it('按正则匹配字面量', () => {
    const ed = mount('<p>alpha beta alpha</p>')
    const matches = collectFindMatches(ed.state.doc, 'al.ha', { regex: true })
    expect(matches.length).toBe(2)
  })

  it('默认忽略大小写，caseSensitive 时区分', () => {
    const ed = mount('<p>Alpha alpha</p>')
    expect(collectFindMatches(ed.state.doc, 'alpha', { regex: true }).length).toBe(2)
    expect(
      collectFindMatches(ed.state.doc, 'alpha', { regex: true, caseSensitive: true }).length,
    ).toBe(1)
  })

  it('非法正则不报错且没有匹配', () => {
    const ed = mount('<p>alpha</p>')
    expect(collectFindMatches(ed.state.doc, 'al(', { regex: true })).toEqual([])
  })

  it('空白类写法能命中', () => {
    const ed = mount('<p>标 题</p>')
    expect(collectFindMatches(ed.state.doc, '标\\s*题', { regex: true }).length).toBe(1)
  })

  it('普通子串搜索保持原样', () => {
    const ed = mount('<p>alpha beta alpha</p>')
    expect(collectFindMatches(ed.state.doc, 'alpha').length).toBe(2)
    expect(collectFindMatches(ed.state.doc, 'ALPHA', { caseSensitive: true }).length).toBe(0)
    expect(collectFindMatches(ed.state.doc, 'alpha', { caseSensitive: false }).length).toBe(2)
  })

  it('全字匹配对正则同样生效', () => {
    const ed = mount('<p>cat cats</p>')
    expect(collectFindMatches(ed.state.doc, 'cat', { regex: true, wholeWord: true }).length).toBe(1)
  })
})
