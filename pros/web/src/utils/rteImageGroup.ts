/** 飞书桌面/网页：同一行最多 10 张图。 */
export const MAX_IMAGES_PER_ROW = 10
export const IMAGE_ROW_LIMIT_TIP = '一行最多 10 张图片'

export function rowCanAccept(current: number, incoming = 1): boolean {
  const count = Number.isFinite(current) ? current : 0
  const add = Number.isFinite(incoming) ? incoming : 0
  return count >= 0 && add > 0 && count + add <= MAX_IMAGES_PER_ROW
}

export type ImageSpot = { pos: number; row: number }

/** 方向键只移动选区：左右沿文档顺序，上下跳到相邻一行的首图。 */
export function nextImageSelection(
  spots: readonly ImageSpot[],
  currentPos: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
): number | null {
  if (!spots.length) return null
  const index = spots.findIndex((spot) => spot.pos === currentPos)
  const start = index >= 0 ? index : 0
  if (key === 'ArrowLeft') return start > 0 ? spots[start - 1]!.pos : null
  if (key === 'ArrowRight') return start < spots.length - 1 ? spots[start + 1]!.pos : null
  const row = spots[start]!.row
  if (key === 'ArrowDown') return spots.find((spot, i) => i > start && spot.row !== row)?.pos ?? null
  let prevRow: number | null = null
  for (let i = start - 1; i >= 0; i -= 1) {
    if (spots[i]!.row !== row) {
      prevRow = spots[i]!.row
      break
    }
  }
  if (prevRow == null) return null
  return spots.find((spot) => spot.row === prevRow)?.pos ?? null
}

/** 注入到 document.head。不能写在无 scoped 的 :deep 规则里，浏览器会整段丢掉。 */
export const imageGroupLayoutCss = [
  '.rte-root [data-resize-container][data-node="image"]{position:relative;width:fit-content;max-width:100%;}',
  '[data-resize-container][data-node="image"],[data-resize-container][data-node="image"] img{-webkit-user-drag:none;}',
  '.rte-root [data-resize-container][data-node="image"].ProseMirror-selectednode{outline:2px solid #3370ff;outline-offset:2px;border-radius:4px;}',
  '.rte-image-group{position:relative;width:100%;max-width:100%;margin:8px 0;box-sizing:border-box;}',
  '.rte-image-group-row{display:flex;flex-direction:row;align-items:stretch;gap:8px;width:100%;max-width:100%;height:auto;min-height:0;box-sizing:border-box;overflow:hidden;}',
  '.rte-image-group-row>*{min-width:0;height:100%;max-width:100%;float:none !important;margin:0 !important;}',
  '.rte-image-group-row>[data-resize-container][data-node="image"]{display:flex !important;width:auto !important;height:100% !important;max-width:100%;max-height:100%;margin:0 !important;overflow:hidden;border-radius:4px;}',
  '.rte-image-group-row [data-resize-wrapper]{width:100% !important;height:100% !important;max-width:100% !important;}',
  '.rte-image-group-row>*:nth-child(1){flex:var(--g0,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(2){flex:var(--g1,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(3){flex:var(--g2,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(4){flex:var(--g3,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(5){flex:var(--g4,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(6){flex:var(--g5,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(7){flex:var(--g6,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(8){flex:var(--g7,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(9){flex:var(--g8,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(10){flex:var(--g9,1) 1 0 !important;}',
  '.rte-image-group-row img{width:100% !important;height:100% !important;object-fit:contain !important;max-width:none !important;display:block;}',
  '.rte-root.rte-printing .rte-image-group-row{height:auto !important;aspect-ratio:var(--rte-row-aspect, auto);}',
  '.rte-image-drag-source{opacity:.35;}',
  '.rte-image-drag-thumb{position:fixed;z-index:10061;width:72px;height:48px;border-radius:4px;background:#fff center/cover no-repeat;box-shadow:0 8px 24px rgba(29,33,41,.28);pointer-events:none;}',
  'body:has(.rte-image-drag-thumb) .rte-image-group-bar,body:has(.rte-image-drag-thumb) .rte-bubble{display:none !important;}',
  '.rte-image-drag-handle{position:absolute;z-index:8;left:4px;top:8px;width:22px;height:26px;padding:0;border:1px solid #d6e4ff;border-radius:6px;background:#fff;color:#3370ff;font-size:14px;line-height:24px;text-align:center;cursor:grab;opacity:0;pointer-events:auto;box-shadow:0 1px 4px rgba(29,33,41,.12);}',
  '[data-resize-container][data-node="image"]:hover>.rte-image-drag-handle,[data-resize-container][data-node="image"].ProseMirror-selectednode>.rte-image-drag-handle,.rte-image-drag-handle.is-dragging{opacity:1;}',
  '.rte-image-group-bar{position:absolute;left:36px;top:8px;z-index:7;display:none;align-items:center;gap:2px;padding:4px;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(29,33,41,.12),0 0 0 1px rgba(29,33,41,.06);}',
  '.rte-image-group:hover>.rte-image-group-bar,.rte-image-group.is-selected>.rte-image-group-bar{display:flex;}',
  '.rte-image-group-bar button{appearance:none;border:0;background:transparent;color:#1d2129;width:28px;height:28px;padding:0;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}',
  '.rte-image-group-bar button:hover,.rte-image-group-bar button.is-active{background:#e8f3ff;color:#3370ff;}',
  '.rte-image-group-bar svg{width:16px;height:16px;display:block;}',
  '.rte-image-group-dividers{position:absolute;inset:0;pointer-events:none;z-index:30;}',
  '.rte-image-group-divider{position:absolute;width:16px;transform:translateX(-50%);border:0;padding:0;background:transparent;cursor:col-resize;pointer-events:auto;}',
  '.rte-image-group-divider i{position:absolute;left:6px;top:8px;bottom:8px;width:3px;border-radius:2px;background:#3370ff;opacity:0;pointer-events:none;}',
  '.rte-image-group:hover .rte-image-group-divider i,.rte-image-group-divider:hover i,.rte-image-group-divider.is-active i{opacity:1;}',
  '.rte-root.mode-preview .rte-image-group-bar,.rte-root.mode-preview .rte-image-group-dividers,.rte-root.mode-preview .rte-image-drag-handle,.rte-root.mode-source .rte-image-group-bar,.rte-root.mode-source .rte-image-group-dividers,.rte-root.mode-source .rte-image-drag-handle,.rte-root.rte-printing .rte-image-group-bar,.rte-root.rte-printing .rte-image-group-dividers,.rte-root.rte-printing .rte-image-drag-handle{display:none !important;}',
].join('')

export function installImageGroupLayout(): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById('rte-image-group-layout')
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style')
    style.id = 'rte-image-group-layout'
    document.head.appendChild(style)
  }
  if (style.textContent !== imageGroupLayoutCss) style.textContent = imageGroupLayoutCss
}
export function groupCssVars(count: number, raw: unknown): string {
  return normalizeGroupRatios(count, raw)
    .map((grow, index) => `--g${index}:${grow}`)
    .join(';')
}

export function groupUsesAspect(ratioMode: unknown): boolean {
  return ratioMode !== 'custom'
}

/** 按权重把一行铺满。权重是宽高比时，行高 = 可用宽度 / 权重和，不按视口或固定上限裁切。 */
export function rowLayout(rowWidth: number, weights: readonly number[], gap = 8): { height: number; widths: number[] } {
  const clean = weights.map((n) => (Number.isFinite(n) && n > 0 ? n : 1))
  const sum = clean.reduce((total, n) => total + n, 0) || 1
  const inner = Math.max(1, rowWidth - gap * Math.max(0, clean.length - 1))
  const height = inner / sum
  const widths = clean.map((n) => (inner * n) / sum)
  const rounded = widths.map((n) => Math.round(n))
  const drift = Math.round(inner) - rounded.reduce((total, n) => total + n, 0)
  if (rounded.length) rounded[rounded.length - 1] = (rounded[rounded.length - 1] ?? 0) + drift
  return { height: Math.max(1, Math.round(height)), widths: rounded }
}

export type MiniNode = {
  type: string
  attrs?: Record<string, unknown>
  text?: string
  content?: MiniNode[]
}

export function ratiosToAttr(ratios: readonly number[]): string {
  return ratios.map((n) => String(Math.round(n * 100) / 100)).join(':')
}

function parseRatios(raw: unknown): number[] | null {
  if (typeof raw === 'string' && raw.trim()) {
    const parts = raw.split(':').map((part) => Number(part.trim()))
    if (parts.length && parts.every((n) => Number.isFinite(n) && n > 0)) return parts
    return null
  }
  if (Array.isArray(raw) && raw.length && raw.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
    return raw
  }
  return null
}

export function normalizeGroupRatios(count: number, raw: unknown): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (!n) return []
  const parsed = parseRatios(raw)
  if (parsed && parsed.length === n) return parsed.map((n) => Math.round(n * 100) / 100)
  return Array.from({ length: n }, () => 1)
}

export function ratioPercents(ratios: readonly number[]): number[] {
  const total = ratios.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
  if (!(total > 0)) return ratios.map(() => 0)
  return ratios.map((n) => Math.round((n / total) * 100))
}

export function removeRatio(ratios: readonly number[], index: number): number[] {
  if (index < 0 || index >= ratios.length) return ratios.slice()
  return ratios.filter((_, i) => i !== index)
}

export function insertRatio(ratios: readonly number[], index: number): number[] {
  const next = ratios.slice()
  const at = Math.max(0, Math.min(Math.floor(index), next.length))
  next.splice(at, 0, 1)
  return next
}

/** 拖分隔条时，左右两格的和不变，leftShare 是这一对里左侧所占比例。 */
export function resizePair(ratios: readonly number[], index: number, leftShare: number): number[] {
  if (index < 0 || index >= ratios.length - 1) return ratios.slice()
  const total = ratios[index]! + ratios[index + 1]!
  if (!(total > 0)) return ratios.slice()
  const share = Number.isFinite(leftShare) ? Math.min(0.88, Math.max(0.12, leftShare)) : 0.5
  const left = Math.round(total * share * 100) / 100
  const right = Math.round((total - left) * 100) / 100
  const next = ratios.slice()
  next[index] = left
  next[index + 1] = right
  return next
}

export function shouldDissolveGroup(childCount: number): boolean {
  return childCount <= 1
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return null
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** 先拔出 from，再插到目标图的左侧或右侧。 */
export function groupInsertIndex(from: number, target: number, side: 'left' | 'right'): number {
  const targetAfter = from < target ? target - 1 : target
  return side === 'left' ? targetAfter : targetAfter + 1
}

function isEmptyParagraph(node: MiniNode): boolean {
  if (node.type !== 'paragraph') return false
  const content = node.content || []
  if (!content.length) return true
  return content.every((child) => child.type === 'text' && !(child.text || '').trim())
}

export function imageOnlyColumn(column: MiniNode): MiniNode | null {
  if (column.type !== 'column') return null
  const images = (column.content || []).filter((child) => child.type === 'image')
  const rest = (column.content || []).filter((child) => child.type !== 'image' && !isEmptyParagraph(child))
  if (images.length === 1 && rest.length === 0) return images[0]!
  return null
}

/** 每一栏恰好一张图（空段落可忽略）时，迁成图片组。有文字的分栏保持原样。 */
export function imagesFromColumns(node: MiniNode): { images: MiniNode[]; ratios: number[] } | null {
  if (node.type !== 'columns') return null
  const columns = node.content || []
  if (columns.length < 2) return null
  const images: MiniNode[] = []
  for (const column of columns) {
    const image = imageOnlyColumn(column)
    if (!image) return null
    images.push(image)
  }
  return { images, ratios: normalizeGroupRatios(images.length, node.attrs?.ratios) }
}
