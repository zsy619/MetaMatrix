import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { getToken } from '../api/http'
import { mediaFetchUrl } from '../utils/mediaPath'
import { seedMediaThumb } from '../utils/mediaThumb'

const blobs = new Map<string, string>()
const pending = new Set<string>()
/** 服务端明确说不存在的路径。编辑器每次更新都会再扫一遍 DOM，不记住的话会一直打 404。 */
const gone = new Set<string>()
/** 其它失败（网络、5xx）的下次可请求时间，避免每次按键都再打一次。 */
const retryAt = new Map<string, number>()
const RETRY_GAP_MS = 30_000

/** 404 / 410：素材已删除或不属于当前用户，本会话不再请求。 */
export function noteMediaHydrateStatus(src: string, status: number, now = Date.now()): 'gone' | 'ok' | 'wait' {
  if (status === 404 || status === 410) {
    gone.add(src)
    retryAt.delete(src)
    return 'gone'
  }
  if (status >= 200 && status < 300) {
    gone.delete(src)
    retryAt.delete(src)
    return 'ok'
  }
  retryAt.set(src, now + RETRY_GAP_MS)
  return 'wait'
}

export function noteMediaHydrateError(src: string, now = Date.now()): void {
  if (!src || gone.has(src)) return
  retryAt.set(src, now + RETRY_GAP_MS)
}

export function isMediaHydrateGone(src: string): boolean {
  return gone.has(src)
}

export function mediaHydrateWaiting(src: string, now = Date.now()): boolean {
  const until = retryAt.get(src)
  return until != null && now < until
}

/**
 * 释放正文图片的 blob 缓存（登出等场景）。
 *
 * blob: 地址绑定在创建它的文档里，登出后继续留着既占内存，也可能把上一个
 * 会话的预览带给下一个用户，所以登出时统一回收。
 */
export function clearMediaHydrateBlobs(): void {
  blobs.forEach((url) => URL.revokeObjectURL(url))
  blobs.clear()
  pending.clear()
  gone.clear()
  retryAt.clear()
}

/** Browser fetches go through /api, which the dev server strips before the API. */
export { mediaFetchUrl }

/**
 * The document keeps the stable /media/{id} path. The DOM element loads a
 * short-lived signed URL with the login token, then a blob URL. The blob is
 * not written back into the document.
 */
export const MediaHydrate = Extension.create({
  name: 'mediaHydrate',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          const run = () => {
            const token = getToken()
            if (!token) return
            const nodes = editorView.dom.querySelectorAll(
              'img[src^="/media/"], audio[src^="/media/"], video[src^="/media/"]',
            )
            nodes.forEach((node) => {
              const el = node as HTMLImageElement
              const src = el.getAttribute('src') || ''
              const cached = blobs.get(src)
              if (cached) {
                seedMediaThumb(src, cached)
                if (el.src !== cached) el.src = cached
                return
              }
              if (isMediaHydrateGone(src)) {
                markMissing(el)
                return
              }
              if (!src.startsWith('/media/') || pending.has(src) || mediaHydrateWaiting(src)) return
              const id = src.slice('/media/'.length)
              if (!/^[0-9a-zA-Z-]+$/.test(id)) return
              pending.add(src)
              void hydrate(el, src, id, token).finally(() => pending.delete(src))
            })
          }
          queueMicrotask(run)
          return {
            update: run,
            destroy() {},
          }
        },
      }),
    ]
  },
})

function markMissing(el: HTMLElement) {
  el.dataset.mediaMissing = '1'
  if (!el.title) el.title = '素材已失效或被删除'
}

async function hydrate(el: HTMLImageElement, src: string, id: string, token: string) {
  const metaUrl = mediaFetchUrl(`/media/${id}`)
  if (!metaUrl) return
  let metaRes: Response
  try {
    metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    noteMediaHydrateError(src)
    return
  }
  const outcome = noteMediaHydrateStatus(src, metaRes.status)
  if (outcome === 'gone') {
    markMissing(el)
    return
  }
  if (outcome !== 'ok') return
  let preview = ''
  try {
    const meta = (await metaRes.json()) as { previewUrl?: string }
    preview = mediaFetchUrl(String(meta.previewUrl || '')) || ''
  } catch {
    noteMediaHydrateError(src)
    return
  }
  if (!preview) {
    noteMediaHydrateError(src)
    return
  }
  let fileRes: Response
  try {
    fileRes = await fetch(preview, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    noteMediaHydrateError(src)
    return
  }
  const fileOutcome = noteMediaHydrateStatus(src, fileRes.status)
  if (fileOutcome === 'gone') {
    markMissing(el)
    return
  }
  if (fileOutcome !== 'ok') return
  const blobUrl = URL.createObjectURL(await fileRes.blob())
  const old = blobs.get(src)
  if (old) URL.revokeObjectURL(old)
  blobs.set(src, blobUrl)
  seedMediaThumb(src, blobUrl)
  if (el.isConnected && (el.getAttribute('src') || '').startsWith('/media/')) el.src = blobUrl
}
