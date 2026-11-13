// @vitest-environment happy-dom
/** 裁剪要写到图片的 style 上，编辑器和导出都能看见比例。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup } from './imageGroup'
import { RteImage } from './rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('图片裁剪画到画面上', () => {
  it('单图导出和节点视图都带上裁剪样式', () => {
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
      content: `<img src="${PIXEL}" data-crop-aspect="16/9" data-crop-focus-x="0.2" data-crop-focus-y="0.8" data-display-width="50%">`,
    })
    const html = editor.getHTML()
    const style = html.match(/style="([^"]*)"/)?.[1] || ''
    const decls = style.split(';').map((part) => part.trim())
    expect(decls).toContain('object-fit: cover')
    expect(decls).toContain('aspect-ratio: 16 / 9')
    expect(decls).toContain('object-position: 20% 80%')
    expect(decls).toContain('width: 50%')
    expect(decls).not.toContain('width: 100%')
    const img = editor.view.dom.querySelector('img')
    const live = (img?.getAttribute('style') || '').split(';').map((part) => part.trim())
    expect(live).toContain('object-fit: cover')
    expect(live).toContain('aspect-ratio: 16 / 9')
  })

  it('图片组里的裁剪按焦点裁切，不被横排的完整显示盖住', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
        ImageGroup,
      ],
      content: `<div data-type="image-group" data-layout="12" data-align="center"><div class="rte-image-group-row"><img src="${PIXEL}" data-crop-aspect="1/1" data-crop-focus-x="0" data-crop-focus-y="1"><img src="${PIXEL}"><img src="${PIXEL}"></div></div>`,
    })
    const img = editor.view.dom.querySelector('img') as HTMLImageElement
    expect(img.style.getPropertyValue('object-fit')).toBe('cover')
    expect(img.style.getPropertyValue('object-position')).toBe('0% 100%')
  })
})
