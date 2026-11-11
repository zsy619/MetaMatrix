/** 工具栏栏目、搜索和字号菜单用的纯逻辑。 */

export type RibbonMove = 'prev' | 'next' | 'home' | 'end'

export function readStoredRibbonTab(raw: string | null | undefined, available: readonly string[]): string {
  const ids = available.filter((id) => id.trim())
  if (raw && ids.includes(raw)) return raw
  return ids[0] || 'edit'
}

export function stepRibbonTab(ids: readonly string[], current: string, move: RibbonMove): string {
  if (!ids.length) return current
  if (move === 'home') return ids[0]!
  if (move === 'end') return ids[ids.length - 1]!
  const index = Math.max(0, ids.indexOf(current))
  const next = move === 'next' ? index + 1 : index - 1
  return ids[(next + ids.length) % ids.length]!
}

export type ToolbarSearchTool = { key: string; label?: string }
export type ToolbarSearchGroup = { id: string; label: string; tools: readonly ToolbarSearchTool[] }
export type ToolbarSearchHit = { groupId: string; groupLabel: string; key: string; label: string }

/** 按按钮名称或 key 找工具。空查询不返回结果。 */
export function searchToolbarTools(groups: readonly ToolbarSearchGroup[], query: string, limit = 8): ToolbarSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: ToolbarSearchHit[] = []
  for (const group of groups) {
    for (const tool of group.tools) {
      const label = (tool.label || '').trim()
      if (!label) continue
      if (!`${label} ${tool.key}`.toLowerCase().includes(q)) continue
      hits.push({ groupId: group.id, groupLabel: group.label, key: tool.key, label })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}

export function fontSizeCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '字号'
  const named = options.find((item) => item.value === current)
  if (named?.label && named.label !== '默认') return named.label
  return current
}

export function pushRecentValue(list: readonly string[], value: string, limit = 5): string[] {
  const next = value.trim()
  if (!next) return [...list]
  return [next, ...list.filter((item) => item !== next)].slice(0, Math.max(1, limit))
}

export function recentOptions<T extends { value: string }>(options: readonly T[], recent: readonly string[]): T[] {
  const byValue = new Map(options.map((item) => [item.value, item]))
  const out: T[] = []
  for (const value of recent) {
    const item = byValue.get(value)
    if (item && !out.includes(item)) out.push(item)
  }
  return out
}

/** 专注模式只留这几个按钮。 */
export const FOCUS_TOOLBAR_KEYS = ['undo', 'redo', 'find'] as const
