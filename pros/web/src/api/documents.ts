import { apiRequest } from './http'
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

export function listDocuments(params?: {
  templateId?: string
  canvasType?: string
}) {
  const q = new URLSearchParams()
  if (params?.templateId) q.set('templateId', params.templateId)
  if (params?.canvasType) q.set('canvasType', params.canvasType)
  const qs = q.toString()
  return apiRequest<DocumentSummary[]>(`/documents${qs ? `?${qs}` : ''}`)
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
