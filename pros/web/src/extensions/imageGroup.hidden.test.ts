// @vitest-environment happy-dom
/** 藏起中间图后，左右两张仍按原来的比例分宽，行高不再按三张来算。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup, layoutImageGroupChrome } from './imageGroup'
import { RteImage } from './rteImage'
import { rowLayout } from '../utils/rteImageGroup'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.getElementById('rte-image-group-layout')?.remove()
})

describe('藏起图片后的行比例', () => {
  it('中间图藏起后，左右仍是 1:2，分隔条只留在可见图之间', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({
          inline: false,
          allowBase64: true,
          resize: { enabled: true, directions: ['right'], minWidth: 48, minHeight: 48, alwaysPreserveAspectRatio: true },
        }),
        ImageGroup,
      ],
      content:
        '<div data-type="image-group" data-align="center" data-ratios="1:3:2" data-ratio-mode="custom"><div class="rte-image-group-row"><img src="https://example.com/a.png" alt="左"><img src="https://example.com/b.png" alt="中" data-concealed="1"><img src="https://example.com/c.png" alt="右"></div></div>',
    })
    const dom = editor.view.dom.querySelector('[data-type="image-group"]') as HTMLElement
    const row = dom.querySelector('.rte-image-group-row') as HTMLElement
    Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => 640 })
    Object.defineProperty(dom, 'clientWidth', { configurable: true, get: () => 640 })
    layoutImageGroupChrome(editor.view)
    const frames = [...row.children].filter((child) => child instanceof HTMLElement) as HTMLElement[]
    expect(frames[1]?.style.display).toBe('none')
    expect(dom.style.getPropertyValue('--g0')).toBe('1')
    expect(dom.style.getPropertyValue('--g2')).toBe('2')
    expect(row.style.height).toBe(`${rowLayout(640, [1, 0, 2], 8).height}px`)
    expect(dom.querySelectorAll('.rte-image-group-divider')).toHaveLength(1)
  })
})
