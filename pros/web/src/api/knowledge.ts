import { apiRequest, getToken } from './http'

export type KnowledgeNodeType = 'folder' | 'doc' | 'canvas' | 'note' | 'sheet' | 'mindmap'

export type KnowledgeNode = {
  id: string
  projectId: string
  parentId: string | null
  nodeType: KnowledgeNodeType
  documentId: string | null
  title: string
  sortOrder: number
  icon: string
  /** 别名/短名：飞书知识库允许节点用短名被引用。 */
  alias: string
  /** 摘要：目录卡片与搜索结果读它。 */
  summary: string
  favorite: boolean
  locked: boolean
  /** 非空表示在回收站里。 */
  trashedAt: string | null
  /** 非空表示已归档。 */
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export function getKnowledgeTree(projectId: string) {
  return apiRequest<KnowledgeNode[]>(`/projects/${projectId}/knowledge/tree`, {
    cache: 'no-store',
  })
}

export function createKnowledgeNode(
  projectId: string,
  input: {
    parentId?: string | null
    nodeType: KnowledgeNodeType
    title: string
    icon?: string
    documentId?: string
    createDoc?: boolean
  },
) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/nodes`, {
    method: 'POST',
    body: input,
  })
}

export function updateKnowledgeNode(
  projectId: string,
  nodeId: string,
  input: { title?: string; icon?: string; documentId?: string },
) {
  return apiRequest<KnowledgeNode>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}`,
    { method: 'PATCH', body: input },
  )
}

export function moveKnowledgeNode(
  projectId: string,
  nodeId: string,
  input: { parentId?: string | null; sortOrder?: number },
) {
  return apiRequest<KnowledgeNode>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/move`,
    { method: 'POST', body: input },
  )
}

export function reorderKnowledgeNodes(projectId: string, ids: string[]) {
  return apiRequest<{ reordered: number }>(
    `/projects/${projectId}/knowledge/reorder`,
    { method: 'POST', body: { ids } },
  )
}

export function deleteKnowledgeNode(projectId: string, nodeId: string) {
  return apiRequest<{ deleted: boolean }>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}`,
    { method: 'DELETE' },
  )
}

/** 反向引用：哪些文档 @ 或嵌入了 targetDocId。 */
export type PageReference = {
  id: string
  sourceDocId: string
  targetDocId: string
  refType: 'mention' | 'embed'
  targetLabel: string
  createdAt: string
}

export function listBackrefs(documentId: string) {
  return apiRequest<PageReference[]>(`/documents/${documentId}/backrefs`, {
    cache: 'no-store',
  })
}

// ---------------------------------------------------------------- 知识库 2.0

export type KnowledgeTemplate = {
  id: string
  ownerUserId: string | null
  projectId: string | null
  key: string
  label: string
  icon: string
  category: string
  html: string
  builtin: boolean
  sortOrder: number
}

export function listTemplates(projectId: string) {
  return apiRequest<KnowledgeTemplate[]>(`/projects/${projectId}/knowledge/templates`, {
    cache: 'no-store',
  })
}

export function createTemplate(
  projectId: string,
  input: { key?: string; label: string; icon?: string; category?: string; html?: string },
) {
  return apiRequest<KnowledgeTemplate>(`/projects/${projectId}/knowledge/templates`, {
    method: 'POST',
    body: input,
  })
}

export function deleteTemplate(projectId: string, templateId: string) {
  return apiRequest<{ deleted: boolean }>(
    `/projects/${projectId}/knowledge/templates/${templateId}`,
    { method: 'DELETE' },
  )
}

export function updateNodeMeta(
  projectId: string,
  nodeId: string,
  input: {
    alias?: string
    summary?: string
    favorite?: boolean
    locked?: boolean
    archived?: boolean
    trashed?: boolean
  },
) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/nodes/${nodeId}/meta`, {
    method: 'PATCH',
    body: input,
  })
}

export function listTrash(projectId: string) {
  return apiRequest<KnowledgeNode[]>(`/projects/${projectId}/knowledge/trash`, {
    cache: 'no-store',
  })
}

export function purgeNode(projectId: string, nodeId: string) {
  return apiRequest<{ purged: boolean }>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/purge`,
    { method: 'DELETE' },
  )
}

export function copyNode(projectId: string, nodeId: string, parentId?: string | null) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/nodes/${nodeId}/copy`, {
    method: 'POST',
    body: { parentId: parentId ?? null },
  })
}

export function batchKnowledgeNodes(
  projectId: string,
  input: { ids: string[]; op: string; parentId?: string | null; value?: string },
) {
  return apiRequest<{ affected: number }>(`/projects/${projectId}/knowledge/batch`, {
    method: 'POST',
    body: input,
  })
}

export type KnowledgeSummary = {
  nodeCount: number
  docCount: number
  folderCount: number
  commentCount: number
  openComments: number
  tagCount: number
  recentUpdates: KnowledgeNode[]
  contributors: { ownerUserId: string; documents: number }[]
  health: { kind: string; docId: string; title: string; message: string }[]
}

export function getKnowledgeSummary(projectId: string) {
  return apiRequest<KnowledgeSummary>(`/projects/${projectId}/knowledge/summary`, {
    cache: 'no-store',
  })
}

export type KnowledgeEvent = {
  id: string
  projectId: string
  eventType: string
  nodeId: string | null
  documentId: string | null
  actorUserId: string
  payload: string
  createdAt: string
}

export function listKnowledgeEvents(projectId: string, limit = 30) {
  return apiRequest<KnowledgeEvent[]>(`/projects/${projectId}/knowledge/events?limit=${limit}`, {
    cache: 'no-store',
  })
}

export function exportKnowledgeTree(projectId: string) {
  return apiRequest<{ filename: string; format: string; content: string }>(
    `/projects/${projectId}/knowledge/export`,
    { cache: 'no-store' },
  )
}

export type DocProperties = {
  docId: string
  ownerUserId: string
  status: 'draft' | 'published' | 'archived'
  reviewerUserId: string | null
  dueAt: string | null
  tags: string
  summary: string
  coverColor: string
  coverUrl: string
  updatedAt: string
  createdAt: string
}

export function getDocProperties(documentId: string) {
  return apiRequest<DocProperties>(`/documents/${documentId}/properties`, {
    cache: 'no-store',
  })
}

export function updateDocProperties(
  documentId: string,
  input: {
    status?: string
    tags?: string
    summary?: string
    coverColor?: string
    coverUrl?: string
    dueAt?: string | null
    clearDueAt?: boolean
    reviewerUserId?: string | null
  },
) {
  return apiRequest<DocProperties>(`/documents/${documentId}/properties`, {
    method: 'PUT',
    body: input,
  })
}

export type DocComment = {
  id: string
  docId: string
  authorUserId: string
  parentId: string | null
  quote: string
  anchor: number
  content: string
  resolved: boolean
  createdAt: string
  updatedAt: string
}

export function listComments(documentId: string) {
  return apiRequest<DocComment[]>(`/documents/${documentId}/comments`, {
    cache: 'no-store',
  })
}

export function addComment(
  documentId: string,
  input: { content: string; quote?: string; parentId?: string | null },
) {
  return apiRequest<DocComment>(`/documents/${documentId}/comments`, {
    method: 'POST',
    body: input,
  })
}

export function updateComment(
  documentId: string,
  commentId: string,
  input: { content?: string; resolved?: boolean },
) {
  return apiRequest<DocComment>(`/documents/${documentId}/comments/${commentId}`, {
    method: 'PATCH',
    body: input,
  })
}

export function deleteComment(documentId: string, commentId: string) {
  return apiRequest<{ deleted: boolean }>(`/documents/${documentId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}

export function touchView(documentId: string) {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/view`, {
    method: 'POST',
  })
}

export type RecentKnowledgeView = {
  docId: string
  title: string
  viewedAt: string
}

export function listRecentViews(limit = 20) {
  return apiRequest<RecentKnowledgeView[]>(`/documents/knowledge/recent?limit=${limit}`, {
    cache: 'no-store',
  })
}

export function exportKnowledgeDoc(documentId: string, format: string) {
  return apiRequest<{ filename: string; format: string; content: string }>(
    `/documents/${documentId}/knowledge-export?format=${format}`,
    { cache: 'no-store' },
  )
}

// ---------------------------------------------------------------- 知识库 3.0

export type KnowledgeNodeData = {
  nodeId: string
  kind: 'sheet' | 'mindmap'
  data: unknown
  updatedAt?: string
}

export function getNodeData(projectId: string, nodeId: string) {
  return apiRequest<KnowledgeNodeData>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/data`,
    { cache: 'no-store' },
  )
}

export function saveNodeData(projectId: string, nodeId: string, kind: string, data: unknown) {
  return apiRequest<KnowledgeNodeData>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/data`,
    { method: 'PUT', body: { kind, data } },
  )
}

export type KnowledgeShare = {
  id: string
  documentId: string
  projectId: string
  token: string
  role: 'view' | 'comment' | 'edit'
  createdBy: string
  expiresAt: string | null
  createdAt: string
}

export function listShares(documentId: string) {
  return apiRequest<KnowledgeShare[]>(`/documents/${documentId}/shares`, { cache: 'no-store' })
}

export function createShare(
  documentId: string,
  input: { role: 'view' | 'comment' | 'edit'; expiresAt?: string | null },
) {
  return apiRequest<KnowledgeShare>(`/documents/${documentId}/shares`, {
    method: 'POST',
    body: input,
  })
}

export function revokeShare(documentId: string, shareId: string) {
  return apiRequest<{ revoked: boolean }>(`/documents/${documentId}/shares/${shareId}`, {
    method: 'DELETE',
  })
}

export type SharedDoc = {
  token: string
  role: 'view' | 'comment' | 'edit'
  title: string
  html: string
  expiresAt: string | null
}

/** 分享页是公开入口：用裸 fetch 拉取，访客不需要登录态。 */
export async function fetchSharedDoc(token: string): Promise<SharedDoc> {
  const res = await fetch(`/api/knowledge/shares/${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('分享链接无效或已过期')
  return (await res.json()) as SharedDoc
}

export type DocVersion = {
  id: string
  documentId: string
  title: string
  html: string
  authorUserId: string
  saveVersion: number
  createdAt: string
}

export function listDocVersions(documentId: string, limit = 30) {
  return apiRequest<DocVersion[]>(`/documents/${documentId}/versions?limit=${limit}`, {
    cache: 'no-store',
  })
}

export function diffDocVersions(documentId: string, from: string, to: string) {
  return apiRequest<{ diff: string }>(`/documents/${documentId}/versions/${from}/diff/${to}`, {
    cache: 'no-store',
  })
}

export type KnowledgeGraph = {
  nodes: { id: string; title: string; nodeType: string; documentId: string; author: string }[]
  edges: { source: string; target: string; type: 'tree' | 'reference' }[]
}

export function getKnowledgeGraph(projectId: string) {
  return apiRequest<KnowledgeGraph>(`/projects/${projectId}/knowledge/graph`, {
    cache: 'no-store',
  })
}

export type KnowledgeSearchHit = {
  nodeId: string
  documentId: string
  title: string
  summary: string
  nodeType: string
  author: string
  authorId: string
  tags: string
  updatedAt: string
  snippet: string
}

export function searchKnowledgeSpace(
  projectId: string,
  params: {
    q?: string
    authorId?: string
    nodeType?: string
    limit?: number
  } = {},
) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.authorId) query.set('authorId', params.authorId)
  if (params.nodeType) query.set('nodeType', params.nodeType)
  if (params.limit) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<KnowledgeSearchHit[]>(
    `/projects/${projectId}/knowledge/search${suffix}`,
    { cache: 'no-store' },
  )
}

export type KnowledgeAnswer = {
  documentId: string
  title: string
  snippet: string
  score: number
}

export function askKnowledgeSpace(projectId: string, question: string) {
  return apiRequest<KnowledgeAnswer[]>(`/projects/${projectId}/knowledge/ask`, {
    method: 'POST',
    body: { question },
  })
}

export type PresenceUser = {
  userId: string
  name: string
  avatar: string
  editing: boolean
  lastSeen: string
}

export function heartbeatPresence(documentId: string, editing: boolean) {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/presence`, {
    method: 'POST',
    body: { editing },
  })
}

export function listPresence(documentId: string) {
  return apiRequest<PresenceUser[]>(`/documents/${documentId}/presence`, { cache: 'no-store' })
}

export function getDocSummary(documentId: string) {
  return apiRequest<{ summary: string }>(`/documents/${documentId}/summary`, {
    cache: 'no-store',
  })
}

export function getDocTags(documentId: string) {
  return apiRequest<string[]>(`/documents/${documentId}/tags`, { cache: 'no-store' })
}

/** 导入 Word / Excel / Markdown / 纯文本：multipart 直传。 */
export async function importKnowledgeFile(
  projectId: string,
  file: File,
  parentId?: string | null,
): Promise<KnowledgeNode> {
  const body = new FormData()
  body.append('file', file)
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''
  const token = getToken()
  const res = await fetch(`/api/projects/${projectId}/knowledge/import${query}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || '导入失败')
  }
  return (await res.json()) as KnowledgeNode
}

export function importFeishuSpace(projectId: string, spaceToken: string, parentId?: string | null) {
  return apiRequest<{ imported: number }>(`/projects/${projectId}/knowledge/feishu/import`, {
    method: 'POST',
    body: { spaceToken, parentId: parentId ?? null },
  })
}

export function notifyFeishu(projectId: string, text: string) {
  return apiRequest<{ ok: boolean }>(`/projects/${projectId}/knowledge/feishu/notify`, {
    method: 'POST',
    body: { text },
  })
}
