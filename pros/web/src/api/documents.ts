import { apiRequest, apiRequestResult } from './http'
import type { CanvasDocumentJSON } from '../types/canvas'

export type DocumentSummary = {
  id: string
  title: string
  notes: string
  templateId: string | null
  canvasType: string
  schemaVersion: number
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

function documentQuery(params?: {
  templateId?: string
  canvasType?: string
  limit?: number
  offset?: number
}) {
  const q = new URLSearchParams()
  if (params?.templateId) q.set('templateId', params.templateId)
  if (params?.canvasType) q.set('canvasType', params.canvasType)
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.offset != null) q.set('offset', String(params.offset))
  const qs = q.toString()
  return `/documents${qs ? `?${qs}` : ''}`
}

export function listDocuments(params?: {
  templateId?: string
  canvasType?: string
  limit?: number
  offset?: number
}) {
  return apiRequest<DocumentSummary[]>(documentQuery(params))
}

export async function listDocumentsPage(params?: {
  templateId?: string
  canvasType?: string
  limit?: number
  offset?: number
}): Promise<DocumentPage> {
  const limit = params?.limit ?? 20
  const offset = params?.offset ?? 0
  const res = await apiRequestResult<DocumentSummary[]>(
    documentQuery({ ...params, limit, offset }),
  )
  const items = Array.isArray(res.data) ? res.data : []
  const totalHeader = Number(res.headers.get('X-Total-Count'))
  const total = Number.isFinite(totalHeader) ? totalHeader : items.length
  const hasMoreHeader = res.headers.get('X-Has-More')
  const hasMore = hasMoreHeader == null ? offset + items.length < total : hasMoreHeader === 'true'
  return { items, total, limit, offset, hasMore }
}

export function getDocument(id: string) {
  return apiRequest<DocumentFull>(`/documents/${id}`)
}

export function createDocument(input: {
  title?: string
  notes?: string
  canvasType?: string
  templateId?: string
  data?: CanvasDocumentJSON
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
    currentData: CanvasDocumentJSON
    expectedHeadRevisionId?: string | null
    checkpoint?: boolean
  },
) {
  return apiRequest<DocumentFull>(`/documents/${id}`, {
    method: 'PUT',
    body: input,
  })
}

export function deleteDocument(id: string) {
  return apiRequest<void>(`/documents/${id}`, { method: 'DELETE' })
}

export function createRevision(
  id: string,
  input?: { expectedHeadRevisionId?: string | null; label?: string },
) {
  return apiRequest<{
    document: DocumentFull
    revision: RevisionSummary
    contentHash?: string | null
  }>(`/documents/${id}/revisions`, { method: 'POST', body: input || {} })
}

export function listRevisions(id: string) {
  return apiRequest<RevisionSummary[]>(`/documents/${id}/revisions`)
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
  input: { revisionId: string; expectedHeadRevisionId?: string | null; label?: string },
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

export function searchDocuments(params: {
  q?: string
  templateId?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.templateId) q.set('templateId', params.templateId)
  if (params.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiRequest<SearchHit[]>(`/documents/search${qs ? `?${qs}` : ''}`)
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
