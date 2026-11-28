// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { decodeCommentRel, encodeCommentRel, mapCommentRange } from './rteCommentMapping'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function mount(content?: string, ydoc?: Y.Doc) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false, undoRedo: false }),
      ...(ydoc ? [Collaboration.configure({ document: ydoc })] : []),
    ],
    content,
  })
  editors.push(editor)
  return editor
}

function rangeOf(ed: Editor, needle: string): { from: number; to: number } {
  const text = ed.state.doc.textContent
  const idx = text.indexOf(needle)
  if (idx < 0) throw new Error(`missing ${needle} in ${JSON.stringify(text)}`)
  let counted = 0
  let from = -1
  ed.state.doc.nodesBetween(0, ed.state.doc.content.size, (node, pos) => {
    if (!node.isText || from >= 0) return
    const next = counted + node.text!.length
    if (idx < next) {
      from = pos + (idx - counted)
      return false
    }
    counted = next
  })
  if (from < 0) throw new Error('failed to map text index')
  return { from, to: from + needle.length }
}

describe('mapCommentRange', () => {
  it('在锚点前插入文字时，评论区间跟着平移且仍覆盖原句', () => {
    const ed = mount('<p>hello world</p>')
    const before = rangeOf(ed, 'world')
    expect(ed.state.doc.textBetween(before.from, before.to)).toBe('world')
    const tr = ed.state.tr.insertText('ABC', 1)
    const mapped = mapCommentRange(tr.mapping, before.from, before.to)
    ed.view.dispatch(tr)
    expect(mapped.lost).toBe(false)
    expect(ed.state.doc.textBetween(mapped.from, mapped.to)).toBe('world')
  })

  it('整段被删掉时标 lost', () => {
    const ed = mount('<p>hello world</p>')
    const before = rangeOf(ed, 'world')
    const tr = ed.state.tr.delete(before.from, before.to)
    const mapped = mapCommentRange(tr.mapping, before.from, before.to)
    ed.view.dispatch(tr)
    expect(mapped.lost).toBe(true)
  })
})

describe('Yjs 相对位置评论锚点', () => {
  it('协同文档前面插入文字后，相对位置仍能找回原句', () => {
    const ydoc = new Y.Doc()
    const ed = mount(undefined, ydoc)
    ed.commands.setContent('<p>hello world</p>')
    const before = rangeOf(ed, 'world')
    const rel = encodeCommentRel(ed.state, before.from, before.to)
    expect(rel).not.toBeNull()
    const tr = ed.state.tr.insertText('XYZ', 1)
    ed.view.dispatch(tr)
    const recovered = decodeCommentRel(ed.state, rel!)
    expect(recovered).not.toBeNull()
    expect(recovered!.lost).toBe(false)
    expect(ed.state.doc.textBetween(recovered!.from, recovered!.to)).toBe('world')
  })

  it('损坏的载荷返回 null', () => {
    const ydoc = new Y.Doc()
    const ed = mount(undefined, ydoc)
    expect(decodeCommentRel(ed.state, 'not-json')).toBeNull()
  })
})
