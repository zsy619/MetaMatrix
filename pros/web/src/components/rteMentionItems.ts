/**
 * @提及候选列表。
 *
 * 来源说明（无后端时的本地占位）：
 * - 默认内置一组常见角色 / 示例人名，便于本地演示与联调。
 * - 后续可改为：从当前文档已有 mention 节点收集、或对接组织通讯录 API。
 * - 过滤为本地子串匹配（id / label / 角色）。
 */

export type RteMentionItem = {
  id: string
  label: string
  /** 可选角色/部门，展示在副标题 */
  role?: string
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
