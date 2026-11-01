/**
 * @提及候选列表。
 *
 * 来源说明（无后端时的本地占位）：
 * - 默认内置一组常见角色 / 示例人名，便于本地演示与联调。
 * - 后续可改为：从当前文档已有 mention 节点收集、或对接组织通讯录 API。
 * - 过滤为本地子串匹配（id / label / 角色）。
 */

export type RteMentionKind = 'person' | 'block'

export type RteMentionItem = {
  id: string
  label: string
  /** 可选角色/部门，展示在副标题 */
  role?: string
  kind?: RteMentionKind
  blockKind?: 'heading' | 'figure' | 'table'
  targetId?: string
}

export type RteBlockCandidate = {
  id: string
  label: string
  kind: 'heading' | 'figure' | 'table'
}

/**
 * 本地占位候选。无后端时用于 @ 建议弹层。
 * 请勿把真实隐私名单写死进仓库；接 API 后替换 DEFAULT_MENTION_ITEMS 即可。
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
        const hay = `${it.id} ${it.label} ${it.role || ''}`.toLowerCase()
        return hay.includes(q)
      })
  return list.slice(0, Math.max(1, limit))
}

/** 人员在前，本文标题 / 图 / 表以提及样式接在后面。 */
export function mergeMentionCandidates(
  query: string,
  blocks: RteBlockCandidate[] = [],
  limit = 12,
  people: RteMentionItem[] = DEFAULT_MENTION_ITEMS,
): RteMentionItem[] {
  const cap = Math.max(1, limit)
  const persons = filterRteMentionItems(query, cap, people).map((item) => ({
    ...item,
    kind: 'person' as const,
  }))
  const q = query.trim().toLowerCase()
  const blockItems: RteMentionItem[] = blocks
    .filter((block) => {
      if (!q) return true
      return `${block.label} ${block.kind} ${block.id}`.toLowerCase().includes(q)
    })
    .map((block) => ({
      id: `block:${block.kind}:${block.id}`,
      label: block.label.replace(/^§\s*/, ''),
      role: block.kind === 'heading' ? '标题' : block.kind === 'figure' ? '图片' : '表格',
      kind: 'block' as const,
      blockKind: block.kind,
      targetId: block.id,
    }))
  const peopleShown = persons.slice(0, Math.min(8, cap))
  const blockRoom = Math.max(0, cap - peopleShown.length)
  return [...peopleShown, ...blockItems.slice(0, blockRoom)]
}

export function mentionSectionLabel(item: RteMentionItem): string {
  return item.kind === 'block' ? '本文' : '人员'
}
