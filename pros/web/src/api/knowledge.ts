import { apiRequest, getToken } from './http'
import type { FieldDef } from './knowledge_v5'

export type KnowledgeNodeType =
  | 'folder'
  | 'doc'
  | 'canvas'
  | 'note'
  | 'sheet'
  | 'mindmap'
  | 'attachment'

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
  /** 标题的拼音与首字母：中文按拼音检索。 */
  pinyin: string
  /** 可见范围：space（空间内）| private（仅 allowedUsers）。 */
  visibility: 'space' | 'private'
  /** 私有节点的可见用户 ID（逗号分隔）。 */
  allowedUsers: string
  favorite: boolean
  locked: boolean
  /** 非空表示在回收站里。 */
  trashedAt: string | null
  /** 非空表示已归档。 */
  archivedAt: string | null
  /** 指向的文档是什么类型的画布（画布节点用）。 */
  documentCanvasType: string
  /** 指向的文档用的是哪个模板（画布节点用它决定打开方式）。 */
  documentTemplateId: string
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
    /** 标题的拼音与首字母（pinyin-pro 生成）：中文按拼音检索。 */
    pinyin?: string
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
  input: { title?: string; icon?: string; documentId?: string; pinyin?: string },
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

export function deleteKnowledgeNode(projectId: string, nodeId: string, promote = false) {
  const suffix = promote ? '?promote=1' : ''
  return apiRequest<{ deleted: boolean }>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}${suffix}`,
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
  /** 作用域：personal | team | project（builtin 模板为 personal）。 */
  scope: string
  html: string
  builtin: boolean
  /** 团队模板是否已发布（发布后空间成员可见）。 */
  published: boolean
  publishedAt: string | null
  sortOrder: number
}

export function listTemplates(projectId: string) {
  return apiRequest<KnowledgeTemplate[]>(`/projects/${projectId}/knowledge/templates`, {
    cache: 'no-store',
  })
}

export function createTemplate(
  projectId: string,
  input: {
    key?: string
    label: string
    icon?: string
    category?: string
    html?: string
    scope?: 'personal' | 'team' | 'project'
  },
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
  /** 参与人（逗号分隔的用户 ID）。 */
  members: string
  /** 优先级：low | normal | high | urgent。 */
  priority: string
  /** 里程碑 / 迭代周期 / 自定义数值。 */
  milestone: string
  sprint: string
  number: number
  /** 自定义字段定义与取值。 */
  fields: FieldDef[]
  fieldValues: Record<string, unknown>
  /** 公式字段的计算结果。 */
  computed: Record<string, number>
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
    members?: string
    priority?: string
    milestone?: string
    sprint?: string
    number?: number
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
  /** 划线区间（正文字符偏移）。 */
  anchorFrom: number
  anchorTo: number
  /** 被 @ 的用户 ID（逗号分隔）。 */
  mentions: string
  /** 表情回应：{"👍": ["userId"]}。 */
  reactions: Record<string, string[]>
  /** 当前用户是否未读。 */
  unread: boolean
  content: string
  resolved: boolean
  createdAt: string
  updatedAt: string
  /** 可选的 Yjs 相对位置，缺省时仍走划线/块偏移。 */
  yRel?: string
  blockId?: string | null
  blockOffset?: number
}

export function listComments(documentId: string) {
  return apiRequest<DocComment[]>(`/documents/${documentId}/comments`, {
    cache: 'no-store',
  })
}

export function addComment(
  documentId: string,
  input: {
    content: string
    quote?: string
    parentId?: string | null
    /** 划线区间（正文字符偏移）。 */
    anchorFrom?: number
    anchorTo?: number
    /** 被 @ 的用户 ID。 */
    mentions?: string[]
    blockId?: string | null
    blockOffset?: number
    yRel?: string
  },
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
  /** 被分享的文档；节点分享（导图 / 表格）时为空。 */
  documentId: string | null
  /** 被分享的知识库节点；文档分享时为空。 */
  nodeId?: string | null
  /** 内容类型：doc | canvas | mindmap | sheet。 */
  kind?: string
  projectId: string
  token: string
  role: 'view' | 'comment' | 'edit'
  createdBy: string
  expiresAt: string | null
  /** true 表示该分享设置了访问口令（口令只存摘要，明文不可还原）。 */
  hasPassword?: boolean
  /** false 时分享页禁止复制与导出。 */
  allowCopy: boolean
  /** 分享白名单（逗号分隔的用户 ID）：非空时仅名单内成员可访问。 */
  allowUsers: string
  createdAt: string
}

export function listShares(documentId: string) {
  return apiRequest<KnowledgeShare[]>(`/documents/${documentId}/shares`, { cache: 'no-store' })
}

export function createShare(
  documentId: string,
  input: {
    role: 'view' | 'comment' | 'edit'
    expiresAt?: string | null
    /** 访问口令（服务端只存摘要）。 */
    password?: string
    /** false 时分享页禁止复制与导出。 */
    allowCopy?: boolean
  },
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

/** 列出知识库节点的分享链接（思维导图 / 多维表格）。 */
export function listNodeShares(projectId: string, nodeId: string) {
  return apiRequest<KnowledgeShare[]>(`/projects/${projectId}/knowledge/nodes/${nodeId}/shares`, {
    cache: 'no-store',
  })
}

/** 给知识库节点创建分享链接。 */
export function createNodeShare(
  projectId: string,
  nodeId: string,
  input: {
    role: 'view' | 'comment' | 'edit'
    expiresAt?: string | null
    /** 访问口令（服务端只存摘要）。 */
    password?: string
    /** false 时分享页禁止复制与导出。 */
    allowCopy?: boolean
  },
) {
  return apiRequest<KnowledgeShare>(`/projects/${projectId}/knowledge/nodes/${nodeId}/shares`, {
    method: 'POST',
    body: input,
  })
}

/** 撤销节点分享链接。 */
export function revokeNodeShare(projectId: string, nodeId: string, shareId: string) {
  return apiRequest<{ revoked: boolean }>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/shares/${shareId}`,
    { method: 'DELETE' },
  )
}

/** 设置节点分享白名单。 */
export function setNodeShareAllowList(
  projectId: string,
  nodeId: string,
  shareId: string,
  allowUsers: string,
) {
  return apiRequest<KnowledgeShare>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/shares/${shareId}/allowlist`,
    { method: 'PATCH', body: { allowUsers } },
  )
}

export type SharedDoc = {
  token: string
  role: 'view' | 'comment' | 'edit'
  /** 内容类型：doc | canvas | mindmap | sheet。 */
  kind: string
  title: string
  html: string
  /** 画布分享的模板与内容。 */
  canvas?: { templateId: string; data: unknown } | null
  /** 导图 / 表格的结构化内容。 */
  data?: unknown
  expiresAt: string | null
  /** false 时分享页禁止复制与导出。 */
  allowCopy: boolean
  /** true 表示这份分享需要口令，正文要带口令换取。 */
  requiresPassword: boolean
}

/** 分享页是公开入口：用裸 fetch 拉取，访客不需要登录态。 */
export async function fetchSharedDoc(token: string, password = ''): Promise<SharedDoc> {
  const query = password ? `?password=${encodeURIComponent(password)}` : ''
  const res = await fetch(`/api/knowledge/shares/${encodeURIComponent(token)}${query}`, {
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
  /** 版本备注：如「发布版」。 */
  label: string
  createdAt: string
  /** 协同整包；空表示该版本只有 HTML。 */
  yjsState?: string
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
  /** 正文字数：搜索结果按字数排序时用。 */
  words: number
}

export function searchKnowledgeSpace(
  projectId: string,
  params: {
    q?: string
    authorId?: string
    nodeType?: string
    limit?: number
    /** 排序：''（最近更新）| word（字数）| title（标题）。 */
    sort?: string
  } = {},
) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.authorId) query.set('authorId', params.authorId)
  if (params.nodeType) query.set('nodeType', params.nodeType)
  if (params.sort) query.set('sort', params.sort)
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
  /** 出处：命中来自哪篇文档。 */
  source: string
  /** 置信度 0-1。 */
  confidence: number
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
  /** 协作者当前编辑位置（标题文本 + 偏移）。 */
  cursor: string
  lastSeen: string
}

export function heartbeatPresence(documentId: string, editing: boolean, cursor = '') {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/presence`, {
    method: 'POST',
    body: { editing, cursor },
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

/** 导入单篇飞书文档：粘贴飞书文档链接即可（087）。 */
export function importFeishuDoc(projectId: string, docToken: string, parentId?: string | null) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/feishu/import-doc`, {
    method: 'POST',
    body: { docToken, parentId: parentId ?? null },
  })
}

export function notifyFeishu(projectId: string, text: string) {
  return apiRequest<{ ok: boolean }>(`/projects/${projectId}/knowledge/feishu/notify`, {
    method: 'POST',
    body: { text },
  })
}

// ---------------------------------------------------------------- 知识库 4.0

/** 归档区节点。 */
export function listArchivedNodes(projectId: string) {
  return apiRequest<KnowledgeNode[]>(`/projects/${projectId}/knowledge/archived`, {
    cache: 'no-store',
  })
}

/** 节点悬浮统计：子节点数、正文字数、评论数。 */
export type KnowledgeNodeStats = { children: number; words: number; comments: number }

export function getKnowledgeNodeStats(projectId: string, nodeId: string) {
  return apiRequest<KnowledgeNodeStats>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/stats`,
    { cache: 'no-store' },
  )
}

/** 关联推荐：同作者 / 同引用 / 同标签的相关文档。 */
export function getRelatedDocs(projectId: string, nodeId: string, limit = 6) {
  return apiRequest<KnowledgeSearchHit[]>(
    `/projects/${projectId}/knowledge/nodes/${nodeId}/related?limit=${limit}`,
    { cache: 'no-store' },
  )
}

/** 一键回填缺失的摘要。 */
export function fillKnowledgeSummaries(projectId: string) {
  return apiRequest<{ filled: number }>(`/projects/${projectId}/knowledge/summaries/fill`, {
    method: 'POST',
  })
}

export function updateTemplate(
  projectId: string,
  templateId: string,
  input: { label?: string; html?: string; sortOrder?: number; scope?: string },
) {
  return apiRequest<KnowledgeTemplate>(
    `/projects/${projectId}/knowledge/templates/${templateId}`,
    { method: 'PATCH', body: input },
  )
}

/** 把一篇文档另存为模板。 */
export function saveDocAsTemplate(documentId: string, label: string) {
  return apiRequest<KnowledgeTemplate>(`/documents/${documentId}/save-as-template`, {
    method: 'POST',
    body: { label },
  })
}

/** 跨项目检索。 */
export function globalSearchKnowledge(
  params: { q?: string; projectId?: string; nodeType?: string; sort?: string; limit?: number } = {},
) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.projectId) query.set('projectId', params.projectId)
  if (params.nodeType) query.set('type', params.nodeType)
  if (params.sort) query.set('sort', params.sort)
  if (params.limit) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<KnowledgeSearchHit[]>(`/knowledge/search/global${suffix}`, { cache: 'no-store' })
}

/** 多轮追问：把历史问题一起带上。 */
export function askKnowledgeFollowUp(projectId: string, question: string, context: string[]) {
  return apiRequest<KnowledgeAnswer[]>(`/projects/${projectId}/knowledge/ask/followup`, {
    method: 'POST',
    body: { question, context },
  })
}

/** 跨项目问答。 */
export function askKnowledgeGlobal(question: string) {
  return apiRequest<KnowledgeAnswer[]>('/knowledge/ask/global', {
    method: 'POST',
    body: { question },
  })
}

/** 整空间打包导出：目录树 + 每篇文档的 Markdown。 */
export async function exportKnowledgeSpaceZip(projectId: string) {
  const res = await apiRequest<Blob>(`/projects/${projectId}/knowledge/export/zip`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res)
  const link = document.createElement('a')
  link.href = url
  link.download = 'knowledge-space.zip'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** 疑似重复文档分组。 */
export function listSimilarDocs(projectId: string) {
  return apiRequest<KnowledgeSearchHit[][]>(`/projects/${projectId}/knowledge/similar`, {
    cache: 'no-store',
  })
}

export type KnowledgeQualityItem = {
  docId: string
  title: string
  kind: string
  detail: string
  suggest: string
}

/** 文档质量体检。 */
export function listQualityIssues(projectId: string, limit = 50) {
  return apiRequest<KnowledgeQualityItem[]>(
    `/projects/${projectId}/knowledge/quality?limit=${limit}`,
    { cache: 'no-store' },
  )
}

/** 敏感内容扫描。 */
export function scanSensitiveText(projectId: string, text: string) {
  return apiRequest<{ kind: string; match: string }[]>(
    `/projects/${projectId}/knowledge/scan`,
    { method: 'POST', body: { text } },
  )
}

/** 给历史版本加备注。 */
export function labelDocVersion(documentId: string, versionId: string, label: string) {
  return apiRequest<DocVersion>(`/documents/${documentId}/versions/${versionId}/label`, {
    method: 'POST',
    body: { label },
  })
}

/** 版本作者显示名。 */
export function listVersionAuthors(documentId: string) {
  return apiRequest<Record<string, string>>(`/documents/${documentId}/versions/authors`, {
    cache: 'no-store',
  })
}

/** 分享页评论（role=comment / edit）。 */
export async function addShareComment(token: string, password: string, content: string) {
  const res = await fetch(`/api/knowledge/shares/${encodeURIComponent(token)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, content }),
  })
  if (!res.ok) throw new Error('评论失败')
  return (await res.json()) as DocComment
}

/** 分享页保存正文（role=edit）。 */
export async function updateShareContent(token: string, password: string, html: string) {
  const res = await fetch(`/api/knowledge/shares/${encodeURIComponent(token)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, html }),
  })
  if (!res.ok) throw new Error('保存失败')
  return (await res.json()) as { ok: boolean }
}

/** 清理超期回收站节点。 */
export function purgeExpiredTrash(projectId: string, keepDays = 30) {
  return apiRequest<{ purged: number }>(`/projects/${projectId}/knowledge/trash/purge`, {
    method: 'POST',
    body: { keepDays },
  })
}
