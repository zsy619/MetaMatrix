// @vitest-environment happy-dom
/** 拖出来的像素宽高和百分比预设不能同时生效。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { RteImage } from './rteImage'
import { imageDisplayWidthPatch } from '../utils/rteImageLayout'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      RteImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'rte-image' },
        resize: { enabled: true, directions: ['right'], minWidth: 48, minHeight: 48, alwaysPreserveAspectRatio: true },
      }),
    ],
    content: `<img src="${PIXEL}" width="320" height="180" data-display-width="50%">`,
  })
  return editor
}

function imageNode(ed: Editor) {
  let found: { pos: number; attrs: Record<string, unknown> } | null = null
  ed.state.doc.descendants((node, pos) => {
    if (found || node.type.name !== 'image') return
    found = { pos, attrs: node.attrs as Record<string, unknown> }
  })
  return found
}

describe('图片尺寸预设和拖拽', () => {
  it('已经拖出像素宽高时清掉百分比，画面用像素', async () => {
    const ed = mount()
    await new Promise((resolve) => queueMicrotask(resolve))
    const current = imageNode(ed)
    expect(current?.attrs.displayWidth).toBeNull()
    expect(current?.attrs.width).toBe(320)
    const img = ed.view.dom.querySelector('img') as HTMLImageElement
    expect(img.style.width).toBe('320px')
    expect(img.style.height).toBe('180px')

    ed.chain().focus().setNodeSelection(current!.pos).updateAttributes('image', imageDisplayWidthPatch('50%')).run()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(imageNode(ed)?.attrs.displayWidth).toBe('50%')
    expect(imageNode(ed)?.attrs.width).toBeNull()
    expect(img.style.width).toBe('50%')
    expect(img.style.height).toBe('auto')

    ed.chain().focus().updateAttributes('image', imageDisplayWidthPatch('')).run()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(imageNode(ed)?.attrs.displayWidth).toBeNull()
    expect(img.style.width).toBe('')
    expect(img.style.height).toBe('')
  })
})
