/** 图片组：同一行等高并排，比例写在 data-ratios。旧文档的纯图片分栏可以迁过来。 */

/** 注入到 document.head。不能写在无 scoped 的 :deep 规则里，浏览器会整段丢掉。 */
export const imageGroupLayoutCss = [
  '.rte-root [data-resize-container][data-node="image"]{width:fit-content;max-width:100%;}',
  '.rte-root [data-resize-container][data-node="image"].ProseMirror-selectednode{outline:2px solid #3370ff;outline-offset:2px;border-radius:4px;}',
  '.rte-image-group{position:relative;max-width:100%;margin:8px 0;}',
  '.rte-image-group-row{display:flex;flex-direction:row;align-items:stretch;gap:8px;width:100%;max-width:100%;box-sizing:border-box;}',
  '.rte-image-group-row>*{min-width:48px;height:100%;max-width:100%;float:none !important;margin:0 !important;}',
  '.rte-image-group-row>[data-resize-container][data-node="image"]{display:flex !important;width:auto !important;height:100% !important;max-width:100%;overflow:hidden;border-radius:4px;}',
  '.rte-image-group-row [data-resize-wrapper]{width:100% !important;height:100% !important;max-width:100% !important;}',
  '.rte-image-group-row>*:nth-child(1){flex:var(--g0,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(2){flex:var(--g1,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(3){flex:var(--g2,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(4){flex:var(--g3,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(5){flex:var(--g4,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(6){flex:var(--g5,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(7){flex:var(--g6,1) 1 0 !important;}',
  '.rte-image-group-row>*:nth-child(8){flex:var(--g7,1) 1 0 !important;}',
  '.rte-image-group-row img{width:100% !important;height:100% !important;object-fit:cover !important;max-width:none !important;display:block;}',
  '.rte-image-group-row [data-resize-handle]{display:none !important;}',
  '.rte-image-drag-handle{position:absolute;z-index:8;left:4px;top:8px;width:22px;height:26px;padding:0;border:1px solid #d6e4ff;border-radius:6px;background:#fff;color:#3370ff;font-size:14px;line-height:24px;text-align:center;cursor:grab;opacity:0;box-shadow:0 1px 4px rgba(29,33,41,.12);}',
  '[data-resize-container][data-node="image"]:hover>.rte-image-drag-handle,[data-resize-container][data-node="image"].ProseMirror-selectednode>.rte-image-drag-handle,.rte-image-drag-handle.is-dragging{opacity:1;}',
  '.rte-image-group-bar{position:absolute;left:36px;top:8px;z-index:7;display:none;align-items:center;gap:2px;padding:4px;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(29,33,41,.12),0 0 0 1px rgba(29,33,41,.06);}',
  '.rte-image-group:hover>.rte-image-group-bar,.rte-image-group.is-selected>.rte-image-group-bar{display:flex;}',
  '.rte-image-group-bar button{appearance:none;border:0;background:transparent;color:#1d2129;width:28px;height:28px;padding:0;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}',
  '.rte-image-group-bar button:hover,.rte-image-group-bar button.is-active{background:#e8f3ff;color:#3370ff;}',
  '.rte-image-group-bar svg{width:16px;height:16px;display:block;}',
  '.rte-image-group-dividers{position:absolute;inset:0;pointer-events:none;z-index:4;}',
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

/** 按权重把一行铺满。权重是宽高比时，各图等高且格子本身就是这个比例。 */
export function rowLayout(rowWidth: number, weights: readonly number[], gap = 8): { height: number; widths: number[] } {
  const clean = weights.map((n) => (Number.isFinite(n) && n > 0 ? n : 1))
  const sum = clean.reduce((total, n) => total + n, 0) || 1
  const inner = Math.max(48, rowWidth - gap * Math.max(0, clean.length - 1))
  const height = Math.max(72, Math.min(480, inner / sum))
  const widths = clean.map((n) => Math.round((inner * n) / sum))
  return { height: Math.round(height), widths }
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
