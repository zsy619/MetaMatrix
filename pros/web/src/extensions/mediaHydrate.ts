import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { getToken } from '../api/http'
import { mediaFetchUrl } from '../utils/mediaPath'
import { seedMediaThumb } from '../utils/mediaThumb'

import {
  isMediaHydrateGone,
  mediaBlobs as blobs,
  mediaHydrateWaiting,
  mediaPending as pending,
  noteMediaHydrateError,
  noteMediaHydrateStatus,
  clearMediaHydrateBlobs,
} from './mediaHydrateState'

// 状态与判定函数都放在 mediaHydrateState（不依赖 TipTap），
// 这里原样转出，保持既有 import 路径可用。
export {
  clearMediaHydrateBlobs,
  isMediaHydrateGone,
  mediaHydrateWaiting,
  noteMediaHydrateError,
  noteMediaHydrateStatus,
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
