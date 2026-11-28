/**
 * 打印预览里的图片要能看见。
 *
 * 文档里存的是 /media/{id}，浏览器直接当图片地址会 404。
 * 正文已经换成 blob 地址时，预览沿用那张图；否则等素材预览就绪再换。
 */
import { ensureMediaThumb, mediaThumbState } from './mediaThumb'
import { isInternalMediaPath } from './mediaPath'

function liveBlobByOrder(root: ParentNode | null | undefined): string[] {
  if (!root) return []
  return [...root.querySelectorAll('.ProseMirror img')]
    .filter((img) => !img.closest('[data-type="echarts-block"], .rte-echarts-block'))
    .map((img) => {
      const el = img as HTMLImageElement
      const current = el.currentSrc || el.src || ''
      return current.startsWith('blob:') || current.startsWith('data:') ? current : ''
    })
}

async function resolvedSrc(src: string): Promise<string> {
  if (!src || !isInternalMediaPath(src)) return src
  const ready = mediaThumbState(src)
  if (ready.url && (ready.status === 'ready' || ready.status === 'direct')) return ready.url
  ensureMediaThumb(src)
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    const state = mediaThumbState(src)
    if (state.url && (state.status === 'ready' || state.status === 'direct')) return state.url
    if (state.status === 'error') return src
  }
  return src
}

/** 把预览 HTML 里的内部素材地址换成已经能显示的图片地址。 */
export async function rewritePrintMediaSrc(
  html: string,
  root: ParentNode | null | undefined,
): Promise<string> {
  if (!html || typeof document === 'undefined') return html
  const box = document.createElement('div')
  box.innerHTML = html
  const images = [...box.querySelectorAll('img')]
  const live = liveBlobByOrder(root)
  let liveIndex = 0
  const takeLive = () => {
    while (liveIndex < live.length && !live[liveIndex]) liveIndex += 1
    const found = live[liveIndex] || ''
    liveIndex += 1
    return found
  }
  for (const img of images) {
    const src = img.getAttribute('src') || ''
    if (!isInternalMediaPath(src)) continue
    const known = mediaThumbState(src)
    if (known.url && (known.status === 'ready' || known.status === 'direct')) {
      img.setAttribute('src', known.url)
      takeLive()
      continue
    }
    const fromDom = takeLive()
    if (fromDom) {
      img.setAttribute('src', fromDom)
      continue
    }
    const waited = await resolvedSrc(src)
    if (waited !== src) img.setAttribute('src', waited)
  }
  return box.innerHTML
}
