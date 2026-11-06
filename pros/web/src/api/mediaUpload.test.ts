import { describe, expect, it, vi } from 'vitest'
import { uploadMediaFile } from './mediaUpload'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('uploadMediaFile', () => {
  it('已有哈希不再上传，并返回内部路径', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/media/check')) {
        return jsonResponse(200, { exists: true, id: 'asset-1', insertedPath: '/media/asset-1' })
      }
      return jsonResponse(500, { message: 'should not upload' })
    })
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' })
    const stored = await uploadMediaFile(file, {
      token: 't',
      fetch: fetchImpl as unknown as typeof fetch,
      hash: async () => 'hash-1',
    })
    expect(stored).toMatchObject({ id: 'asset-1', insertedPath: '/media/asset-1', created: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('小文件走整文件上传，拒绝磁盘路径', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/media/check')) return jsonResponse(200, { exists: false })
      expect(init?.body).toBeInstanceOf(FormData)
      return jsonResponse(201, {
        id: 'asset-2',
        insertedPath: '/media/asset-2',
        previewUrl: '/media/asset-2?exp=1&sig=ab',
        sha256: 'hash-2',
        created: true,
      })
    })
    const stored = await uploadMediaFile(new File(['hello'], 'b.txt'), {
      token: 't',
      fetch: fetchImpl as unknown as typeof fetch,
      hash: async () => 'hash-2',
    })
    expect(stored.insertedPath).toBe('/media/asset-2')
    expect(stored.previewUrl).toContain('sig=')
  })

  it('超过 20MB 走分片，缺片后续传后再完成', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '')
      calls.push(path)
      if (path === '/media/check') return jsonResponse(200, { exists: false })
      if (path === '/media/upload/chunk/prepare') {
        return jsonResponse(201, { uploadId: 'up-1', partSize: 20 * 1024 * 1024, missing: [0, 1] })
      }
      if (path === '/media/upload/chunk/up-1') return jsonResponse(200, { missing: [1] })
      if (path.startsWith('/media/upload/chunk/up-1/part')) return jsonResponse(200, { missing: [] })
      if (path.endsWith('/finish')) {
        return jsonResponse(201, { id: 'asset-3', insertedPath: '/media/asset-3', sha256: 'h', created: true })
      }
      return jsonResponse(500, { message: path })
    })
    const bytes = new Uint8Array(20 * 1024 * 1024 + 5)
    const stored = await uploadMediaFile(new File([bytes], 'big.bin'), {
      token: 't',
      fetch: fetchImpl as unknown as typeof fetch,
      hash: async () => 'h',
      mediaType: 'file',
    })
    expect(stored.insertedPath).toBe('/media/asset-3')
    expect(calls.some((p) => p.includes('/part?index=1'))).toBe(true)
    expect(calls.at(-1)).toContain('/finish')
  })

  it('未登录不发请求', async () => {
    const fetchImpl = vi.fn()
    await expect(uploadMediaFile(new File(['a'], 'a.txt'), { token: null, fetch: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/未登录/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
