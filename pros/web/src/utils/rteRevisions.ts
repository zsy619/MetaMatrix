/** 面板正文版本。只存在画布 JSON 的 editorRevisionsByPanelId，不另建表。 */

export const REVISION_LIMITS = {
  unnamed: 15,
  named: 8,
  htmlChars: 120_000,
  labelChars: 40,
} as const

export type PanelRevision = {
  id: string
  at: number
  html: string
  label?: string
}

export type RevisionsByPanelId = Record<string, PanelRevision[]>

export type RevisionRememberResult = {
  list: PanelRevision[]
  stored: boolean
  reason: 'stored' | 'labeled' | 'same' | 'too-large' | 'empty'
}

function createRevisionId(at: number): string {
  return `rev_${at.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function revisionHtmlIsEmpty(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, '')
  return !text
}

export function formatRevisionTime(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function cleanLabel(label: string | undefined): string | undefined {
  const text = label?.trim().slice(0, REVISION_LIMITS.labelChars)
  return text || undefined
}

function asRevision(raw: unknown): PanelRevision | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? '').trim()
  const html = typeof row.html === 'string' ? row.html : ''
  const at = Number(row.at)
  if (!id || !html || html.length > REVISION_LIMITS.htmlChars || revisionHtmlIsEmpty(html)) return null
  if (!Number.isFinite(at)) return null
  const label = cleanLabel(typeof row.label === 'string' ? row.label : undefined)
  return label ? { id, at, html, label } : { id, at, html }
}

/** 命名版本优先留下，自动记录只留最近若干次。 */
export function trimRevisions(list: readonly PanelRevision[]): PanelRevision[] {
  const named = list.filter((item) => item.label)
  const unnamed = list.filter((item) => !item.label)
  const keptNamed = named.slice(-REVISION_LIMITS.named)
  const keptUnnamed = unnamed.slice(-REVISION_LIMITS.unnamed)
  return [...keptNamed, ...keptUnnamed].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

export function normalizeRevisions(raw: unknown): PanelRevision[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PanelRevision[] = []
  for (const item of raw) {
    const revision = asRevision(item)
    if (!revision || seen.has(revision.id)) continue
    seen.add(revision.id)
    out.push(revision)
  }
  return trimRevisions(out)
}

export function rememberRevision(
  list: readonly PanelRevision[],
  html: string,
  at: number,
  options?: { label?: string; id?: string },
): RevisionRememberResult {
  const current = normalizeRevisions(list)
  if (revisionHtmlIsEmpty(html)) return { list: current, stored: false, reason: 'empty' }
  if (html.length > REVISION_LIMITS.htmlChars) return { list: current, stored: false, reason: 'too-large' }
  const label = cleanLabel(options?.label)
  const latest = current[current.length - 1]
  if (latest && latest.html === html) {
    if (!label || latest.label === label) return { list: current, stored: false, reason: 'same' }
    const next = current.map((item, index) =>
      index === current.length - 1 ? { ...item, label } : item,
    )
    return { list: trimRevisions(next), stored: true, reason: 'labeled' }
  }
  const revision: PanelRevision = {
    id: options?.id?.trim() || createRevisionId(at),
    at: Number.isFinite(at) ? at : Date.now(),
    html,
  }
  if (label) revision.label = label
  return { list: trimRevisions([...current, revision]), stored: true, reason: 'stored' }
}

export function writeRevisions(
  map: RevisionsByPanelId | undefined,
  panelId: string,
  revisions: readonly PanelRevision[],
): RevisionsByPanelId | undefined {
  const id = panelId.trim()
  if (!id) return map
  const next: RevisionsByPanelId = { ...(map ?? {}) }
  const list = normalizeRevisions(revisions)
  if (!list.length) delete next[id]
  else next[id] = list
  return Object.keys(next).length ? next : undefined
}
