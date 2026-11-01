/** 第六轮：批注列表、斜杠最近使用、嵌入白名单、本地快照节奏。 */

export type NoteRow = {
  from: number
  to: number
  text: string
  note: string
  type: string
}

export function pushRecentSlash(ids: string[], id: string, limit = 5): string[] {
  const next = [id, ...ids.filter((item) => item !== id)]
  return next.slice(0, Math.max(1, limit))
}

export function orderSlashForMenu<T extends { id: string }>(
  items: T[],
  query: string,
  recentIds: string[],
): Array<T & { sectionLabel?: string }> {
  if (query.trim()) return items.map((item) => ({ ...item, sectionLabel: undefined }))
  const recent: Array<T & { sectionLabel?: string }> = []
  for (const id of recentIds) {
    const hit = items.find((item) => item.id === id)
    if (hit) recent.push({ ...hit, sectionLabel: '最近使用' })
  }
  const seen = new Set(recent.map((item) => item.id))
  return [
    ...recent,
    ...items
      .filter((item) => !seen.has(item.id))
      .map((item) => ({ ...item, sectionLabel: undefined })),
  ]
}

const EMBED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'player.bilibili.com',
  'www.bilibili.com',
])

/** iframe 只允许名单内的 https 页面；其它地址请用链接卡片。 */
export function embedIframeSrc(href: string): string | null {
  const raw = href.trim()
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (url.protocol !== 'https:') return null
    if (!EMBED_HOSTS.has(url.hostname.toLowerCase())) return null
    return url.toString()
  } catch {
    return null
  }
}

export function shouldTakeSnapshot(
  previous: string,
  next: string,
  elapsedMs: number,
  minGapMs = 15000,
): boolean {
  if (!next || next === previous) return false
  if (elapsedMs >= minGapMs) return true
  return Math.abs(next.length - previous.length) >= 80
}
