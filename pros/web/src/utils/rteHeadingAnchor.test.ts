// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { afterEach, describe, expect, it } from 'vitest'
import { HeadingAnchor } from '../extensions/headingAnchor'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import {
  findHeadingAnchor,
  headingAnchorHref,
  isStableHeadingId,
  nextHeadingAnchorId,
  parseHeadingAnchorHref,
} from './rteHeadingAnchor'

let editor: Editor | null = null

function mount(content: string) {
  editor = new Editor({
    element: document.createElement('div'),
    content,
    extensions: [
      StarterKit.configure({ link: false }),
      ListStyleAttrs,
      HeadingAnchor,
      Link.configure({
        openOnClick: false,
        isAllowedUri: (url, ctx) => !!parseHeadingAnchorHref(url) || ctx.defaultValidate(url),
      }),
    ],
  })
  return editor
}

function headingId(ed: Editor): string {
  let id = ''
  ed.state.doc.descendants((node) => {
    if (!id && node.type.name === 'heading') id = String(node.attrs.id || '')
  })
  return id
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

/** TipTap 在 setTimeout(0) 里触发 onCreate，标题 id 在那之后才写上。 */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('heading anchors', () => {
  it('builds a stable id and reads hash links', () => {
    const used = new Set<string>()
    const id = nextHeadingAnchorId(used, '目标')
    expect(isStableHeadingId(id)).toBe(true)
    expect(nextHeadingAnchorId(used, '目标')).toBe(id)
    expect(nextHeadingAnchorId(new Set([id]), '目标')).not.toBe(id)
    expect(parseHeadingAnchorHref(headingAnchorHref(id))).toBe(id)
    expect(parseHeadingAnchorHref('https://example.com')).toBeNull()
    expect(parseHeadingAnchorHref('#bad id')).toBeNull()
    const here = 'http://127.0.0.1:5173/canvas/y-model?documentId=abc'
    expect(parseHeadingAnchorHref(`${here}#${id}`, here)).toBe(id)
    expect(parseHeadingAnchorHref(`http://127.0.0.1:5173/canvas/other#${id}`, here)).toBeNull()
  })

  it('assigns an id once and keeps it when the heading text changes', async () => {
    const ed = mount('<h1>目标</h1><p>正文</p>')
    await settle()
    const id = headingId(ed)
    expect(id.startsWith('h-')).toBe(true)
    ed.chain().focus('start').insertContent('新').run()
    expect(headingId(ed)).toBe(id)
    expect(ed.getHTML()).toContain(`id="${id}"`)
    expect(findHeadingAnchor(ed.state.doc, id)).not.toBeNull()
  })

  it('keeps an in-document hash link', () => {
    const ed = mount('<h2 id="h-keep">已有</h2><p></p>')
    expect(headingId(ed)).toBe('h-keep')
    ed.chain().focus('end').insertContent('<a href="#h-keep">已有</a>').run()
    expect(ed.getHTML()).toContain('href="#h-keep"')
  })

  it('gives a copied heading a new id and keeps the first', async () => {
    const ed = mount('<h2 id="h-keep">甲</h2><h2 id="h-keep">乙</h2>')
    await settle()
    const ids: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'heading') ids.push(String(node.attrs.id || ''))
    })
    expect(ids[0]).toBe('h-keep')
    expect(ids[1]?.startsWith('h-')).toBe(true)
    expect(ids[1]).not.toBe('h-keep')
  })
})
