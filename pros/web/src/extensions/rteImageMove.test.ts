// @vitest-environment happy-dom
/** 把环绕图拖到另一段后面，环绕、题注和裁剪还在。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { extractOrMoveImage } from './imageGroupOps'
import { RteImage } from './rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('拖动图片保留环绕', () => {
  it('拖到段落后面仍是左环绕，题注和裁剪还在', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true }),
      ],
      content: `<img src="${PIXEL}" data-layout="wrap-left" data-align="left" data-caption="侧图" data-crop-aspect="16/9"><p>正文</p>`,
    })
    let from = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') from = pos
    })
    expect(extractOrMoveImage(editor.view, from, editor.state.doc.content.size)).toBe(true)
    await new Promise((resolve) => queueMicrotask(resolve))
    let attrs: Record<string, unknown> = {}
    let imagePos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return
      attrs = node.attrs as Record<string, unknown>
      imagePos = pos
    })
    expect(attrs.layout).toBe('wrap-left')
    expect(attrs.align).toBe('left')
    expect(attrs.caption).toBe('侧图')
    expect(attrs.cropAspect).toBe('16/9')
    expect(imagePos).toBeGreaterThan(from)
    expect(editor.getHTML()).toContain('data-layout="wrap-left"')
  })
})
