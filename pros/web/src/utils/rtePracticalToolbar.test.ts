// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { LinkButton } from '../extensions/linkButton'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import { ParagraphAttrs } from '../extensions/paragraphAttrs'
import { orderedListContinuation } from './rteListContinue'
import {
  FIRST_LINE_INDENT,
  continuedListStart,
  previousOrderedContinuation,
  safeLinkButtonHref,
} from './rtePracticalToolbar'

let editor: Editor | null = null

function mount(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit, ListStyleAttrs, ParagraphAttrs, LinkButton],
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('ordered list continuation', () => {
  it('adds the previous item count to its start', () => {
    expect(continuedListStart(1, 2)).toBe(3)
    expect(continuedListStart(4, 1)).toBe(5)
    expect(continuedListStart(0, 2)).toBe(3)
    expect(
      previousOrderedContinuation([
        { type: 'orderedList', start: 1, items: 2 },
        { type: 'other' },
      ]),
    ).toBe(3)
    expect(previousOrderedContinuation([{ type: 'other' }])).toBeNull()
  })

  it('continues across a paragraph and restarts at 1', () => {
    const ed = mount('<ol><li><p>甲</p></li><li><p>乙</p></li></ol><p>隔开</p><ol><li><p>丙</p></li></ol>')
    let inSecond = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '丙') inSecond = pos
    })
    const found = orderedListContinuation(ed.state.doc, inSecond)
    expect(found?.next).toBe(3)
    ed.chain().setTextSelection(inSecond).setOrderedListStart(found!.next).run()
    expect(ed.getHTML()).toContain('start="3"')
    ed.chain().setTextSelection(inSecond).setOrderedListStart(1).run()
    expect(ed.getHTML()).not.toContain('start="3"')
  })
})

describe('first-line indent and link button', () => {
  it('writes a two-character first-line indent', () => {
    const ed = mount('<p>正文</p>')
    ed.chain().focus().setTextIndent(FIRST_LINE_INDENT).run()
    expect(ed.getHTML()).toContain('text-indent: 2em')
    ed.chain().focus().setTextIndent(null).run()
    expect(ed.getHTML()).not.toContain('text-indent')
  })

  it('inserts an http link button and rejects other protocols', () => {
    expect(safeLinkButtonHref('javascript:alert(1)')).toBeNull()
    expect(safeLinkButtonHref('example.com/a')).toBe('https://example.com/a')
    const ed = mount('<p></p>')
    expect(ed.commands.insertLinkButton({ label: '打开文档', href: 'https://example.com', tone: 'green' })).toBe(true)
    const html = ed.getHTML()
    expect(html).toContain('data-type="link-button"')
    expect(html).toContain('data-tone="green"')
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('打开文档')
    expect(ed.commands.insertLinkButton({ label: '坏', href: 'javascript:alert(1)' })).toBe(false)
  })
})
