/**
 * 媒体占位图。
 *
 * 背景：正文里的图片在"上传中 / 取字节中 / 素材已失效"这几个瞬间，
 * 浏览器会画出它自带的裂图图标 + alt 文本（文件名），又丑又占版面。
 * 这里给这些瞬间换上一张自绘的占位图：按文件类型配色、画一个立体文件卡，
 * 下面写文件名与状态，看起来就是"这是一张图，正在加载"。
 *
 * 为什么用 data URI 的 SVG 而不是 DOM 节点：
 * - 图片节点视图会反复重建 <img>，DOM 节点容易被冲掉；
 * - data URI 直接替换 src，浏览器自己负责渲染与缩放，不用管样式。
 *
 * 约定：原始地址存在 data-media-src（素材库内部路径已经在用这个字段），
 * 字节回来后由 mediaHydrateState.applyMediaBlobToElement 覆盖回去，
 * 所以占位图不会影响正常的取图流程。
 */

export type MediaPlaceholderKind =
  | 'image'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'video'
  | 'audio'
  | 'archive'
  | 'file'

export type MediaPlaceholderStatus = 'loading' | 'missing' | 'error'

interface Palette {
  main: string
  soft: string
  label: string
}

const PALETTE: Record<MediaPlaceholderKind, Palette> = {
  image: { main: '#5b8cff', soft: '#e8f0ff', label: '图片' },
  pdf: { main: '#e5534b', soft: '#ffeceb', label: 'PDF' },
  doc: { main: '#2f80ed', soft: '#e8f2ff', label: '文档' },
  sheet: { main: '#21a366', soft: '#e6f6ee', label: '表格' },
  video: { main: '#9b51e0', soft: '#f3ecff', label: '视频' },
  audio: { main: '#f2994a', soft: '#fff2e6', label: '音频' },
  archive: { main: '#7b8794', soft: '#eef1f5', label: '压缩包' },
  file: { main: '#64748b', soft: '#eef1f5', label: '文件' },
}

const STATUS_TEXT: Record<MediaPlaceholderStatus, string> = {
  loading: '正在加载…',
  missing: '素材已失效',
  error: '加载失败',
}

/** 按文件名与 MIME 判断占位图类型。 */
export function placeholderKind(name: string, mime = ''): MediaPlaceholderKind {
  const n = (name || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (
    m.includes('spreadsheet') ||
    m === 'text/csv' ||
    /\.(xlsx|xls|csv|numbers)$/.test(n)
  )
    return 'sheet'
  if (
    m.includes('wordprocessing') ||
    m === 'application/msword' ||
    /\.(docx?|md|markdown|txt|rtf)$/.test(n)
  )
    return 'doc'
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'archive'
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/.test(n)) return 'image'
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(n)) return 'video'
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return 'audio'
  return 'file'
}

/** 文件名截断（中文按字计）。 */
export function truncateFileName(name: string, max = 22): string {
  const raw = (name || '').trim() || '未命名文件'
  if (raw.length <= max) return raw
  return `${raw.slice(0, max - 1)}…`
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 类型图标（画在文件卡内部，24×24 视窗）。 */
function kindIcon(kind: MediaPlaceholderKind, main: string): string {
  switch (kind) {
    case 'image':
      return `<rect x="1.5" y="3" width="21" height="18" rx="3" fill="none" stroke="${main}" stroke-width="1.8"/>
        <circle cx="8" cy="9" r="2" fill="${main}"/>
        <path d="M3 18l6-6 4 4 3-3 5 5" fill="none" stroke="${main}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'video':
      return `<rect x="1.5" y="4" width="21" height="16" rx="3" fill="none" stroke="${main}" stroke-width="1.8"/>
        <path d="M10 9.5l6 2.5-6 2.5z" fill="${main}"/>`
    case 'audio':
      return `<path d="M9 17V6l10-2v11" fill="none" stroke="${main}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="7" cy="17" r="2.6" fill="${main}"/><circle cx="17" cy="15" r="2.6" fill="${main}"/>`
    case 'sheet':
      return `<rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill="none" stroke="${main}" stroke-width="1.8"/>
        <path d="M2.5 9h19M9 9v12.5" stroke="${main}" stroke-width="1.8"/>`
    case 'archive':
      return `<rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="none" stroke="${main}" stroke-width="1.8"/>
        <path d="M2.5 9.5h19M10 9.5v10.5" stroke="${main}" stroke-width="1.8"/>`
    case 'pdf':
    case 'doc':
    case 'file':
    default:
      return `<path d="M5 2.5h8l6 6v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 21.5v-17A1.5 1.5 0 0 1 6.5 3z" fill="none" stroke="${main}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M13 2.5v6h6" fill="none" stroke="${main}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M8.5 13h7M8.5 16.5h7M8.5 9.5h3" stroke="${main}" stroke-width="1.6" stroke-linecap="round"/>`
  }
}

/** 生成占位图 SVG。 */
export function buildPlaceholderSvg(options: {
  name?: string
  kind?: MediaPlaceholderKind
  status?: MediaPlaceholderStatus
  width?: number
  height?: number
}): string {
  const name = options.name || '未命名文件'
  const kind = options.kind || 'file'
  const status = options.status || 'error'
  const w = options.width || 320
  const h = options.height || 180
  const tone = PALETTE[kind] || PALETTE.file
  const label = STATUS_TEXT[status] || STATUS_TEXT.error
  const shimmer =
    status === 'loading'
      ? `<rect x="0" y="${h - 6}" width="120" height="6" fill="${tone.main}" opacity="0.85">
           <animate attributeName="x" values="-120;${w}" dur="1.6s" repeatCount="indefinite"/>
         </rect>`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="mmbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f8fc"/><stop offset="1" stop-color="#e7ecf5"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#mmbg)"/>
  <g transform="translate(${w / 2 - 40} ${h / 2 - 66})">
    <path d="M6 0h40l26 26v78a8 8 0 0 1-8 8H6a8 8 0 0 1-8-8V8A8 8 0 0 1 6 0z" fill="#ffffff" stroke="${tone.main}" stroke-width="2.4"/>
    <path d="M46 0l26 26H54a8 8 0 0 1-8-8z" fill="${tone.soft}" stroke="${tone.main}" stroke-width="2.4" stroke-linejoin="round"/>
    <g transform="translate(16 44) scale(1.9)">${kindIcon(kind, tone.main)}</g>
  </g>
  <text x="${w / 2}" y="${h - 30}" text-anchor="middle" font-size="15" fill="#3d4757"
    font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">${escapeXml(
      truncateFileName(name),
    )}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="12" fill="${tone.main}"
    font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">${escapeXml(
      `${tone.label} · ${label}`,
    )}</text>
  ${shimmer}
</svg>`
}

/** 生成可直接放进 <img src> 的 data URI。 */
export function placeholderDataUrl(options: {
  name?: string
  kind?: MediaPlaceholderKind
  status?: MediaPlaceholderStatus
}): string {
  const svg = buildPlaceholderSvg(options)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 给 <img> 换上占位图；原始地址保留在 data-media-src 上，取到字节后会被覆盖回来。 */
export function applyMediaPlaceholder(
  el: HTMLImageElement | null | undefined,
  options: { name?: string; kind?: MediaPlaceholderKind; status?: MediaPlaceholderStatus },
): boolean {
  if (!el) return false
  const original = el.getAttribute('src') || ''
  if (!el.dataset.mediaOrigSrc) el.dataset.mediaOrigSrc = original
  el.dataset.mediaPlaceholder = '1'
  el.classList.add('is-media-placeholder')
  el.classList.remove('is-broken')
  el.setAttribute('src', placeholderDataUrl(options))
  return true
}

/** 撤掉占位图，恢复原始地址（重试时用）。 */
export function restoreMediaSrc(el: HTMLImageElement | null | undefined): boolean {
  if (!el) return false
  const original = el.dataset.mediaOrigSrc
  delete el.dataset.mediaPlaceholder
  el.classList.remove('is-media-placeholder')
  if (!original) return false
  el.setAttribute('src', original)
  return true
}
