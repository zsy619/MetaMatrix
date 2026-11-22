/**
 * 正文图片 hydrate 的会话级状态（不依赖 TipTap）。
 *
 * 单独拆出来的原因：auth store（登出回收 blob）要用这份状态，
 * 而 mediaHydrate.ts 依赖 @tiptap/core —— 让 auth store 引它等于把
 * 整套 TipTap / ProseMirror（约 2.6MB 开发依赖）拖进每个页面的首屏。
 */

export const mediaBlobs = new Map<string, string>()
export const mediaPending = new Set<string>()
/** 服务端明确说不存在的路径。编辑器每次更新都会再扫一遍 DOM，不记住的话会一直打 404。 */
export const mediaGone = new Set<string>()
/** 其它失败（网络、5xx）的下次可请求时间，避免每次按键都再打一次。 */
export const mediaRetryAt = new Map<string, number>()
const RETRY_GAP_MS = 30_000

/** 已经装过 src 解析器的元素，避免重复 defineProperty。 */
const mediaSrcResolvers = new WeakSet<HTMLElement>()

/** 素材库内部路径：/media/{id}。站点域名没有这个路由，会返回 index.html。 */
export function isInternalMediaSrc(value: string): boolean {
  return /^\/media\/[0-9a-zA-Z-]+$/.test(value)
}

/**
 * 把要写进 <img src> 的地址解析成「真正能显示」的地址。
 *
 * - 命中缓存 → 用 blob 地址；
 * - 没命中 → 原样返回（此时还没取到字节，保持原样最安全，
 *   换成占位图会让图片在字节回来之前没有原始尺寸）。
 */
export function resolveMediaSrc(value: string): string {
  return mediaBlobs.get(value) || value
}

/**
 * 给 <img> 装一个 src 解析器。
 *
 * 为什么必须装：TipTap 的图片节点视图（带缩放手柄的那个）每次更新节点都会
 * 执行 `el.src = 节点属性里的 /media/{id}`，把我们已经换好的 blob 地址冲掉，
 * 图片于是又变回「浏览器去站点域名取回 index.html」的裂图状态。
 *
 * 这里在元素上重写 src 属性：写入素材库路径时自动换成缓存里的 blob 地址，
 * 从根上杜绝「刚修好又被冲掉」。
 */
export function installMediaSrcResolver(el: HTMLImageElement): void {
  if (!el || mediaSrcResolvers.has(el)) return
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  if (!desc?.get || !desc.set) return
  Object.defineProperty(el, 'src', {
    configurable: true,
    enumerable: false,
    get(this: HTMLImageElement) {
      return desc.get!.call(this)
    },
    set(this: HTMLImageElement, value: string) {
      const raw = String(value)
      if (isInternalMediaSrc(raw)) this.dataset.mediaSrc = raw
      desc.set!.call(this, resolveMediaSrc(raw))
    },
  })
  mediaSrcResolvers.add(el)
}

/** 404 / 410：素材已删除或不属于当前用户，本会话不再请求。 */
export function noteMediaHydrateStatus(src: string, status: number, now = Date.now()): 'gone' | 'ok' | 'wait' {
  if (status === 404 || status === 410) {
    mediaGone.add(src)
    mediaRetryAt.delete(src)
    return 'gone'
  }
  if (status >= 200 && status < 300) {
    mediaGone.delete(src)
    mediaRetryAt.delete(src)
    return 'ok'
  }
  mediaRetryAt.set(src, now + RETRY_GAP_MS)
  return 'wait'
}

export function noteMediaHydrateError(src: string, now = Date.now()): void {
  if (!src || mediaGone.has(src)) return
  mediaRetryAt.set(src, now + RETRY_GAP_MS)
}

export function isMediaHydrateGone(src: string): boolean {
  return mediaGone.has(src)
}

export function mediaHydrateWaiting(src: string, now = Date.now()): boolean {
  const until = mediaRetryAt.get(src)
  return until != null && now < until
}

/**
 * 把 blob 地址写回元素，并清掉「裂图」标记。
 *
 * 用 setAttribute 而不是 el.src：属性写入能被 MutationObserver 观察到，
 * 观察器与取图流程之间不会出现「谁先写」的竞态。
 */
export function applyMediaBlobToElement(el: HTMLElement, src: string, blobUrl: string): boolean {
  if (!el) return false
  const attr = el.getAttribute('src') || ''
  // 元素可能已经被节点视图重置过（属性回到 /media/{id}），
  // 也可能已经被解析器改写成 blob；两种都要认。
  if (attr !== src && el.dataset.mediaSrc !== src) return false
  el.setAttribute('src', blobUrl)
  el.dataset.mediaSrc = src
  el.classList.remove('is-broken')
  el.classList.remove('is-media-placeholder')
  delete el.dataset.mediaPlaceholder
  delete el.dataset.mediaOrigSrc
  delete el.dataset.mediaMissing
  return true
}

/**
 * 把 blob 贴回 root 下**当前**所有同源元素。
 *
 * 为什么必须扫全量而不是只改发起请求的那个元素：
   取图是异步的，等字节回来时 ProseMirror 可能已经重建过 img，
   手里那个 el 已经脱离文档（isConnected=false），写上去没人看得见，
   新建的 img 仍然是 /media/{id}，浏览器就会去站点域名取到 index.html，
   于是「上传成功但图片裂开」。
 */
export function applyMediaBlobToEditor(root: ParentNode, src: string, blobUrl: string): number {
  let applied = 0
  root.querySelectorAll<HTMLElement>('img[src], audio[src], video[src]').forEach((node) => {
    if (applyMediaBlobToElement(node, src, blobUrl)) applied += 1
  })
  return applied
}

/**
 * 观察编辑器 DOM，一旦出现新的 /media/{id} 图片，就把缓存里的 blob 贴回去。
 *
 * ProseMirror 的图片节点视图（缩放框）会在选中/更新时重建 img 元素，
 * 新元素又变回文档里的 /media/{id}；没有观察器，重建后就没人再把 blob
 * 地址写回去，图片会一直停在「裂图」状态。
 */
export function observeMediaBlobRestore(root: HTMLElement): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined
  // 观察器回调会扫描整个编辑器 DOM，必须合并成「每帧一次」，
  // 否则每次输入的每个字符都会触发一次全量查询。
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    const run = () => {
      scheduled = false
      root.querySelectorAll<HTMLElement>('img[src^="/media/"], img[data-media-src^="/media/"]').forEach((node) => {
        const src = node.dataset.mediaSrc || node.getAttribute('src') || ''
        installMediaSrcResolver(node as HTMLImageElement)
        const cached = mediaBlobs.get(src)
        if (cached) applyMediaBlobToElement(node, src, cached)
      })
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 0)
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  return () => observer.disconnect()
}

/**
 * 释放正文图片的 blob 缓存（登出等场景）。
 *
 * blob: 地址绑定在创建它的文档里，登出后继续留着既占内存，也可能把上一个
 * 会话的预览带给下一个用户，所以登出时统一回收。
 */
export function clearMediaHydrateBlobs(): void {
  mediaBlobs.forEach((url) => URL.revokeObjectURL(url))
  mediaBlobs.clear()
  mediaPending.clear()
  mediaGone.clear()
  mediaRetryAt.clear()
}
