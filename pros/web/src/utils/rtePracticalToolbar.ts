/** 飞书「缩进和对齐 / 有序列表 / 插入按钮」里日常用得上的纯逻辑。 */

export const FIRST_LINE_INDENT = '2em'

export const LINK_BUTTON_TONES = [
  { id: 'blue', label: '蓝色' },
  { id: 'green', label: '绿色' },
  { id: 'orange', label: '橙色' },
  { id: 'red', label: '红色' },
  { id: 'gray', label: '灰色' },
] as const

export type LinkButtonTone = (typeof LINK_BUTTON_TONES)[number]['id']

export function isLinkButtonTone(value: unknown): value is LinkButtonTone {
  return LINK_BUTTON_TONES.some((tone) => tone.id === value)
}

/** 只接受 http(s)。没有协议时补 https。 */
export function safeLinkButtonHref(raw: string): string | null {
  const h = raw.trim()
  if (!h || /\s/.test(h)) return null
  try {
    const u = new URL(h.includes('://') ? h : `https://${h}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export function continuedListStart(start: number, itemCount: number): number {
  const s = Number.isFinite(start) && start > 0 ? Math.floor(start) : 1
  const n = Number.isFinite(itemCount) && itemCount > 0 ? Math.floor(itemCount) : 0
  return s + n
}

export type ListSibling =
  | { type: 'orderedList'; start: number; items: number }
  | { type: 'gap' }
  | { type: 'other' }

/** 同一父级里往前找有序列表。空段不打断；中间隔着正文也可以续号。找不到则返回 null。 */
export function previousOrderedContinuation(siblingsBefore: readonly ListSibling[]): number | null {
  for (let i = siblingsBefore.length - 1; i >= 0; i -= 1) {
    const sibling = siblingsBefore[i]
    if (!sibling || sibling.type === 'gap' || sibling.type === 'other') continue
    return continuedListStart(sibling.start, sibling.items)
  }
  return null
}
