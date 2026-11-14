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

  it('宽度写成全角 ５０％ 时按 50% 留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="５０％" alt="全角百分">`,
    })
    expect(editor.getHTML()).toContain('data-display-width="50%"')
  })

  it('宽度写成 50,5% 时按 50.5% 留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="50,5%" alt="小数">`,
    })
    expect(editor.getHTML()).toContain('data-display-width="50.5%"')
  })

  it('宽度写成全角 ３２０px 时仍是 320 像素', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="３２０px" alt="全角">`,
    })
    expect(editor.getHTML()).toContain('width="320"')
  })

  it('宽度写成 320,5px 时按 321 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="320,5px" alt="小数像素">`,
    })
    expect(editor.getHTML()).toContain('width="321"')
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

  it('带 !important 的 object-fit 仍收成适配方式', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" style="object-fit: Cover !important" alt="覆盖">`,
    })
    expect(editor.getHTML()).toContain('data-fit="cover"')
    expect(editor.getHTML()).toContain('object-fit: cover')
  })

  it('样式里的 object-fit 会收成适配方式', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" style="object-fit: cover" alt="覆盖">`,
    })
    expect(editor.getHTML()).toContain('data-fit="cover"')
    expect(editor.getHTML()).toContain('object-fit: cover')
  })

  it('图片设成不缩放时保持原始尺寸', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" data-fit="none" alt="原尺寸">`,
    })
    expect(editor.getHTML()).toContain('object-fit: none')
    expect(editor.getHTML()).toContain('data-fit="none"')
  })

  it('宽度写成 240pt 时按 320 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="240pt" alt="磅">`,
    })
    expect(editor.getHTML()).toContain('width="320"')
  })

  it('宽度写成 3pc 时按 48 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="3pc" alt="派卡">`,
    })
    expect(editor.getHTML()).toContain('width="48"')
  })

  it('宽度写成 0.5in 时按 48 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="0.5in" alt="英寸">`,
    })
    expect(editor.getHTML()).toContain('width="48"')
  })

  it('宽度写成 1.5cm 时按 57 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="1.5cm" alt="厘米">`,
    })
    expect(editor.getHTML()).toContain('width="57"')
  })

  it('宽度写成 20mm 时按 76 像素留下', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" width="20mm" alt="毫米">`,
    })
    expect(editor.getHTML()).toContain('width="76"')
  })

  it('图片设成铺满时画面拉满边框', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" data-fit="fill" alt="铺满">`,
    })
    expect(editor.getHTML()).toContain('object-fit: fill')
    expect(editor.getHTML()).toContain('data-fit="fill"')
  })

  it('图片设成缩小以适应时不放大原图', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'rte-image' } }),
      ],
      content: `<img src="${PIXEL}" data-fit="scale-down" alt="缩小">`,
    })
    expect(editor.getHTML()).toContain('object-fit: scale-down')
    expect(editor.getHTML()).toContain('data-fit="scale-down"')
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
