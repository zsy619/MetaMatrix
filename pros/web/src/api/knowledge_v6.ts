import { apiRequest, getToken } from './http'
import type { KnowledgeNode } from './knowledge'

// 知识库 6.0 的接口封装：空间成员与角色、团队模板发布、结构块统计、
// 写作补全、录音与字幕转文档、会议纪要、向量召回、协同编辑增量。

/** 空间成员。 */
export type SpaceMember = {
  userId: string
  name: string
  email: string
  avatar: string
  role: 'admin' | 'editor' | 'viewer'
  joinedAt: string
  isOwner: boolean
}

export function listSpaceMembers(projectId: string) {
  return apiRequest<SpaceMember[]>(`/projects/${projectId}/knowledge/members`, {
    cache: 'no-store',
  })
}

export function setSpaceMemberRole(projectId: string, userId: string, role: string) {
  return apiRequest<unknown>(`/projects/${projectId}/knowledge/members`, {
    method: 'POST',
    body: { userId, role },
  })
}

export function removeSpaceMember(projectId: string, userId: string) {
  return apiRequest<{ ok: boolean }>(`/projects/${projectId}/knowledge/members/${userId}`, {
    method: 'DELETE',
  })
}

/** 发布或下架团队共享模板。 */
export function publishTemplate(projectId: string, templateId: string, published: boolean) {
  return apiRequest<unknown>(`/projects/${projectId}/knowledge/templates/${templateId}/publish`, {
    method: 'POST',
    body: { published },
  })
}

/** 文档里的结构块统计（表格 / 白板 / 流程图 / 图表）。 */
export type DocStructure = {
  tables: number
  whiteboards: number
  flowcharts: number
  embeds: number
  refs: number
}

export function getDocStructure(documentId: string) {
  return apiRequest<DocStructure>(`/documents/${documentId}/structure`, { cache: 'no-store' })
}

/** 写作补全建议。 */
export type WritingSuggestion = {
  text: string
  /** ai 表示模型生成，local 表示从知识库里找的参考句。 */
  mode: 'ai' | 'local'
  source: string
}

export function suggestWriting(documentId: string, paragraph: string) {
  return apiRequest<WritingSuggestion>(`/documents/${documentId}/suggest`, {
    method: 'POST',
    body: { paragraph },
  })
}

/** 向量召回结果。 */
export type SemanticHit = {
  documentId: string
  title: string
  snippet: string
  score: number
}

export function semanticSearch(projectId: string, query: string, limit = 10) {
  const qs = new URLSearchParams({ q: query, limit: String(limit) })
  return apiRequest<SemanticHit[]>(`/projects/${projectId}/knowledge/semantic?${qs.toString()}`, {
    cache: 'no-store',
  })
}

/** 重建一篇文档的向量索引。 */
export function indexDocument(projectId: string, documentId: string) {
  return apiRequest<{ chunks: number }>(`/projects/${projectId}/knowledge/index`, {
    method: 'POST',
    body: { documentId },
  })
}

/** 会议纪要输入。 */
export type MeetingInput = {
  title?: string
  time?: string
  attendees?: string[]
  agenda?: string
  notes?: string
  transcript?: string
  source?: string
}

/** 会议纪要结果。 */
export type MeetingMinutes = {
  title: string
  time: string
  attendees: string[]
  topics: string[]
  decisions: string[]
  actions: { text: string; owner: string; due: string }[]
  summary: string
  mode: 'ai' | 'local'
}

export function buildMeetingMinutes(
  projectId: string,
  input: MeetingInput & { createDoc?: boolean; parentId?: string | null },
) {
  return apiRequest<{ minutes: MeetingMinutes; node?: KnowledgeNode }>(
    `/projects/${projectId}/knowledge/meeting/minutes`,
    { method: 'POST', body: input },
  )
}

/** 录音转文字：multipart 直传。 */
export async function transcribeAudio(projectId: string, file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const token = getToken()
  const res = await fetch(`/api/projects/${projectId}/knowledge/audio/transcribe`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || '录音转写失败')
  }
  const data = (await res.json()) as { text?: string }
  return data.text ?? ''
}

/** 用字幕 / 转写文本创建文档。 */
export function createDocFromTranscript(
  projectId: string,
  input: { title?: string; transcript: string; parentId?: string | null },
) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/transcript`, {
    method: 'POST',
    body: input,
  })
}

/** 旧 HTML 级协同旁路的历史增量（只读回放）。新的协同走 /documents/:id/collab。 */
export type CRDTUpdate = {
  seq: number
  kind: 'update' | 'snapshot'
  /** base64 编码的 Yjs update。 */
  payload: string
}

export function fetchCrdtUpdates(documentId: string, after = 0) {
  return apiRequest<{ updates: CRDTUpdate[] }>(
    `/documents/${documentId}/crdt?after=${after}`,
    { cache: 'no-store' },
  )
}

/** 旧 HTML 级协同旁路已只读，禁止再 POST /documents/:id/crdt。 */
export const CRDT_BYPASS_READ_ONLY = 'html crdt bypass is read-only'

export function appendCrdtUpdate(_documentId: string, _kind: 'update' | 'snapshot', _payload: string): Promise<{ seq: number }> {
  return Promise.reject(new Error(CRDT_BYPASS_READ_ONLY))
}

/** 用户+文档级审计记录（A3 骨架，只读）。 */
export type DocAuditEvent = {
  id: string
  documentId: string
  userId: string
  action: string
  blockId: string
  detail: string
  createdAt: string
}

export function listDocAudit(documentId: string, limit = 50) {
  const q = limit ? `?limit=${encodeURIComponent(String(limit))}` : ''
  return apiRequest<DocAuditEvent[]>(`/documents/${documentId}/audit${q}`, { cache: 'no-store' })
}

