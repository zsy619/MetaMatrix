/** 图片组：同一行等高并排，比例写在 data-ratios。旧文档的纯图片分栏可以迁过来。 */

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
