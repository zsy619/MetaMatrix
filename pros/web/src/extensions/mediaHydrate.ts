import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { getToken } from '../api/http'

const blobs = new Map<string, string>()
const pending = new Set<string>()

/** Browser fetches go through /api, which the dev server strips before the API. */
export function mediaFetchUrl(path: string): string | null {
  const queryAt = path.indexOf('?')
  const base = queryAt >= 0 ? path.slice(0, queryAt) : path
  if (!/^\/media\/[0-9a-zA-Z-]+$/.test(base)) return null
  if (queryAt >= 0 && !/^\?[A-Za-z0-9._~%=&-]+$/.test(path.slice(queryAt))) return null
  return `/api${path}`
}

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
  blobs.set(src, blobUrl)
  if (el.isConnected && (el.getAttribute('src') || '').startsWith('/media/')) el.src = blobUrl
}
