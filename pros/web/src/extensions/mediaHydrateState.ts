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
