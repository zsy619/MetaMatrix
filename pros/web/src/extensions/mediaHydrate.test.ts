import { describe, expect, it } from 'vitest'
import { mediaFetchUrl } from './mediaHydrate'

describe('mediaFetchUrl', () => {
  it('只接受 /media/{id} 和它的签名查询', () => {
    expect(mediaFetchUrl('/media/asset-1')).toBe('/api/media/asset-1')
    expect(mediaFetchUrl('/media/asset-1?exp=10&sig=ab')).toBe('/api/media/asset-1?exp=10&sig=ab')
    expect(mediaFetchUrl('/media/../etc/passwd')).toBeNull()
    expect(mediaFetchUrl('https://evil.example/media/asset-1')).toBeNull()
    expect(mediaFetchUrl('/var/lib/media/a.png')).toBeNull()
  })
})
