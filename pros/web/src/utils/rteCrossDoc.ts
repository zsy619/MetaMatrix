/**
 * 跨文档：同步块与搜索跳转。
 *
 * 同步块是一段引用其它文档内容的块。正文里存 data 属性，来源信息从属性读回。
 */

/** 同步块引用的来源。 */
export type SyncBlockSource = {
  /** 来源文档 id */
  documentId: string
  /** 来源文档标题（快照，便于离线展示） */
  documentTitle?: string
  /** 来源面板 id；为空表示整篇 */
  panelId?: string
  /** 来源块 id（锚点） */
  blockId?: string
  /** 同步时间戳 */
  syncedAt?: string
}

/** 同步块的本地快照。 */
export type SyncBlockSnapshot = {
  /** 快照正文（纯文本） */
  text: string
  /** 快照来源块标题，可空 */
  title?: string
  /** 快照时间 */
  syncedAt: string
}

/** 从 JSON 字符串或对象里解析同步块来源。缺 documentId 或格式不对时返回 null。 */
export function parseSyncBlockSource(raw: unknown): SyncBlockSource | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    try {
      data = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const documentId = typeof obj.documentId === 'string' ? obj.documentId.trim() : ''
  if (!documentId) return null
  const source: SyncBlockSource = { documentId }
  const title = typeof obj.documentTitle === 'string' ? obj.documentTitle.trim() : ''
  if (title) source.documentTitle = title
  const panelId = typeof obj.panelId === 'string' ? obj.panelId.trim() : ''
  if (panelId) source.panelId = panelId
  const blockId = typeof obj.blockId === 'string' ? obj.blockId.trim() : ''
  if (blockId) source.blockId = blockId
  const syncedAt = typeof obj.syncedAt === 'string' ? obj.syncedAt.trim() : ''
  if (syncedAt) source.syncedAt = syncedAt
  return source
}

/** 生成同步块在正文里的 data 属性。空值不写。 */
export function syncBlockAttrs(source: SyncBlockSource): Record<string, string> {
  const attrs: Record<string, string> = { 'data-sync-document': source.documentId }
  if (source.panelId) attrs['data-sync-panel'] = source.panelId
  if (source.blockId) attrs['data-sync-block'] = source.blockId
  if (source.documentTitle) attrs['data-sync-title'] = source.documentTitle
  if (source.syncedAt) attrs['data-sync-at'] = source.syncedAt
  return attrs
}

/** 从纯文本里截出用于预览的摘要。 */
export function syncBlockSummary(text: string, maxLen = 60): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  const limit = Math.max(1, maxLen)
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit)}…`
}

/** 跨文档搜索命中的跳转目标。 */
export type CrossDocHit = {
  documentId: string
  title: string
  panelId?: string
  panelTitle?: string
  snippet?: string
}

/** 整理搜索命中：去重（按 documentId + panelId）并截断。 */
export function normalizeCrossDocHits(
  hits: readonly CrossDocHit[],
  limit = 20,
): CrossDocHit[] {
  const seen = new Set<string>()
  const out: CrossDocHit[] = []
  for (const hit of hits || []) {
    if (!hit || !hit.documentId) continue
    const key = `${hit.documentId}::${hit.panelId || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...hit })
    if (out.length >= Math.max(1, limit)) break
  }
  return out
}

/** 生成站内跳转链接。前端路由是 hash 模式。 */
export function crossDocJumpHref(hit: CrossDocHit): string {
  const id = encodeURIComponent(hit.documentId)
  if (hit.panelId) {
    return `#/canvas/${id}?panel=${encodeURIComponent(hit.panelId)}`
  }
  return `#/canvas/${id}`
}
