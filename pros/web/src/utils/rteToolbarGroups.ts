/** 工具栏分组。旧文档没有保存顺序时用默认顺序。 */

export type ToolbarGroupDef = {
  id: string
  label: string
  keys: readonly string[]
}

/** 旧文档把标题、字形、对齐、列表都存在 id `text` 里。读出来时按这个顺序展开。 */
export const LEGACY_TEXT_GROUP_IDS = ['type', 'marks', 'align', 'list'] as const

export const TOOLBAR_GROUPS: readonly ToolbarGroupDef[] = [
  { id: 'history', label: '操作', keys: ['undo', 'redo', 'find', 'formatPainter', 'pastePlain', 'clear', 'pasteFormat'] },
  { id: 'type', label: '标题', keys: ['heading', 'paraStyle', 'fontSize', 'fontFamily', 'headingAutoNum'] },
  {
    id: 'marks',
    label: '字形',
    keys: ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'codeInline', 'emphasisDot', 'caseTransform', 'ruby'],
  },
  { id: 'color', label: '颜色', keys: ['color', 'highlight'] },
  { id: 'align', label: '对齐', keys: ['align', 'lineHeight', 'spacing', 'indent', 'outdent'] },
  { id: 'list', label: '列表', keys: ['list', 'listStyle'] },
  { id: 'paragraph', label: '段落', keys: ['quote', 'code'] },
  {
    id: 'insert',
    label: '链接',
    keys: ['link', 'image', 'video', 'audio', 'attach', 'linkCard', 'qrcode', 'emoji', 'specialChars', 'formula'],
  },
  { id: 'table', label: '表格', keys: ['table', 'tableCsv', 'tableFilter'] },
  {
    id: 'blocks',
    label: '块级',
    keys: [
      'callout', 'hr', 'columns', 'pageBreak', 'toggleBlock', 'blockOps', 'insertDate',
      'form', 'template', 'timeline', 'statusChip', 'progressBar', 'tabsBlock', 'mermaid', 'snippets',
    ],
  },
  {
    id: 'notes',
    label: '批注',
    keys: ['note', 'footnote', 'footnoteList', 'captionNum', 'bookmark', 'mentionBtn', 'xref'],
  },
  {
    id: 'review',
    label: '审阅',
    keys: ['spellcheck', 'sensitive', 'revision', 'revisionBase', 'speak', 'speakStop', 'headingCheck', 'linkCheck', 'cjkTip'],
  },
  {
    id: 'view',
    label: '导出',
    keys: ['print', 'import', 'export', 'copyMd', 'viewExtras', 'zoom', 'immersive', 'outline', 'shortcuts', 'wordStats', 'readTime'],
  },
  { id: 'other', label: '其他', keys: [] },
]

export const DEFAULT_TOOLBAR_GROUP_ORDER: readonly string[] = TOOLBAR_GROUPS.map((group) => group.id)

const GROUP_BY_ID = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group]))

export function normalizeToolbarGroupOrder(saved: unknown): string[] {
  const known = new Set(DEFAULT_TOOLBAR_GROUP_ORDER)
  const out: string[] = []
  const push = (id: string) => {
    if (known.has(id) && !out.includes(id)) out.push(id)
  }
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (id === 'text') {
        for (const next of LEGACY_TEXT_GROUP_IDS) push(next)
        continue
      }
      if (typeof id === 'string') push(id)
    }
  }
  for (const id of DEFAULT_TOOLBAR_GROUP_ORDER) push(id)
  return out
}

export function toolbarOrdersEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function toolbarGroupLabels(order: readonly string[]): string {
  const labels = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group.label]))
  return order.map((id) => labels.get(id) || id).join('、')
}

/** 多个编辑器同时挂载时，只有最近一次重排的实例在焦点离开编辑器后响应 Ctrl+Z。 */
let toolbarUndoEpoch = 0

export function bumpToolbarUndoEpoch(): number {
  toolbarUndoEpoch += 1
  return toolbarUndoEpoch
}

export function currentToolbarUndoEpoch(): number {
  return toolbarUndoEpoch
}

/** 拖到第 toIndex 个分组之前。toIndex === length 表示放到最后。顺序没变时返回 null。 */
export function moveToolbarGroup(order: readonly string[], fromId: string, toIndex: number): string[] | null {
  const from = order.indexOf(fromId)
  if (from < 0 || !Number.isInteger(toIndex)) return null
  if (toIndex < 0 || toIndex > order.length) return null
  if (from === toIndex || from + 1 === toIndex) return null
  const next = [...order]
  const [moved] = next.splice(from, 1)
  const dest = toIndex > from ? toIndex - 1 : toIndex
  next.splice(dest, 0, moved!)
  return next
}

export function writeToolbarGroupOrder(
  map: Record<string, string[]> | null | undefined,
  panelId: string,
  order: readonly string[],
): Record<string, string[]> | undefined {
  const next = { ...(map || {}) }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizeToolbarGroupOrder(order)
  if (toolbarOrdersEqual(normalized, DEFAULT_TOOLBAR_GROUP_ORDER)) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}

export function readToolbarGroupOrder(
  map: Record<string, string[]> | null | undefined,
  panelId: string | null | undefined,
): string[] {
  if (!map || !panelId) return normalizeToolbarGroupOrder(undefined)
  return normalizeToolbarGroupOrder(map[panelId])
}

export function buildToolbarGroups<T extends { key: string }>(
  tools: readonly T[],
  order: readonly string[],
): Array<{ id: string; label: string; tools: T[] }> {
  const byKey = new Map(tools.map((tool) => [tool.key, tool]))
  const used = new Set<string>()
  const groups = normalizeToolbarGroupOrder(order).map((id) => {
    const def = GROUP_BY_ID.get(id)!
    const picked: T[] = []
    for (const key of def.keys) {
      const tool = byKey.get(key)
      if (!tool) continue
      picked.push(tool)
      used.add(key)
    }
    return { id, label: def.label, tools: picked }
  })
  const rest = tools.filter((tool) => !used.has(tool.key))
  const other = groups.find((group) => group.id === 'other')
  if (other) other.tools.push(...rest)
  return groups.filter((group) => group.tools.length > 0)
}
