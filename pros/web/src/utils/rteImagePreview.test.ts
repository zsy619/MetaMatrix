// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ImageGroup } from '../extensions/imageGroup'
import { RteImage } from '../extensions/rteImage'
import {
  collectEditorImages,
  imageDownloadName,
  indexForImage,
  stepImageZoom,
  wheelImageZoom,
} from './rteImagePreview'

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('图片预览列表', () => {
  it('按文档顺序收集单图和图片组', () => {
    const host = document.createElement('div')
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({ dropcursor: false }),
        RteImage.configure({ inline: false, allowBase64: true }),
        ImageGroup,
      ],
      content: [
        `<img src="${PIXEL}" alt="左图" data-caption="左边">`,
        `<div data-type="image-group" data-align="center"><div class="rte-image-group-row"><img src="${PIXEL}" alt="组一"><img src="https://example.com/b.jpg" alt="组二"></div></div>`,
        '<img src="https://example.com/c.png" alt="尾图">',
      ].join(''),
    })
    const items = collectEditorImages(editor.state.doc)
    expect(items.map((item) => item.alt)).toEqual(['左图', '组一', '组二', '尾图'])
    expect(items[0]?.caption).toBe('左边')
    expect(items.map((item) => item.pos)).toEqual([...items.map((item) => item.pos)].sort((a, b) => a - b))
    const groupTwo = items[2]!
    expect(indexForImage(items, groupTwo.pos, groupTwo.src)).toBe(2)
    expect(indexForImage(items, null, 'https://example.com/c.png')).toBe(3)
    editor.destroy()
  })

  it('缩放按档位走，滚轮按比例走', () => {
    expect(stepImageZoom(1, 1)).toBe(1.25)
    expect(stepImageZoom(1, -1)).toBe(0.75)
    expect(stepImageZoom(5, 1)).toBe(6.25)
    expect(stepImageZoom(0.1, -1)).toBe(0.1)
    expect(wheelImageZoom(1, -1)).toBe(1.1)
    expect(wheelImageZoom(1, 10)).toBe(0.9)
  })

  it('下载名去掉非法字符并补扩展名', () => {
    expect(imageDownloadName({ alt: '左图', caption: '', src: PIXEL }, 0)).toBe('左图.gif')
    expect(imageDownloadName({ alt: '', caption: 'a/b:c', src: 'https://example.com/c.png?x=1' }, 1)).toBe('a-b-c.png')
    expect(imageDownloadName({ alt: '', caption: '', src: 'blob:none' }, 2)).toBe('image-3.png')
  })
})
