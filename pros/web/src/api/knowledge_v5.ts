import { apiRequest, getToken } from './http'
import type { DocProperties, DocComment, KnowledgeNode, KnowledgeShare } from './knowledge'

// 知识库 5.0 的接口封装：模板属性、属性看板、评论增强、任务块、
// 大纲与目录、节点权限、分享白名单、标签词库、导入预览与批量导入、docx 导出。

/** 自定义页面属性字段。 */
export type FieldDef = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'multi' | 'user' | 'checkbox' | 'formula'
  options?: string[]
  required?: boolean
  defaultValue?: string
  formula?: string
  hidden?: boolean
  order?: number
}

/** 用模板创建文档节点。 */
export function createDocFromTemplate(
  projectId: string,
  templateId: string,
  input: { parentId?: string | null; title?: string },
) {
  return apiRequest<KnowledgeNode>(
    `/projects/${projectId}/knowledge/templates/${templateId}/docs`,
    { method: 'POST', body: input },
  )
}

/** 改模板携带的属性定义。 */
export function updateTemplateProperties(projectId: string, templateId: string, fields: FieldDef[]) {
  return apiRequest<unknown>(
    `/projects/${projectId}/knowledge/templates/${templateId}/properties`,
    { method: 'PATCH', body: { fields } },
  )
}

/** 属性看板数据。 */
export type DocBoardItem = {
  docId: string
  nodeId: string
  title: string
  icon: string
  status: string
  priority: string
  reviewerUserId: string | null
  members: string
  tags: string
  number: number
  dueAt: string | null
  updatedAt: string
}

export function getDocPropsBoard(projectId: string) {
  return apiRequest<DocBoardItem[]>(`/projects/${projectId}/knowledge/props/board`, {
    cache: 'no-store',
  })
}

/** 批量改多篇文档的属性。 */
export function batchUpdateDocProps(
  projectId: string,
  docIds: string[],
  input: Partial<DocProperties> & { clearDueAt?: boolean },
) {
  return apiRequest<{ updated: number }>(`/projects/${projectId}/knowledge/props/batch`, {
    method: 'POST',
    body: { docIds, ...input },
  })
}

/** 改文档的自定义字段定义与取值。 */
export function updateDocFields(
  documentId: string,
  fields: FieldDef[],
  fieldValues: Record<string, unknown>,
) {
  return apiRequest<DocProperties>(`/documents/${documentId}/properties/fields`, {
    method: 'PUT',
    body: { fields, fieldValues },
  })
}

/** 列表：带未读与解决状态筛选。 */
export function listCommentsFiltered(
  documentId: string,
  params: { resolved?: boolean; unread?: boolean } = {},
) {
  const query = new URLSearchParams()
  if (params.resolved !== undefined) query.set('resolved', String(params.resolved))
  if (params.unread) query.set('unread', '1')
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<DocComment[]>(`/documents/${documentId}/comments${suffix}`, {
    cache: 'no-store',
  })
}

/** 给评论加/取消表情回应。 */
export function toggleCommentReaction(documentId: string, commentId: string, emoji: string) {
  return apiRequest<DocComment>(`/documents/${documentId}/comments/${commentId}/reaction`, {
    method: 'POST',
    body: { emoji },
  })
}

/** 标记评论已读。 */
export function markCommentsRead(documentId: string) {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/comments/read`, {
    method: 'POST',
  })
}

/** 某个历史版本当时的评论。 */
export function listVersionComments(documentId: string, versionId: string) {
  return apiRequest<DocComment[]>(`/documents/${documentId}/versions/${versionId}/comments`, {
    cache: 'no-store',
  })
}

/** 正文里的待办块。 */
export type DocTask = { index: number; text: string; checked: boolean }

export function getDocTasks(documentId: string) {
  return apiRequest<DocTask[]>(`/documents/${documentId}/tasks`, { cache: 'no-store' })
}

/** 勾选/取消勾选待办块。 */
export function toggleDocTask(documentId: string, index: number, checked: boolean) {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/tasks/${index}`, {
    method: 'PATCH',
    body: { checked },
  })
}

/** 正文标题层级。 */
export type OutlineItem = { index: number; level: number; text: string }

export function getDocOutline(documentId: string) {
  return apiRequest<OutlineItem[]>(`/documents/${documentId}/outline`, { cache: 'no-store' })
}

/** 按大纲顺序重排正文各节。 */
export function reorderDocOutline(documentId: string, order: number[]) {
  return apiRequest<{ ok: boolean }>(`/documents/${documentId}/outline/reorder`, {
    method: 'POST',
    body: { order },
  })
}

/** 节点可见范围与可见成员。 */
export function setNodeAccess(
  projectId: string,
  nodeId: string,
  input: { visibility: 'space' | 'private'; allowedUsers: string },
) {
  return apiRequest<KnowledgeNode>(`/projects/${projectId}/knowledge/nodes/${nodeId}/access`, {
    method: 'PATCH',
    body: input,
  })
}

/** 分享白名单。 */
export function setShareAllowList(documentId: string, shareId: string, allowUsers: string) {
  return apiRequest<KnowledgeShare>(`/documents/${documentId}/shares/${shareId}/allowlist`, {
    method: 'PATCH',
    body: { allowUsers },
  })
}

/** 业务标签词库。 */
export type TagDictEntry = {
  id: string
  projectId: string
  tag: string
  category: string
  aliases: string
}

export function listTagDict(projectId: string) {
  return apiRequest<TagDictEntry[]>(`/projects/${projectId}/knowledge/tags/dict`, {
    cache: 'no-store',
  })
}

export function addTagDict(
  projectId: string,
  input: { tag: string; category?: string; aliases?: string },
) {
  return apiRequest<TagDictEntry>(`/projects/${projectId}/knowledge/tags/dict`, {
    method: 'POST',
    body: input,
  })
}

export function deleteTagDict(projectId: string, dictId: string) {
  return apiRequest<{ ok: boolean }>(`/projects/${projectId}/knowledge/tags/dict/${dictId}`, {
    method: 'DELETE',
  })
}

/** 导入预览：给出标题、章节与表格列，供字段映射。 */
export type ImportPreview = {
  filename: string
  kind: string
  title: string
  headings: string[]
  columns: string[]
  preview: string
}

export function previewImport(projectId: string, filename: string, content: string) {
  return apiRequest<ImportPreview>(`/projects/${projectId}/knowledge/import/preview`, {
    method: 'POST',
    body: { filename, content },
  })
}

/** 批量导入：一次上传多个文件，逐个返回结果。 */
export type ImportResult = { filename: string; nodeId: string; title: string; error: string }

export async function importKnowledgeFiles(
  projectId: string,
  files: File[],
  parentId?: string | null,
): Promise<ImportResult[]> {
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''
  const token = getToken()
  const res = await fetch(`/api/projects/${projectId}/knowledge/import/batch${query}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || '批量导入失败')
  }
  const data = (await res.json()) as { results: ImportResult[] }
  return data.results || []
}

/** 导出 docx 的下载地址。 */
export function docxExportUrl(documentId: string) {
  return `/api/documents/${documentId}/docx`
}
