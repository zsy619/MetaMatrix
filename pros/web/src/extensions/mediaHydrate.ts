import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { getToken } from '../api/http'
import { mediaFetchUrl } from '../utils/mediaPath'

const blobs = new Map<string, string>()
const pending = new Set<string>()

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
                if (el.src !== cached) el.src = cached
                return
              }
              if (!src.startsWith('/media/') || pending.has(src)) return
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

async function hydrate(el: HTMLImageElement, src: string, id: string, token: string) {
  const metaUrl = mediaFetchUrl(`/media/${id}`)
  if (!metaUrl) return
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) return
  const meta = (await metaRes.json()) as { previewUrl?: string }
  const preview = mediaFetchUrl(String(meta.previewUrl || ''))
  if (!preview) return
  const fileRes = await fetch(preview, { headers: { Authorization: `Bearer ${token}` } })
  if (!fileRes.ok) return
  const blobUrl = URL.createObjectURL(await fileRes.blob())
  const old = blobs.get(src)
  if (old) URL.revokeObjectURL(old)
  blobs.set(src, blobUrl)
  if (el.isConnected && (el.getAttribute('src') || '').startsWith('/media/')) el.src = blobUrl
}
