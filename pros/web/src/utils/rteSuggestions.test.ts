// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { SuggestionDelete, SuggestionInsert } from '../extensions/suggestionMarks'
import { SuggestionMode } from '../extensions/suggestionMode'
import {
  collectSuggestionRanges,
  dispatchSuggestionDecision,
  htmlWithSuggestionsAccepted,
  htmlWithoutSuggestionMarks,
} from './rteSuggestions'

const author = { id: 'u1', name: '甲' }
let suggesting = true
let editor: Editor | null = null

function mount(content: string) {
  suggesting = true
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [
      StarterKit,
      SuggestionInsert,
      SuggestionDelete,
      SuggestionMode.configure({
        enabled: () => suggesting,
        author: () => author,
      }),
    ],
  })
  document.body.appendChild(editor.view.dom)
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
  document.body.innerHTML = ''
})

describe('建议模式', () => {
  it('插入和删除记成修订，接受后只留新文字', () => {
    const ed = mount('<p>你好世界</p>')
    ed.commands.setTextSelection(3)
    ed.commands.insertContent('呀')
    expect(ed.getHTML()).toContain('data-suggestion="insert"')
    ed.commands.setTextSelection({ from: 2, to: 3 })
    ed.commands.deleteSelection()
    expect(ed.getHTML()).toContain('data-suggestion="delete"')
    expect(ed.getText()).toContain('好')
    const accepted = htmlWithSuggestionsAccepted(ed.getHTML())
    expect(accepted).toContain('呀')
    expect(accepted).not.toContain('好')
    expect(accepted).not.toContain('data-suggestion')
    dispatchSuggestionDecision(ed, 'accept')
    expect(ed.getText()).toBe('你呀世界')
    expect(ed.getHTML()).not.toContain('data-suggestion')
  })

  it('拒绝会撤回插入并保留被删文字', () => {
    const ed = mount('<p>原文</p>')
    ed.commands.insertContentAt(1, '新')
    ed.commands.setTextSelection({ from: 2, to: 4 })
    ed.commands.deleteSelection()
    dispatchSuggestionDecision(ed, 'reject')
    expect(ed.getText()).toBe('原文')
    expect(collectSuggestionRanges(ed.state.doc)).toEqual([])
  })

  it('同一作者连续输入合并成一条', () => {
    const ed = mount('<p></p>')
    ed.commands.insertContent('甲')
    ed.commands.insertContent('乙')
    const ranges = collectSuggestionRanges(ed.state.doc).filter((range) => range.kind === 'insert')
    expect(ranges).toHaveLength(1)
    expect(ed.state.doc.textBetween(ranges[0]!.from, ranges[0]!.to)).toBe('甲乙')
  })

  it('关闭建议模式后直接改字', () => {
    const ed = mount('<p>甲</p>')
    suggesting = false
    ed.commands.insertContentAt(2, '乙')
    expect(ed.getHTML()).not.toContain('data-suggestion')
    expect(ed.getText()).toBe('甲乙')
  })

  it('只读 HTML 只保留接受后的文字', () => {
    const html = '<p>前<span data-suggestion="delete">删</span><span data-suggestion="insert"><strong>增</strong></span>后</p>'
    expect(htmlWithSuggestionsAccepted(html)).toBe('<p>前<strong>增</strong>后</p>')
    expect(htmlWithoutSuggestionMarks(html, 'reject')).toBe('<p>前删后</p>')
  })
})
