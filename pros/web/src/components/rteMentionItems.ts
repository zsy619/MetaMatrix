/**
 * @提及候选列表。
 *
 * 来源说明（无后端时的本地占位）：
 * - 默认内置一组常见角色 / 示例人名，便于本地演示与联调。
 * - 后续可改为：从当前文档已有 mention 节点收集、或对接组织通讯录 API。
 * - 过滤为本地子串匹配（id / label / 角色），并支持拼音首字母。
 */
import { matchesPinyin } from '../utils/rtePinyin'

export type RteMentionKind = 'person' | 'block' | 'document'

export type RteMentionItem = {
  id: string
  label: string
  /** 可选角色/部门，展示在副标题 */
  role?: string
  kind?: RteMentionKind
  blockKind?: 'heading' | 'figure' | 'table'
  targetId?: string
  /** document mention 指向的知识库文档 id */
  documentId?: string
  /** document mention 目标类型：doc 走 inline mention，其他走 canvasEmbed 块。 */
  canvasType?: string
  /** 多维表格节点 ID（canvasType === 'base' 时有效）。 */
  nodeId?: string
}

type RteBlockCandidate = {
  id: string
  label: string
  kind: 'heading' | 'figure' | 'table'
}

/** 知识库里的文档候选（@ 文档 mention）。 */
export type RteDocCandidate = {
  documentId: string
  title: string
  icon?: string
  /** 目标文档类型：doc 走 mention，其他（node-graph/quadrant 等）走 canvasEmbed 块。 */
  canvasType?: string
  /** 知识库节点 ID（多维表格候选用）。 */
  nodeId?: string
}

/**
 * 本地占位候选。
 *
 * 只作为纯函数（filterRteMentionItems / mergeMentionCandidates）的默认参数与单测夹具，
 * 编辑器里的 @ 人员候选一律来自组织通讯录接口，不使用这份写死名单。
 * 请勿把真实隐私名单写死进仓库。
 */
export const DEFAULT_MENTION_ITEMS: RteMentionItem[] = [
  { id: 'owner', label: '负责人', role: '角色' },
  { id: 'reviewer', label: '评审人', role: '角色' },
  { id: 'approver', label: '审批人', role: '角色' },
  { id: 'author', label: '作者', role: '角色' },
  { id: 'collaborator', label: '协作人', role: '角色' },
  { id: 'zhuzhu', label: '老朱', role: '示例' },
  { id: 'xiaoming', label: '小明', role: '示例' },
  { id: 'xiaohong', label: '小红', role: '示例' },
  { id: 'product', label: '产品经理', role: '角色' },
  { id: 'designer', label: '设计师', role: '角色' },
  { id: 'dev', label: '开发', role: '角色' },
  { id: 'qa', label: '测试', role: '角色' },
]

export function filterRteMentionItems(
  query: string,
  limit = 12,
  source: RteMentionItem[] = DEFAULT_MENTION_ITEMS,
): RteMentionItem[] {
  const q = query.trim().toLowerCase()
  const list = !q
    ? source
    : source.filter((it) => {
        const hay = `${it.id} ${it.label} ${it.role || ''}`
        if (hay.toLowerCase().includes(q)) return true
        // 拼音首字母：「fzr」命中「负责人」
        return matchesPinyin(hay, q)
      })
  return list.slice(0, Math.max(1, limit))
}

/** 人员在前，本文标题 / 图 / 表以提及样式接在后面。 */
export function mergeMentionCandidates(
  query: string,
  blocks: RteBlockCandidate[] = [],
  limit = 12,
  people: RteMentionItem[] = DEFAULT_MENTION_ITEMS,
  docs: RteDocCandidate[] = [],
): RteMentionItem[] {
  const cap = Math.max(1, limit)
  const persons = filterRteMentionItems(query, cap, people).map((item) => ({
    ...item,
    kind: 'person' as const,
  }))
  const q = query.trim().toLowerCase()
  const docItems: RteMentionItem[] = docs
    .filter((d) => {
      if (!q) return true
      const hay = `${d.title} ${d.icon || ''}`
      if (hay.toLowerCase().includes(q)) return true
      return matchesPinyin(hay, q)
    })
    .map((d) => ({
      id: `doc:${d.documentId}`,
      label: d.title,
      role: d.icon || '文档',
      kind: 'document' as const,
      documentId: d.documentId,
      canvasType: d.canvasType,
      nodeId: d.nodeId,
    }))
  const blockItems: RteMentionItem[] = blocks
    .filter((block) => {
      if (!q) return true
      const hay = `${block.label} ${block.kind} ${block.id}`
      if (hay.toLowerCase().includes(q)) return true
      return matchesPinyin(hay, q)
    })
    .map((block) => ({
      id: `block:${block.kind}:${block.id}`,
      label: block.label.replace(/^§\s*/, ''),
      role: block.kind === 'heading' ? '标题' : block.kind === 'figure' ? '图片' : '表格',
      kind: 'block' as const,
      blockKind: block.kind,
      targetId: block.id,
    }))
  const peopleShown = persons.slice(0, Math.min(6, cap))
  const docsShown = docItems.slice(0, Math.max(0, cap - peopleShown.length))
  const blockRoom = Math.max(0, cap - peopleShown.length - docsShown.length)
  return [...peopleShown, ...docsShown, ...blockItems.slice(0, blockRoom)]
}

export function mentionSectionLabel(item: RteMentionItem): string {
  if (item.kind === 'block') return '本文'
  if (item.kind === 'document') return '文档'
  return '人员'
}
