// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CommentAnchor } from './commentAnchor'

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

describe('CommentAnchor', () => {
  it('只撤掉指定线程的锚点，其它评论标记还在', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      extensions: [StarterKit.configure({ dropcursor: false, undoRedo: false }), CommentAnchor],
      content: '<p>一二三四五六</p>',
    })
    editors.push(editor)
    editor.commands.setTextSelection({ from: 1, to: 3 })
    expect(editor.commands.setCommentAnchor('t-a')).toBe(true)
    editor.commands.setTextSelection({ from: 3, to: 5 })
    expect(editor.commands.setCommentAnchor('t-b')).toBe(true)
    expect(editor.getHTML()).toContain('data-comment-thread="t-a"')
    expect(editor.getHTML()).toContain('data-comment-thread="t-b"')
    expect(editor.commands.unsetCommentAnchor('t-a')).toBe(true)
    const html = editor.getHTML()
    expect(html).not.toContain('data-comment-thread="t-a"')
    expect(html).toContain('data-comment-thread="t-b"')
  })
})
