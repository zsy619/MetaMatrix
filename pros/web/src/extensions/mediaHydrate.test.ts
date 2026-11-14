import { describe, expect, it } from 'vitest'
import {
  clearMediaHydrateBlobs,
  isMediaHydrateGone,
  mediaFetchUrl,
  mediaHydrateWaiting,
  noteMediaHydrateError,
  noteMediaHydrateStatus,
} from './mediaHydrate'

describe('mediaFetchUrl', () => {
  it('只接受 /media/{id} 和它的签名查询', () => {
    expect(mediaFetchUrl('/media/asset-1')).toBe('/api/media/asset-1')
    expect(mediaFetchUrl('/media/asset-1?exp=10&sig=ab')).toBe('/api/media/asset-1?exp=10&sig=ab')
    expect(mediaFetchUrl('/media/../etc/passwd')).toBeNull()
    expect(mediaFetchUrl('https://evil.example/media/asset-1')).toBeNull()
    expect(mediaFetchUrl('/var/lib/media/a.png')).toBeNull()
  })

  it('素材 404 后本会话不再请求', () => {
    const src = '/media/660a4cec-1b1b-4a15-b88d-9010426ef0e1'
    expect(noteMediaHydrateStatus(src, 404)).toBe('gone')
    expect(isMediaHydrateGone(src)).toBe(true)
    expect(noteMediaHydrateStatus(src, 410)).toBe('gone')
    clearMediaHydrateBlobs()
    expect(isMediaHydrateGone(src)).toBe(false)
  })

  it('网络或 5xx 先歇 30 秒再请求', () => {
    const src = '/media/15c851d3-9bc8-486a-9793-e08833685148'
    expect(noteMediaHydrateStatus(src, 500, 1_000)).toBe('wait')
    expect(mediaHydrateWaiting(src, 1_000 + 29_000)).toBe(true)
    expect(mediaHydrateWaiting(src, 1_000 + 30_000)).toBe(false)
    noteMediaHydrateError(src, 2_000)
    expect(mediaHydrateWaiting(src, 2_000 + 1_000)).toBe(true)
    expect(noteMediaHydrateStatus(src, 200, 3_000)).toBe('ok')
    expect(mediaHydrateWaiting(src, 3_000)).toBe(false)
    expect(isMediaHydrateGone(src)).toBe(false)
    clearMediaHydrateBlobs()
  })
})
