import type { Node as PMNode } from '@tiptap/pm/model'

/** 标题锚点。id 一旦写上就保持不变，改标题文字不会把已复制的链接弄断。 */

export function isStableHeadingId(id: string): boolean {
  return /^[A-Za-z][\w-]{0,63}$/.test(id)
}

export function headingAnchorHref(id: string): string {
  return `#${id}`
}

function headingIdFromHash(hash: string): string | null {
  if (!hash.startsWith('#') || hash.startsWith('##')) return null
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    return null
  }
  return isStableHeadingId(id) ? id : null
}

/**
 * 读文内标题链接。`#id` 直接认。
 * 浏览器粘贴时常把 `#id` 写成当前页的绝对地址，同一篇文档（路径和查询都相同）也认。
 */
export function parseHeadingAnchorHref(href: string, here?: string): string | null {
  const raw = href.trim()
  if (!raw) return null
  if (raw.startsWith('#')) return headingIdFromHash(raw)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const id = headingIdFromHash(url.hash)
  if (!id || !here) return null
  let current: URL
  try {
    current = new URL(here)
  } catch {
    return null
  }
  if (url.origin !== current.origin || url.pathname !== current.pathname || url.search !== current.search) {
    return null
  }
  return id
}

export function nextHeadingAnchorId(used: ReadonlySet<string>, salt: string): string {
  let hash = 2166136261
  for (let i = 0; i < salt.length; i += 1) {
    hash ^= salt.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  for (let i = 0; i < 6; i += 1) {
    const id = `h-${(hash >>> 0).toString(36)}`
    if (!used.has(id)) return id
    hash = (Math.imul(hash, 33) + i + 1) >>> 0
  }
  return `h-${(hash >>> 0).toString(36)}${used.size.toString(36)}`
}

export function usedHeadingIds(doc: PMNode): Set<string> {
  const used = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return
    const id = String(node.attrs.id || '')
    if (isStableHeadingId(id)) used.add(id)
  })
  return used
}

/** 没有稳定 id，或和前面标题撞了同一个 id，都要补一个新的。先出现的标题保留原 id。 */
export function missingHeadingAnchors(doc: PMNode): Array<{ pos: number; id: string }> {
  const used = new Set<string>()
  const missing: Array<{ pos: number; id: string }> = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const current = String(node.attrs.id || '')
    if (isStableHeadingId(current) && !used.has(current)) {
      used.add(current)
      return
    }
    const id = nextHeadingAnchorId(used, `${pos}\0${node.textContent}`)
    used.add(id)
    missing.push({ pos, id })
  })
  return missing
}

export function findHeadingAnchor(doc: PMNode, id: string): number | null {
  if (!isStableHeadingId(id)) return null
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found != null) return false
    if (node.type.name === 'heading' && node.attrs.id === id) {
      found = pos
      return false
    }
    return undefined
  })
  return found
}
