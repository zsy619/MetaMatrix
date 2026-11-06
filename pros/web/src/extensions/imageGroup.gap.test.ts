// @vitest-environment happy-dom
/** 图片组组内间距：缺省 8 不写进 HTML；非缺省 data-gap 可往返；按钮按 0/8/16/24 切换。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup } from './imageGroup'
import { RteImage } from './rteImage'

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

function makeEditor(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      RteImage.configure({ inline: false, allowBase64: true }),
      ImageGroup,
    ],
    content,
  })
  return editor
}

function groupHtml(gap?: number) {
  const gapAttr = gap == null ? '' : ` data-gap="${gap}"`
  return `<div data-type="image-group" data-align="center"${gapAttr}><div class="rte-image-group-row"><img src="${PIXEL}"><img src="${PIXEL}"></div></div>`
}

describe('图片组组内间距', () => {
  it('缺省 8 像素不写入 data-gap', () => {
    const ed = makeEditor(groupHtml())
    const html = ed.getHTML()
    expect(html).not.toContain('data-gap')
    const node = ed.state.doc.firstChild
    expect(node?.type.name).toBe('imageGroup')
    expect(node?.attrs.gap).toBe(8)
    const dom = ed.view.dom.querySelector('[data-type="image-group"]') as HTMLElement
    expect(dom.style.getPropertyValue('--rte-group-gap')).toBe('')
    expect(dom.querySelector('.rte-image-group-gap')?.textContent).toBe('8')
  })

  it('data-gap 往返，并写到行间距变量', () => {
    const ed = makeEditor(groupHtml(24))
    expect(ed.state.doc.firstChild?.attrs.gap).toBe(24)
    expect(ed.getHTML()).toContain('data-gap="24"')
    const dom = ed.view.dom.querySelector('[data-type="image-group"]') as HTMLElement
    expect(dom.getAttribute('data-gap')).toBe('24')
    expect(dom.style.getPropertyValue('--rte-group-gap')).toBe('24px')
    const row = dom.querySelector('.rte-image-group-row') as HTMLElement
    expect(row.style.gap).toContain('--rte-group-gap')
  })

  it('间距按钮从 8 切到 16', () => {
    const ed = makeEditor(groupHtml())
    const button = ed.view.dom.querySelector('.rte-image-group-gap') as HTMLButtonElement
    button.click()
    expect(ed.state.doc.firstChild?.attrs.gap).toBe(16)
    expect(ed.getHTML()).toContain('data-gap="16"')
    expect(button.textContent).toBe('16')
  })
})
