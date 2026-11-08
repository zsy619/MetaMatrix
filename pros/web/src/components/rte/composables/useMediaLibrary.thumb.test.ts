// @vitest-environment happy-dom
import { ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensured: string[] = []
const retried: string[] = []
const failed: string[] = []

vi.mock('../../../utils/mediaThumb', () => ({
  ensureMediaThumb: (src: string) => ensured.push(src),
  retryMediaThumb: (src: string) => retried.push(src),
  markMediaThumbError: (src: string) => failed.push(src),
  mediaThumbState: (src: string) => ({
    status: src.startsWith('/media/') ? 'loading' : 'direct',
    url: src,
    error: '',
  }),
}))

import { useMediaLibrary } from './useMediaLibrary'

const LS = 'metamatrix-rte-image-assets'

beforeEach(() => {
  ensured.length = 0
  retried.length = 0
  failed.length = 0
  localStorage.clear()
})

function harness() {
  return useMediaLibrary({
    editor: shallowRef(undefined),
    closeMore: () => {},
    imageCompressOnInsert: ref(false),
  })
}

describe('图片选择窗：打开时为素材预取鉴权预览', () => {
  it('打开弹窗会为每个素材请求鉴权预览（含 /media/ 内部路径）', () => {
    localStorage.setItem(
      LS,
      JSON.stringify([
        { id: 'a1', src: '/media/asset-1', name: 'a.png', categoryId: 'uncategorized', createdAt: 1 },
        { id: 'a2', src: 'data:image/png;base64,AAA', name: 'b.png', categoryId: 'uncategorized', createdAt: 2 },
      ]),
    )
    const lib = harness()
    lib.insertImage()
    expect(ensured).toEqual(['/media/asset-1', 'data:image/png;base64,AAA'])
    expect(lib.imageDialogOpen.value).toBe(true)
  })

  it('重试与失败标记都透传给缩略图状态', () => {
    const lib = harness()
    lib.retryImageThumb('/media/asset-1')
    lib.imageThumbFailed('/media/asset-1')
    expect(retried).toEqual(['/media/asset-1'])
    expect(failed).toEqual(['/media/asset-1'])
  })
})
