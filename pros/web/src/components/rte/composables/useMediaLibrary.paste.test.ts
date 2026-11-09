// @vitest-environment happy-dom
import { shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const uploaded: Array<{ name: string; mediaType?: string }> = []

vi.mock('../../../api/mediaUpload', () => ({
  uploadMediaFile: vi.fn(async (file: File, deps?: { mediaType?: string }) => {
    uploaded.push({ name: file.name, mediaType: deps?.mediaType })
    return {
      id: 'asset-9',
      insertedPath: '/media/asset-9',
      previewUrl: '/media/asset-9',
      sha256: 'abc',
      created: true,
    }
  }),
}))

vi.mock('../../../utils/mediaThumb', () => ({
  ensureMediaThumb: () => {},
  retryMediaThumb: () => {},
  markMediaThumbError: () => {},
  mediaThumbState: (src: string) => ({ status: 'direct', url: src, error: '' }),
}))

vi.mock('element-plus', () => ({
  ElMessage: () => {},
}))

import { useMediaLibrary } from './useMediaLibrary'

const LS = 'metamatrix-rte-image-assets'

beforeEach(() => {
  uploaded.length = 0
  localStorage.clear()
})

function editor() {
  const inserted: unknown[] = []
  const chain = {
    focus() {
      return chain
    },
    insertContent(nodes: unknown) {
      inserted.push(nodes)
      return chain
    },
    insertContentAt(at: number, nodes: unknown) {
      inserted.push({ at, nodes })
      return chain
    },
    run() {
      return true
    },
  }
  return {
    inserted,
    value: {
      isDestroyed: false,
      state: { selection: {} },
      chain: () => chain,
    },
  }
}

describe('粘贴图片走素材库上传', () => {
  it('已登录时上传，并把素材库路径插入正文，原有素材还在', async () => {
    localStorage.setItem('metamatrix:auth:token', 'token')
    localStorage.setItem(
      LS,
      JSON.stringify([{ id: 'old', src: '/media/old', name: 'old.png', categoryId: 'uncategorized', createdAt: 1 }]),
    )
    const ed = editor()
    const lib = useMediaLibrary({
      editor: shallowRef(ed.value as never),
      closeMore: () => {},
      imageCompressOnInsert: { value: false },
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    await lib.insertUserImages([file])
    expect(uploaded).toEqual([{ name: 'shot.png', mediaType: 'image' }])
    const stored = JSON.parse(localStorage.getItem(LS) || '[]') as Array<{ src: string; name: string }>
    expect(stored.map((item) => item.src)).toEqual(['/media/asset-9', '/media/old'])
    expect(stored[0]?.name).toBe('shot.png')
    expect(ed.inserted).toEqual([
      [{ type: 'image', attrs: { src: '/media/asset-9', align: 'center', layout: 'block', alt: 'shot.png' } }],
    ])
  })

  it('未登录时不调用上传接口，仍把图片记进素材库', async () => {
    const ed = editor()
    const lib = useMediaLibrary({
      editor: shallowRef(ed.value as never),
      closeMore: () => {},
      imageCompressOnInsert: { value: false },
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    await lib.insertUserImages([file])
    expect(uploaded).toEqual([])
    const stored = JSON.parse(localStorage.getItem(LS) || '[]') as Array<{ src: string; name: string }>
    expect(stored).toHaveLength(1)
    expect(stored[0]?.name).toBe('shot.png')
    expect(String(stored[0]?.src)).toMatch(/^data:image\/png/)
  })
})
