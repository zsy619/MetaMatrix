// @vitest-environment happy-dom
/**
 * 图片节点被 ProseMirror 重建后，blob 地址必须能自动贴回新元素。
 *
 * 线上症状：上传成功、接口 201，但正文图片裂开。原因是取图是异步的，
 * 字节回来时节点视图已经把 img 换掉了，写到旧元素上没人看得见，
 * 新建的 img 仍是 /media/{id}，浏览器去站点域名取回 index.html → 裂图。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyMediaBlobToEditor,
  clearMediaHydrateBlobs,
  installMediaSrcResolver,
  mediaBlobs,
  observeMediaBlobRestore,
} from './mediaHydrateState'

const SRC = '/media/660a4cec-1b1b-4a15-b88d-9010426ef0e1'

describe('mediaHydrate：节点重建后自动贴回 blob', () => {
  beforeEach(() => {
    clearMediaHydrateBlobs()
  })

  afterEach(() => {
    clearMediaHydrateBlobs()
  })

  it('字节回来后，贴的是当前所有同源元素，而不是发起请求的那个旧元素', () => {
    const root = document.createElement('div')
    const stale = document.createElement('img')
    stale.setAttribute('src', SRC)
    const fresh = document.createElement('img')
    fresh.setAttribute('src', SRC)
    fresh.classList.add('is-broken')
    root.append(stale, fresh)
    stale.remove() // 模拟 ProseMirror 已经把旧元素换掉

    const applied = applyMediaBlobToEditor(root, SRC, 'blob:hydrated')
    expect(applied).toBe(1)
    expect(fresh.getAttribute('src')).toBe('blob:hydrated')
    expect(fresh.classList.contains('is-broken')).toBe(false)
  })

  it('新建的 /media 图片会被观察器自动贴上缓存里的 blob', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mediaBlobs.set(SRC, 'blob:hydrated')
    const stop = observeMediaBlobRestore(root)

    const img = document.createElement('img')
    img.setAttribute('src', SRC)
    img.classList.add('is-broken')
    root.appendChild(img)
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(img.getAttribute('src')).toBe('blob:hydrated')
    expect(img.classList.contains('is-broken')).toBe(false)
    stop()
    root.remove()
  })

  it('节点视图回写 /media 路径时会被解析成缓存里的 blob（TipTap 每次更新都会回写）', () => {
    mediaBlobs.set(SRC, 'blob:hydrated')
    const img = document.createElement('img')
    installMediaSrcResolver(img)
    img.src = SRC
    expect(img.getAttribute('src')).toBe('blob:hydrated')
    expect(img.dataset.mediaSrc).toBe(SRC)
  })

  it('还没有缓存时保持原样，等字节回来再替换', () => {
    const img = document.createElement('img')
    document.body.appendChild(img)
    installMediaSrcResolver(img)
    img.src = SRC
    expect(img.getAttribute('src')).toBe(SRC)
    mediaBlobs.set(SRC, 'blob:hydrated')
    expect(applyMediaBlobToEditor(document, SRC, 'blob:hydrated')).toBe(1)
    expect(img.getAttribute('src')).toBe('blob:hydrated')
    img.remove()
  })
})
