// @vitest-environment happy-dom
/** 粘贴进来的边框、圆角、阴影和宽度要一起留下，裁剪不能把边框盖掉。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { RteImage } from './rteImage'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('图片边框和圆角', () => {
  it('粘贴的边框、圆角、阴影和宽度一起留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" style="width: 40%; border: 1px solid #5b8cff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.12)">`,
    })
    const html = editor.getHTML()
    expect(html).toContain('data-display-width="40%"')
    expect(html).toContain('data-border="1px solid #5b8cff"')
    expect(html).toContain('data-radius="8px"')
    expect(html).toContain('data-shadow="0 2px 8px rgba(0,0,0,.12)"')
    const style = html.match(/style="([^"]*)"/)?.[1] || ''
    expect(style).toContain('border: 1px solid #5b8cff')
    expect(style).toContain('border-radius: 8px')
    expect(style).toContain('width: 40%')
  })

  it('宽度写成 320 px 时仍是 320 像素', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="320 px" height="180 px" alt="像素">`,
    })
    expect(editor.getHTML()).toContain('width="320"')
    expect(editor.getHTML()).toContain('height="180"')
  })

  it('图片设成包含时画面按原比例留在框里', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" data-fit="contain" alt="包含">`,
    })
    expect(editor.getHTML()).toContain('object-fit: contain')
    expect(editor.getHTML()).toContain('data-fit="contain"')
  })

  it('宽度写成 320px 或全角百分号时都能留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="320px" height="180px" alt="像素">`,
    })
    expect(editor.getHTML()).toContain('width="320"')
    expect(editor.getHTML()).toContain('height="180"')
    editor.commands.setContent(`<img src="${PIXEL}" width="50％" alt="全角">`)
    expect(editor.getHTML()).toContain('data-display-width="50%"')
  })

  it('百分宽旁边的像素高度不把宽度收成像素', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="50%" height="180" alt="说明">`,
    })
    await new Promise((resolve) => queueMicrotask(resolve))
    const html = editor.getHTML()
    expect(html).toContain('data-display-width="50%"')
    expect(html).not.toContain('height="180"')
  })

  it('宽度写成百分号时按显示宽度留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="50%" alt="说明">`,
    })
    const html = editor.getHTML()
    expect(html).toContain('data-display-width="50%"')
    expect(html).not.toContain('width="50"')
  })

  it('包在链接里的图片记下地址', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<a href="https://example.com/doc"><img src="${PIXEL}" alt="说明"></a>`,
    })
    expect(editor.getHTML()).toContain('data-href="https://example.com/doc"')
    let href = ''
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') href = String(node.attrs.href || '')
    })
    expect(href).toBe('https://example.com/doc')
  })

  it('再裁成 16:9 时边框还在', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" data-border="1px solid #5b8cff" data-radius="8px" data-display-width="40%" data-crop-aspect="16/9">`,
    })
    const style = editor.getHTML().match(/style="([^"]*)"/)?.[1] || ''
    expect(style).toContain('border: 1px solid #5b8cff')
    expect(style).toContain('border-radius: 8px')
    expect(style).toContain('object-fit: cover')
    expect(style).toContain('width: 40%')
  })
})
