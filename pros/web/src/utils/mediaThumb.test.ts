// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'secret-token-value'

vi.mock('../api/http', () => ({
  getToken: () => TOKEN,
}))

type FetchCall = { url: string; auth: string | null }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function freshModule() {
  vi.resetModules()
  return await import('./mediaThumb')
}

let calls: FetchCall[] = []

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  calls = []
  const spy = vi.fn(async (input: string, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>
    calls.push({ url: String(input), auth: headers.Authorization || null })
    return await handler(String(input))
  })
  // @ts-expect-error 覆盖全局 fetch
  globalThis.fetch = spy
  return spy
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mediaThumb：素材库内部路径要走鉴权取图', () => {
  it('内部素材不直接给 <img> 用 /media/{id}，而是取签名地址后换 blob', async () => {
    const mod = await freshModule()
    installFetch((url) => {
      if (url === '/api/media/asset-1') {
        return jsonResponse(200, { previewUrl: '/media/asset-1?exp=10&sig=ab' })
      }
      if (url === '/api/media/asset-1?exp=10&sig=ab') {
        return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
      }
      return new Response('not found', { status: 404 })
    })

    expect(mod.needsAuthPreview('/media/asset-1')).toBe(true)
    mod.ensureMediaThumb('/media/asset-1')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-1').status).toBe('ready'))

    const state = mod.mediaThumbState('/media/asset-1')
    expect(state.url.startsWith('blob:')).toBe(true)
    expect(state.url).not.toContain('/media/asset-1')
    // 两次请求都带登录令牌，且都走 /api 前缀
    expect(calls.map((c) => c.url)).toEqual([
      '/api/media/asset-1',
      '/api/media/asset-1?exp=10&sig=ab',
    ])
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
  })

  it('素材失效（404）时给出可重试的错误，且提示里不出现令牌', async () => {
    const mod = await freshModule()
    installFetch(() => new Response('not found', { status: 404 }))

    mod.ensureMediaThumb('/media/gone')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/gone').status).toBe('error'))
    const state = mod.mediaThumbState('/media/gone')
    expect(state.error).toContain('失效')
    expect(state.error).not.toContain(TOKEN)
    expect(state.url).toBe('')
  })

  it('重试会重新请求并覆盖失败状态', async () => {
    const mod = await freshModule()
    let attempt = 0
    installFetch((url) => {
      if (url === '/api/media/asset-2') {
        attempt += 1
        if (attempt === 1) return new Response('boom', { status: 500 })
        return jsonResponse(200, { previewUrl: '/media/asset-2?exp=10&sig=ab' })
      }
      return new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    })

    mod.ensureMediaThumb('/media/asset-2')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-2').status).toBe('error'))
    mod.retryMediaThumb('/media/asset-2')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-2').status).toBe('ready'))
    expect(attempt).toBe(2)
  })

  it('正文已经换成 blob 时，预览直接复用，不再请求 /media/{id}', async () => {
    const mod = await freshModule()
    const spy = installFetch(() => new Response('x'))
    const revoked: string[] = []
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url)
    })
    mod.seedMediaThumb('/media/asset-3', 'blob:already')
    expect(mod.mediaThumbState('/media/asset-3')).toEqual({ status: 'ready', url: 'blob:already', error: '' })
    mod.ensureMediaThumb('/media/asset-3')
    expect(spy).not.toHaveBeenCalled()
    mod.clearMediaThumbs()
    expect(revoked).not.toContain('blob:already')
  })

  it('data:/http(s) 直链不触发鉴权请求，直接可用', async () => {
    const mod = await freshModule()
    const spy = installFetch(() => new Response('x'))
    const state = mod.mediaThumbState('data:image/png;base64,AAA')
    expect(state.status).toBe('direct')
    expect(state.url).toBe('data:image/png;base64,AAA')
    mod.ensureMediaThumb('data:image/png;base64,AAA')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('mediaThumb：登出清理的生命周期', () => {
  it('清理会释放 blob 地址并清空状态', async () => {
    const mod = await freshModule()
    installFetch((url) => {
      if (url === '/api/media/asset-9') {
        return jsonResponse(200, { previewUrl: '/media/asset-9?exp=10&sig=ab' })
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    })
    const revoked: string[] = []
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url)
    })

    mod.ensureMediaThumb('/media/asset-9')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-9').status).toBe('ready'))
    const blobUrl = mod.mediaThumbState('/media/asset-9').url
    expect(blobUrl.startsWith('blob:')).toBe(true)

    mod.clearMediaThumbs()
    expect(revoked).toContain(blobUrl)
    // 清理后没有状态残留，重新查询按「加载中」处理
    expect(mod.mediaThumbState('/media/asset-9').status).toBe('loading')
    revokeSpy.mockRestore()
  })

  it('清理会中断在途请求，迟到的响应不会写回缓存', async () => {
    const mod = await freshModule()
    const gate: { release: () => void } = { release: () => {} }
    installFetch(async (url) => {
      if (url === '/api/media/asset-10') {
        await new Promise<void>((resolve) => {
          gate.release = resolve
        })
        return jsonResponse(200, { previewUrl: '/media/asset-10?exp=10&sig=ab' })
      }
      return new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    })

    mod.ensureMediaThumb('/media/asset-10')
    await vi.waitFor(() => expect(calls.length).toBe(1))
    mod.clearMediaThumbs()
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mod.mediaThumbState('/media/asset-10').status).not.toBe('ready')
    expect(mod.mediaThumbState('/media/asset-10').url).toBe('')
  })

  it('重试会中止旧请求并真的再发一次', async () => {
    const mod = await freshModule()
    installFetch((url) => {
      if (url === '/api/media/asset-11') {
        return jsonResponse(200, { previewUrl: '/media/asset-11?exp=10&sig=ab' })
      }
      return new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    })

    mod.ensureMediaThumb('/media/asset-11')
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-11').status).toBe('ready'))
    const before = calls.length
    mod.retryMediaThumb('/media/asset-11')
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(before))
    await vi.waitFor(() => expect(mod.mediaThumbState('/media/asset-11').status).toBe('ready'))
  })
})
