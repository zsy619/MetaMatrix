import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 素材取图地址必须带 API 基址。
 *
 * 生产环境站点与 API 不同源（站点 metamatrix.yy24365.com，API metamatrix.api.yy24365.com），
 * 写死 /api 会把取图请求打到站点域名，被 SPA 的 index.html 吞掉，
 * 表现为「上传成功但图片裂开」。开发环境没有 VITE_API_BASE，仍走 /api 由 vite 代理。
 */
async function loadMediaPath(base?: string) {
  vi.resetModules()
  if (base === undefined) vi.stubEnv('VITE_API_BASE', '')
  else vi.stubEnv('VITE_API_BASE', base)
  return await import('./mediaPath')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('mediaPath · 取图地址', () => {
  it('开发环境（无 VITE_API_BASE）走 /api 相对路径', async () => {
    const { mediaFetchUrl } = await loadMediaPath()
    expect(mediaFetchUrl('/media/asset-1')).toBe('/api/media/asset-1')
  })

  it('生产环境（配置 VITE_API_BASE）用绝对地址，跨域直连 API', async () => {
    const { mediaFetchUrl } = await loadMediaPath('https://metamatrix.api.yy24365.com')
    expect(mediaFetchUrl('/media/asset-1')).toBe('https://metamatrix.api.yy24365.com/media/asset-1')
  })

  it('API 基址带结尾斜杠时不产生双斜杠', async () => {
    const { mediaFetchUrl } = await loadMediaPath('https://metamatrix.api.yy24365.com/')
    expect(mediaFetchUrl('/media/asset-1')).toBe('https://metamatrix.api.yy24365.com/media/asset-1')
  })

  it('带签名的预览地址同样补基址', async () => {
    const { mediaFetchUrl } = await loadMediaPath('https://metamatrix.api.yy24365.com')
    expect(mediaFetchUrl('/media/asset-1?exp=10&sig=ab')).toBe(
      'https://metamatrix.api.yy24365.com/media/asset-1?exp=10&sig=ab',
    )
  })

  it('非素材库路径一律拒绝', async () => {
    const { mediaFetchUrl, isInternalMediaPath } = await loadMediaPath('https://metamatrix.api.yy24365.com')
    expect(mediaFetchUrl('/media/../../etc/passwd')).toBeNull()
    expect(mediaFetchUrl('/media/asset 1')).toBeNull()
    expect(isInternalMediaPath('/media/asset-1')).toBe(true)
    expect(isInternalMediaPath('https://example.com/a.png')).toBe(false)
  })
})
