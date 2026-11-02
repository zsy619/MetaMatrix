// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { HeadingFold } from '../extensions/headingFold'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import { headingFoldBody, headingFoldSpans } from './rteHeadingFold'

let editor: Editor | null = null

function mount(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit.configure({ link: false }), ListStyleAttrs, HeadingFold],
  })
  return editor
}

function headingPositions(ed: Editor): number[] {
  const pos: number[] = []
  ed.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') pos.push(offset)
  })
  return pos
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('heading fold', () => {
  it('folds until the next heading of the same or higher level', () => {
    const ed = mount('<h1>甲</h1><p>正文甲</p><h2>乙</h2><p>正文乙</p><h1>丙</h1><p>正文丙</p>')
    const [h1, h2, h3] = headingPositions(ed)
    const body = headingFoldBody(ed.state.doc, h1!)
    expect(body).not.toBeNull()
    expect(ed.state.doc.textBetween(body!.from, body!.to, '\n')).toContain('正文甲')
    expect(ed.state.doc.textBetween(body!.from, body!.to, '\n')).toContain('正文乙')
    expect(ed.state.doc.textBetween(body!.from, body!.to, '\n')).not.toContain('正文丙')
    expect(headingFoldBody(ed.state.doc, h2!)?.to).toBe(h3)
    const last = headingFoldBody(ed.state.doc, h3!)
    expect(ed.state.doc.textBetween(last!.from, last!.to, '\n')).toBe('正文丙')
  })

  it('does not offer a fold when the heading is the last block', () => {
    const ed = mount('<h1>甲</h1><p>正文</p><h2>收尾</h2>')
    const tail = headingPositions(ed).at(-1)!
    expect(headingFoldBody(ed.state.doc, tail)).toBeNull()
  })

  it('keeps the heading id and reveals the body when the caret moves into it', () => {
    const ed = mount('<h1 id="h-keep">甲</h1><p>正文甲</p><p>正文乙</p>')
    const pos = headingPositions(ed)[0]!
    const node = ed.state.doc.nodeAt(pos)!
    ed.view.dispatch(
      ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true }).setMeta('headingFold', true),
    )
    expect(ed.getHTML()).toContain('data-collapsed="true"')
    expect(ed.getHTML()).toContain('id="h-keep"')
    expect(ed.view.dom.querySelector('.rte-fold-hidden')?.textContent).toContain('正文甲')
    expect(ed.view.dom.querySelector('.rte-heading-foldable')).toBeTruthy()
    expect(headingFoldSpans(ed.state.doc)).toHaveLength(1)
    const hidden = headingFoldSpans(ed.state.doc)[0]!
    ed.commands.setTextSelection(hidden.from + 1)
    expect(ed.getHTML()).not.toContain('data-collapsed')
    expect(headingFoldSpans(ed.state.doc)).toHaveLength(0)
  })

  it('moves the caret back to the heading when collapsing around it', () => {
    const ed = mount('<h2 id="h-keep">甲</h2><p>正文甲</p>')
    const pos = headingPositions(ed)[0]!
    const body = headingFoldBody(ed.state.doc, pos)!
    ed.commands.setTextSelection(body.from + 1)
    expect(ed.commands.toggleHeadingFold(pos)).toBe(true)
    expect(ed.getHTML()).toContain('data-collapsed="true"')
    expect(ed.state.selection.from).toBeLessThan(body.from)
  })
})
