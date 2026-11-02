/** 评论线程。只存在画布 JSON 的 commentThreadsByPanelId，不另建表。 */

export type CommentAuthor = {
  id: string
  name: string
}

export type CommentMessage = {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: number
}

export type CommentThread = {
  id: string
  quote: string
  resolved: boolean
  createdAt: number
  resolvedAt?: number
  messages: CommentMessage[]
}

export type CommentThreadsByPanelId = Record<string, CommentThread[]>

const AUTHOR_COLORS = ['#165dff', '#d46b08', '#389e0d', '#722ed1', '#cf1322', '#0e8a7d', '#c41d7f']

export function createCommentId(prefix = 'c'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function authorColor(authorId: string): string {
  let hash = 0
  const key = authorId || 'local'
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return AUTHOR_COLORS[hash % AUTHOR_COLORS.length]!
}

export function formatThreadTime(ts: number): string {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function asMessage(raw: unknown): CommentMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const body = String(row.body ?? '').trim()
  const id = String(row.id ?? '').trim()
  if (!id || !body) return null
  const createdAt = Number(row.createdAt)
  return {
    id,
    authorId: String(row.authorId ?? ''),
    authorName: String(row.authorName ?? '').trim() || '我',
    body: body.slice(0, 2000),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  }
}

export function normalizeCommentThreads(raw: unknown): CommentThread[] {
  if (!Array.isArray(raw)) return []
  const out: CommentThread[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    if (!id) continue
    const messages = Array.isArray(row.messages)
      ? row.messages.map(asMessage).filter((msg): msg is CommentMessage => !!msg)
      : []
    if (!messages.length) continue
    const createdAt = Number(row.createdAt)
    const resolvedAt = Number(row.resolvedAt)
    out.push({
      id,
      quote: String(row.quote ?? '').slice(0, 500),
      resolved: row.resolved === true,
      createdAt: Number.isFinite(createdAt) ? createdAt : messages[0]!.createdAt,
      ...(Number.isFinite(resolvedAt) ? { resolvedAt } : {}),
      messages,
    })
  }
  return out
}

export function readCommentThreads(
  map: CommentThreadsByPanelId | null | undefined,
  panelId: string,
): CommentThread[] {
  if (!map || !panelId) return []
  return normalizeCommentThreads(map[panelId])
}

export function writeCommentThreads(
  map: CommentThreadsByPanelId | null | undefined,
  panelId: string,
  threads: CommentThread[],
): CommentThreadsByPanelId | undefined {
  const next: CommentThreadsByPanelId = { ...(map || {}) }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizeCommentThreads(threads)
  if (!normalized.length) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}

export function visibleThreads(threads: CommentThread[], showResolved: boolean): CommentThread[] {
  const list = showResolved ? threads : threads.filter((thread) => !thread.resolved)
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
}

export function createCommentThread(input: {
  id?: string
  quote: string
  author: CommentAuthor
  body: string
  now?: number
}): CommentThread | null {
  const body = input.body.trim()
  if (!body) return null
  const now = input.now ?? Date.now()
  return {
    id: input.id || createCommentId('t'),
    quote: input.quote.trim().slice(0, 500),
    resolved: false,
    createdAt: now,
    messages: [
      {
        id: createCommentId('m'),
        authorId: input.author.id,
        authorName: input.author.name || '我',
        body: body.slice(0, 2000),
        createdAt: now,
      },
    ],
  }
}

export function replyToThread(
  threads: CommentThread[],
  threadId: string,
  author: CommentAuthor,
  body: string,
  now = Date.now(),
): CommentThread[] | null {
  const text = body.trim()
  if (!text) return null
  let changed = false
  const next = threads.map((thread) => {
    if (thread.id !== threadId) return thread
    changed = true
    return {
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: createCommentId('m'),
          authorId: author.id,
          authorName: author.name || '我',
          body: text.slice(0, 2000),
          createdAt: now,
        },
      ],
    }
  })
  return changed ? next : null
}

export function setThreadResolved(
  threads: CommentThread[],
  threadId: string,
  resolved: boolean,
  now = Date.now(),
): CommentThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId || thread.resolved === resolved) return thread
    if (resolved) return { ...thread, resolved: true, resolvedAt: now }
    const { resolvedAt: _drop, ...rest } = thread
    return { ...rest, resolved: false }
  })
}

/** 删自己的一条。删空后整条线程移除，调用方再卸掉正文锚点。 */
export function deleteOwnMessage(
  threads: CommentThread[],
  threadId: string,
  messageId: string,
  authorId: string,
): { threads: CommentThread[]; removedThread: boolean } | null {
  const thread = threads.find((item) => item.id === threadId)
  if (!thread) return null
  const message = thread.messages.find((item) => item.id === messageId)
  if (!message || message.authorId !== authorId) return null
  const messages = thread.messages.filter((item) => item.id !== messageId)
  if (!messages.length) {
    return { threads: threads.filter((item) => item.id !== threadId), removedThread: true }
  }
  return {
    threads: threads.map((item) => (item.id === threadId ? { ...item, messages } : item)),
    removedThread: false,
  }
}
