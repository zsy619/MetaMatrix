// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CrossRef } from '../extensions/crossRef'
import { ListStyleAttrs } from '../extensions/listStyleAttrs'
import { RteImage } from '../extensions/rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

function mount(content: string, withXref = false) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      RteImage.configure({ inline: false, allowBase64: true }),
      ...(withXref ? [ListStyleAttrs, CrossRef] : []),
    ],
    content,
  })
  return editor
}

describe('还没落地的几项修订', () => {
  it('删掉前面的图后，后面的图号立刻重排', () => {
    const ed = mount(
      '<img src="https://example.com/a.png" data-caption="图 1：甲"><img src="https://example.com/b.png" data-caption="图 2：乙">',
    )
    let first = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && first < 0) first = pos
    })
    ed.chain().setNodeSelection(first).deleteSelection().run()
    const captions: string[] = []
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image') captions.push(String(node.attrs.caption || ''))
    })
    expect(captions).toEqual(['图 1：乙'])
  })

  it('标题得到稳定编号，引用跟着改字，目标删除后标成失锚', async () => {
    const ed = mount('<h1>甲</h1><p></p>', true)
    await Promise.resolve()
    await Promise.resolve()
    let headingId = ''
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'heading' && !headingId) headingId = String(node.attrs.id || '')
    })
    expect(headingId.startsWith('h-')).toBe(true)
    ed.commands.insertContentAt(ed.state.doc.content.size - 1, {
      type: 'crossRef',
      attrs: { kind: 'heading', targetId: headingId, label: '§ 甲' },
    })
    ed.commands.insertContentAt(2, '乙')
    expect(ed.getHTML()).toContain('§ 甲乙')
    let headingPos = -1
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && headingPos < 0) headingPos = pos
    })
    ed.chain().setNodeSelection(headingPos).deleteSelection().run()
    expect(ed.getHTML()).toContain('失锚')
    expect(ed.getHTML()).toContain('data-lost="true"')
  })
})
