import { apiRequest, apiRequestBlob, apiRequestResult } from './http'
import type { CanvasDocumentJSON } from '../types/canvas'
import type { NodeGraphDocumentJSON } from '../types/nodeGraph'

/** 画布文档内容：模板画布或节点画布。两者都是 JSONB，只是形状不同。 */
export type AnyCanvasDocumentJSON = CanvasDocumentJSON | NodeGraphDocumentJSON

export type DocumentSummary = {
  id: string
  title: string
  notes: string
  templateId: string | null
  canvasType: string
  /** 所属项目。null / 缺省表示不属于任何项目（历史画布）。 */
  projectId?: string | null
  schemaVersion: number
  /** 内容版本号，每次保存/存版/恢复递增；保存时作为乐观锁提交。 */
  saveVersion: number
  headRevisionId: string | null
  createdAt: string
  updatedAt: string
}

export type DocumentFull = DocumentSummary & {
  ownerUserId: string
  currentData: CanvasDocumentJSON
}

export type RevisionSummary = {
  id: string
  documentId: string
  parentId: string | null
  revisionType: string
  baseSnapshotId: string | null
  authorUserId: string | null
  label: string | null
  contentHash: string | null
  createdAt: string
}

export type SearchHit = {
  id: string
  title: string
  notes: string
  templateId: string | null
  canvasType: string
  createdAt: string
  updatedAt: string
  snippet: string
  rank?: number
  panelId?: string
  panelTitle?: string
}

export type TextDiffOp = { op: 'equal' | 'insert' | 'delete' | string; text: string }

export type DiffResult = {
  from: Record<string, unknown>
  to: Record<string, unknown>
  contentHashChanged: boolean
  textDiff: TextDiffOp[]
  unified?: string
  jsonPatch: Array<Record<string, unknown>>
}

export type AIContext = {
  documentId: string
  title: string
  notes: string
  templateId: string | null
  canvasType: string
  createdAt: string
  updatedAt: string
  summary: string
  panels: Array<{ panelId: string; title: string; text: string }>
  plainText: string
  attachmentsMeta: Array<{
    panelId: string
    name: string
    mime?: string
    urlOrKind: string
  }>
}

export type DocumentPage = {
  items: DocumentSummary[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/** keyset 新契约；旧 listDocuments/listDocumentsPage 的数组与 offset 响应不变。 */
export type DocumentCursorPage = {
  items: DocumentSummary[]
  total: number
  limit: number
  nextCursor?: string
  hasMore: boolean
}

export type RevisionPage = {
  items: RevisionSummary[]
  limit: number
  offset: number
  nextCursor?: string
  hasMore: boolean
}

function documentQuery(params?: {
  templateId?: string
  canvasType?: string
  /** 只列出某个项目下的画布。 */
  projectId?: string
  limit?: number
  offset?: number
  archived?: boolean
  cursor?: string
  keyset?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.templateId) q.set('templateId', params.templateId)
  if (params?.canvasType) q.set('canvasType', params.canvasType)
  if (params?.projectId) q.set('projectId', params.projectId)
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.offset != null) q.set('offset', String(params.offset))
  if (params?.archived) q.set('archived', '1')
  if (params?.cursor) q.set('cursor', params.cursor)
  if (params?.keyset) q.set('keyset', '1')
  const qs = q.toString()
  return `/documents${qs ? `?${qs}` : ''}`
}

export function listDocuments(params?: {
  templateId?: string
  canvasType?: string
  projectId?: string
  limit?: number
  offset?: number
  archived?: boolean
}) {
  return apiRequest<DocumentSummary[]>(documentQuery(params), { cache: 'no-store' })
}

/** 文档 keyset 首页可不传 cursor，后续页传上一响应的 nextCursor。 */
export function listDocumentsCursor(params?: {
  templateId?: string
  canvasType?: string
  limit?: number
  cursor?: string
  archived?: boolean
}) {
  return apiRequest<DocumentCursorPage>(documentQuery({ ...params, keyset: true }), {
    cache: 'no-store',
  })
}

export function batchDocuments(action: 'archive' | 'restore', ids: string[]) {
  return apiRequest<{ affected: number }>('/documents/batch', {
    method: 'POST',
    body: { action, ids },
    retry: 0,
  })
}

export async function listDocumentsPage(params?: {
  templateId?: string
  canvasType?: string
  projectId?: string
  limit?: number
  offset?: number
  archived?: boolean
}): Promise<DocumentPage> {
  const limit = params?.limit ?? 20
  const offset = params?.offset ?? 0
  const res = await apiRequestResult<DocumentSummary[]>(
    documentQuery({ ...params, limit, offset }),
    { cache: 'no-store' },
  )
  const items = Array.isArray(res.data) ? res.data : []
  const totalHeader = Number(res.headers.get('X-Total-Count'))
  const total = Number.isFinite(totalHeader) ? totalHeader : items.length
  const hasMoreHeader = res.headers.get('X-Has-More')
  const hasMore = hasMoreHeader == null ? offset + items.length < total : hasMoreHeader === 'true'
  return { items, total, limit, offset, hasMore }
}

export function exportDocument(id: string, format: 'json' | 'markdown') {
  return apiRequest<{ filename: string; format: string; content: CanvasDocumentJSON | string }>(
    `/documents/${id}/export?format=${format}`,
  )
}

export function getDocument(id: string) {
  return apiRequest<DocumentFull>(`/documents/${id}`, { cache: 'no-store' })
}

export type BackupDocument = {
  title: string
  notes?: string
  templateId?: string | null
  canvasType: string
  schemaVersion?: number
  updatedAt?: string
  currentData: CanvasDocumentJSON
}

export type BackupBundle = {
  version: number
  exportedAt: string
  count: number
  truncated: boolean
  documents: BackupDocument[]
}

/** 直接返回服务端 JSON 字节对应的 Blob，调用方无需再序列化整份备份。 */
export async function downloadBackup(): Promise<Blob> {
  const res = await apiRequestBlob('/documents/backup', { cache: 'no-store' })
  return res.data
}

/**
 * importBatchId 标识一次用户导入意图。HTTP 自动重试必须复用同一个 id 和已序列化 body，
 * 服务端据此返回首次导入结果，而不是在网络结果未知时重复创建整套画布。
 */
export function restoreBackup(bundle: BackupBundle, importBatchId: string) {
  return apiRequest<{ imported: number; skipped: number }>('/documents/backup', {
    method: 'POST',
    body: { ...bundle, importBatchId },
    retry: 1,
  })
}

export function createDocument(input: {
  title?: string
  notes?: string
  canvasType?: string
  templateId?: string
  /** 画布归属的项目。缺省表示不属于任何项目。 */
  projectId?: string
  data?: AnyCanvasDocumentJSON
}) {
  return apiRequest<DocumentFull>('/documents', {
    method: 'POST',
    body: input,
  })
}

export function updateDocument(
  id: string,
  input: {
    title?: string
    notes?: string
    currentData: AnyCanvasDocumentJSON
    expectedHeadRevisionId?: string | null
    /** 读到的 saveVersion；错过就返回 409，避免静默覆盖别人的保存。 */
    expectedSaveVersion?: number
    checkpoint?: boolean
    /** 网络重试幂等键；同一文档内复用时载荷必须完全一致。 */
    operationId?: string
  },
) {
  return apiRequest<DocumentFull>(`/documents/${id}`, {
    method: 'PUT',
    body: input,
  })
}

export function renameDocument(id: string, title: string, expectedSaveVersion?: number) {
  return apiRequest<DocumentSummary>(`/documents/${id}/title`, {
    method: 'PATCH',
    body: expectedSaveVersion == null ? { title } : { title, expectedSaveVersion },
    retry: 0,
  })
}

/**
 * Clone a document server-side. The server inserts a new canvas_documents row
 * with a fresh id and a deep copy of the source payload.
 */
export function cloneDocument(
  id: string,
  input?: { title?: string; notes?: string },
) {
  return apiRequest<DocumentFull>(`/documents/${id}/clone`, {
    method: 'POST',
    body: input ?? {},
    retry: 0,
  })
}

export function deleteDocument(id: string) {
  return apiRequest<void>(`/documents/${id}`, { method: 'DELETE' })
}

export function createRevision(
  id: string,
  input?: { expectedHeadRevisionId?: string | null; expectedSaveVersion?: number; label?: string },
) {
  return apiRequest<{
    document: DocumentFull
    revision: RevisionSummary
    contentHash?: string | null
  }>(`/documents/${id}/revisions`, { method: 'POST', body: input || {} })
}

// 重载保留旧调用的数组类型；只有显式传第二个参数时才使用分页结构。
export function listRevisions(id: string): Promise<RevisionSummary[]>
export function listRevisions(
  id: string,
  params: { limit?: number; cursor?: string; offset?: number },
): Promise<RevisionPage>
export function listRevisions(
  id: string,
  params?: { limit?: number; cursor?: string; offset?: number },
) {
  const q = new URLSearchParams()
  if (params) {
    // 空对象也明确表示新分页请求，因此补默认 limit，避免服务端走旧数组分支。
    q.set('limit', String(params.limit ?? 50))
    if (params.cursor) q.set('cursor', params.cursor)
    if (params.offset != null) q.set('offset', String(params.offset))
  }
  const qs = q.toString()
  return apiRequest<RevisionSummary[] | RevisionPage>(
    `/documents/${id}/revisions${qs ? `?${qs}` : ''}`,
  )
}

export function materializeRevision(id: string, rid: string) {
  return apiRequest<{
    documentId: string
    revisionId: string
    revisionType: string
    label: string | null
    createdAt: string
    contentHash?: string | null
    data: CanvasDocumentJSON
  }>(`/documents/${id}/revisions/${rid}/materialize`)
}

export function restoreDocument(
  id: string,
  input: {
    revisionId: string
    expectedHeadRevisionId?: string | null
    expectedSaveVersion?: number
    label?: string
  },
) {
  return apiRequest<DocumentFull>(`/documents/${id}/restore`, {
    method: 'POST',
    body: input,
  })
}

export type StatsRange = '7d' | '30d' | '90d' | 'year'
export type StatsGranularity = 'day' | 'week' | 'month'

export type StatsCompare = { current: number; previous: number }

export type StatsBucket = {
  start: string
  created: number
  edited: number
  revisions: number
}

export type TemplateStat = {
  templateId: string
  canvasType: string
  total: number
  created: number
  edited: number
  series: number[]
}

export type HeatCell = { date: string; count: number }

export type ActivityStats = {
  activeDays: number
  previousActiveDays: number
  streak: number
  longest: number
}

export type RecentEdit = {
  id: string
  title: string
  templateId: string | null
  canvasType: string
  createdAt: string
  updatedAt: string
}

export type DocumentStats = {
  range: StatsRange | string
  granularity: StatsGranularity | string
  timezone: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
  documents: StatsCompare
  weekCreated: StatsCompare
  monthCreated: StatsCompare
  weekEdited: StatsCompare
  monthEdited: StatsCompare
  revisions: StatsCompare
  activeTemplates: StatsCompare
  rangeCreated: StatsCompare
  rangeEdited: StatsCompare
  totals: { revisions: number; templates: number }
  activity: ActivityStats
  series: StatsBucket[]
  templates: TemplateStat[]
  heatmap: HeatCell[]
  recent: RecentEdit[]
}

export function getDocumentStats(
  params?: {
    range?: StatsRange
    granularity?: StatsGranularity
  },
  opts?: { fresh?: boolean; signal?: AbortSignal },
) {
  const q = new URLSearchParams()
  if (params?.range) q.set('range', params.range)
  if (params?.granularity) q.set('granularity', params.granularity)
  const qs = q.toString()
  return apiRequest<DocumentStats>(`/documents/stats${qs ? `?${qs}` : ''}`, {
    signal: opts?.signal,
    cache: opts?.fresh ? 'reload' : 'default',
  })
}

export function searchDocuments(
  params: {
    q?: string
    templateId?: string
    limit?: number
  },
  opts?: { signal?: AbortSignal },
) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.templateId) q.set('templateId', params.templateId)
  if (params.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiRequest<SearchHit[]>(`/documents/search${qs ? `?${qs}` : ''}`, {
    signal: opts?.signal,
    cache: 'no-store',
  })
}

export function diffRevisions(
  id: string,
  ridA: string,
  against?: string | null,
) {
  const q = new URLSearchParams()
  if (against) q.set('against', against)
  const qs = q.toString()
  return apiRequest<DiffResult>(
    `/documents/${id}/revisions/${ridA}/diff${qs ? `?${qs}` : ''}`,
  )
}

export function getAIContext(id: string) {
  return apiRequest<AIContext>(`/documents/${id}/ai-context`)
}

/**
 * 抓取来源文档的正文快照，供跨文档同步块刷新使用。
 * 指定面板时取该面板，否则取第一个有正文的面板。
 */
export async function fetchDocumentTextSnapshot(
  id: string,
  panelId?: string,
): Promise<{ text: string; panelId?: string }> {
  const ctx = await getAIContext(id)
  const panels = Array.isArray(ctx?.panels) ? ctx.panels : []
  const wanted = (panelId || '').trim()
  const picked = wanted
    ? panels.find((p) => p && p.panelId === wanted && p.text && p.text.trim())
    : panels.find((p) => p && p.text && p.text.trim())
  if (!picked) return { text: '' }
  return { text: picked.text.slice(0, 4000), panelId: picked.panelId }
}

export function getAICorpus(params?: {
  templateId?: string
  q?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.templateId) q.set('templateId', params.templateId)
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiRequest<AIContext[]>(`/documents/ai-corpus${qs ? `?${qs}` : ''}`)
}
