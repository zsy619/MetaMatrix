import type { QuadrantItem } from '../types/canvas'

const BLOCK_SPLIT =
  /(?=<(?:p|h[1-6]|ul|ol|blockquote|pre|hr|table|div)(?:\s|>|\/))/i

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function itemTextToHtml(text: string | undefined | null): string {
  const raw = text ?? ''
  if (!raw.trim()) return '<p></p>'
  if (looksLikeHtml(raw)) return raw
  return `<p>${escapeHtml(raw)}</p>`
}

/** 将条目列表合成为一份编辑器 HTML */
export function itemsToHtml(items: QuadrantItem[] | undefined | null): string {
  if (!items || items.length === 0) return '<p></p>'
  return items.map((it) => itemTextToHtml(it.text)).join('')
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim()
}

/** 是否空文档（仅空段落） */
export function isEmptyHtml(html: string): boolean {
  const plain = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return plain.length === 0
}

/**
 * 把编辑器 HTML 拆成顶层块文本数组。
 * 优先按 p/h1-h6/ul/ol/blockquote/pre/hr/table/div 拆；
 * 拆不出则整份 HTML 作为单条。
 */
export function htmlToBlockTexts(html: string): string[] {
  const trimmed = (html ?? '').trim()
  if (!trimmed || isEmptyHtml(trimmed)) return []

  // TipTap 常见输出：多个顶层兄弟节点
  const parts = trimmed
    .split(BLOCK_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length <= 1) {
    // 可能整份包在单一根里，或只有一块
    if (parts.length === 1) {
      const only = parts[0]
      // 若是空 p，视为无条目
      if (isEmptyHtml(only)) return []
      return [only]
    }
    return [trimmed]
  }

  return parts.filter((p) => !isEmptyHtml(p) || /^<hr\b/i.test(p))
}

export function normalizeHtmlForCompare(html: string): string {
  return normalizeHtml(html || '')
}

export interface ItemsSyncOps {
  update: (id: string, text: string) => void
  add: (text: string) => { id: string } | null | undefined
  remove: (id: string) => void
}

/**
 * 把编辑器 HTML 写回 items：按索引对齐，多删少增，尽量保留原 id。
 */
export function syncItemsFromHtml(
  items: QuadrantItem[],
  html: string,
  ops: ItemsSyncOps,
): void {
  const texts = htmlToBlockTexts(html)
  const current = items.slice()

  const n = Math.min(current.length, texts.length)
  for (let i = 0; i < n; i++) {
    const next = texts[i]
    if (normalizeHtmlForCompare(itemTextToHtml(current[i].text)) !==
      normalizeHtmlForCompare(next)) {
      // 纯文本条目若内容相同也跳过
      if (
        !looksLikeHtml(current[i].text) &&
        !looksLikeHtml(next) &&
        current[i].text === next
      ) {
        continue
      }
      // 比较纯文本剥离后
      const strip = (s: string) =>
        s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      if (strip(current[i].text) === strip(next) && current[i].text === next) {
        continue
      }
      if (current[i].text === next) continue
      ops.update(current[i].id, next)
    }
  }

  for (let i = current.length; i < texts.length; i++) {
    ops.add(texts[i])
  }

  for (let i = current.length - 1; i >= texts.length; i--) {
    ops.remove(current[i].id)
  }
}
