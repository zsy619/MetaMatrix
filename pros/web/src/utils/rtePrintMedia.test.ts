// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { seedMediaThumb } from './mediaThumb'
import { rewritePrintMediaSrc } from './rtePrintMedia'

describe('打印预览图片', () => {
  it('内部素材地址换成正文已经打开的图片', async () => {
    seedMediaThumb('/media/abc', 'blob:preview-abc')
    const html = await rewritePrintMediaSrc('<p><img src="/media/abc" alt="图"></p>', null)
    expect(html).toContain('src="blob:preview-abc"')
    expect(html).not.toContain('/media/abc')
  })

  it('还没进缓存时，按顺序用正文里的 blob 地址', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="ProseMirror"><img src="blob:live-1" alt="甲"></div>'
    const html = await rewritePrintMediaSrc('<img src="/media/not-seeded" alt="甲">', root)
    expect(html).toContain('src="blob:live-1"')
  })
})