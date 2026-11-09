/** 图片预览：收集正文图片、缩放步进、下载文件名。 */

export type RtePreviewImage = {
  src: string
  alt: string
  caption: string
  pos: number
}

type DocNode = {
  type: { name: string }
  attrs: Record<string, unknown>
}

type DocLike = {
  descendants: (f: (node: DocNode, pos: number) => void | boolean) => void
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 8
const ZOOM_STOPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5]

/** 按文档顺序收集图片，图片组里的图也算。 */
export function collectEditorImages(doc: DocLike): RtePreviewImage[] {
  const items: RtePreviewImage[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return
    const src = String(node.attrs.src || '')
    if (!src) return
    items.push({
      src,
      alt: String(node.attrs.alt || ''),
      caption: String(node.attrs.caption || ''),
      pos,
    })
  })
  return items
}

/** 双击位置落到哪一张。pos 取「起点不晚于点击处」的最后一张，对不上再按 src。 */
export function indexForImage(
  items: Array<Pick<RtePreviewImage, 'pos' | 'src'>>,
  pos: number | null,
  src: string,
): number {
  if (!items.length) return 0
  if (pos != null && Number.isFinite(pos)) {
    let found = -1
    for (let i = 0; i < items.length; i += 1) {
      if (items[i]!.pos <= pos) found = i
      else break
    }
    if (found >= 0) return found
  }
  const bySrc = items.findIndex((item) => item.src === src)
  return bySrc >= 0 ? bySrc : 0
}

export function clampImageZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100))
}

/** 放大为正，缩小为负。先跳到预设档，超出后按 1.25 倍。 */
export function stepImageZoom(current: number, direction: 1 | -1): number {
  const zoom = clampImageZoom(current)
  if (direction > 0) {
    const next = ZOOM_STOPS.find((stop) => stop > zoom + 0.001)
    return clampImageZoom(next ?? zoom * 1.25)
  }
  const prev = [...ZOOM_STOPS].reverse().find((stop) => stop < zoom - 0.001)
  return clampImageZoom(prev ?? zoom / 1.25)
}

/** 滚轮：向下缩小，向上放大。 */
export function wheelImageZoom(current: number, deltaY: number): number {
  const factor = deltaY > 0 ? 0.9 : 1.1
  return clampImageZoom(current * factor)
}

export function imageFileExt(src: string): string {
  const data = /^data:image\/([a-z0-9.+-]+)/i.exec(src)
  if (data) {
    const kind = data[1]!.toLowerCase()
    if (kind === 'jpeg') return 'jpg'
    if (kind.includes('svg')) return 'svg'
    return kind.split('+')[0] || 'png'
  }
  const clean = src.split('?')[0]?.split('#')[0] || ''
  const matched = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.exec(clean)
  if (!matched) return 'png'
  return matched[1]!.toLowerCase().replace('jpeg', 'jpg')
}

/**
 * 预览层 `<img src>` 只能用已经能直接显示的地址。
 * 素材库路径 `/media/{id}` 在解析完成前不能交给浏览器，否则会 404 成裂图。
 */
export function lightboxImageSrc(state: { status: string; url: string }): string {
  if (state.status !== 'ready' && state.status !== 'direct') return ''
  return state.url || ''
}

/** 下载名：题注或替代文字，去掉路径字符，补上扩展名。 */
export function imageDownloadName(
  item: Pick<RtePreviewImage, 'alt' | 'caption' | 'src'>,
  index: number,
): string {
  const raw = (item.caption || item.alt || `image-${index + 1}`).trim() || `image-${index + 1}`
  const safe = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  const base = safe || `image-${index + 1}`
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(base)) return base
  return `${base}.${imageFileExt(item.src)}`
}
