// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Footnote, matchingFootnote } from './footnote'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function footnoteIds(): string[] {
  const ids: string[] = []
  editor!.state.doc.descendants((node) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name === 'footnote') ids.push(String(mark.attrs.id || ''))
    }
  })
  return ids
}

describe('同一脚注再次引用', () => {
  it('相同注文沿用原来的编号', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Footnote],
      content: '<p>甲乙</p>',
    })
    editor.commands.setTextSelection(2)
    expect(editor.commands.setFootnote({ text: '出处' })).toBe(true)
    const first = matchingFootnote(editor.state.doc, '出处')
    expect(first?.id).toBeTruthy()
    editor.commands.insertContent('和')
    expect(editor.commands.setFootnote({ text: '出处' })).toBe(true)
    const ids = footnoteIds()
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(matchingFootnote(editor.state.doc, '另一条')).toBeNull()
  })
})
