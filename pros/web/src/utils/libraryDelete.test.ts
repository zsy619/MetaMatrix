// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken } from '../api/http'
import { dropLibraryAssets, forgetStoredMedia, mediaIdFromSrc, releaseLibraryCategory } from './libraryDelete'

describe('素材库删除', () => {
  it('只认 /media/{id}', () => {
    expect(mediaIdFromSrc('/media/asset-1')).toBe('asset-1')
    expect(mediaIdFromSrc('/media/asset-1?exp=1&sig=ab')).toBe('asset-1')
    expect(mediaIdFromSrc('https://cdn.example/a.png')).toBeNull()
    expect(mediaIdFromSrc('blob:audio-1')).toBeNull()
  })

  it('按 id 去掉素材，分类删除后素材回到未分类', () => {
    const assets = [
      { id: 'a', categoryId: 'cat', src: '/media/a' },
      { id: 'b', categoryId: 'cat', src: '/media/b' },
      { id: 'c', categoryId: 'uncategorized', src: 'https://x' },
    ]
    expect(dropLibraryAssets(assets, ['b']).map((item) => item.id)).toEqual(['a', 'c'])
    expect(releaseLibraryCategory(assets, 'cat').map((item) => item.categoryId)).toEqual([
      'uncategorized',
      'uncategorized',
      'uncategorized',
    ])
  })

  it('内部路径会请求删除接口', async () => {
    setToken('token')
    expect(getToken()).toBe('token')
    const fetchMock = vi.fn(async () => new Response('{"deleted":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await forgetStoredMedia('/media/asset-9')
    await forgetStoredMedia('https://cdn.example/a.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/media/asset-9')
    expect(init.method).toBe('DELETE')
    expect(String((init.headers as Record<string, string>).Authorization)).toContain('token')
  })
})

afterEach(() => {
  setToken(null)
  vi.unstubAllGlobals()
})
