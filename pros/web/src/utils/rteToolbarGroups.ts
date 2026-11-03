/** 工具栏分组。旧文档没有保存顺序时用默认顺序。 */

import {
  isDefaultToolbarGroupConfig,
  normalizeGroupButtonConfig,
  visibleGroupButtonKeys,
  type ToolbarGroupButtonConfig,
  type ToolbarGroupButtonsByPanelId,
} from './rteToolbarGroupButtons'
import { CHART_GROUPS } from './echarts/chartGroups'

/** 图表分组在工具栏里的按钮 key（与 CHART_GROUPS 一一对应）。 */
export const CHART_TOOLBAR_KEYS: readonly string[] = CHART_GROUPS.map((group) => `chart:${group.id}`)

/** 旧版「图表」总入口的按钮 key：一个下拉里再分区，现在拆成 9 个分类下拉。 */
export const LEGACY_CHART_ENTRY_KEY = 'echarts'

/** 旧的总入口 key → 展开成 9 个分类下拉的 key。 */
export function expandLegacyChartKey(key: string): string[] {
  return key === LEGACY_CHART_ENTRY_KEY ? [...CHART_TOOLBAR_KEYS] : [key]
}

export type ToolbarGroupDef = {
  id: string
  label: string
  keys: readonly string[]
}

/**
 * 旧分组 id → 新分组 id（一个旧组可能拆成多个新组）。
 *
 * 旧文档把标题、字形、对齐、列表存在 id `text` 里；旧 `view`「导出」拆成
 * `view`「视图」+ `file`「文件与导出」；旧 `history`「操作」改名 `edit`「编辑」。
 */
export const LEGACY_GROUP_ALIASES: Record<string, readonly string[]> = {
  text: ['style', 'paragraph'],
  type: ['style', 'paragraph'],
  marks: ['style'],
  color: ['style'],
  align: ['paragraph'],
  list: ['paragraph'],
  paragraph: ['paragraph'],
  history: ['edit'],
  insert: ['insert'],
  charts: ['charts'],
  table: ['table'],
  blocks: ['blocks'],
  notes: ['notes'],
  review: ['review'],
  view: ['view', 'file'],
  other: ['other'],
}

/**
 * 旧文档把标题、字形、对齐、列表都存在 id `text` 里。
 * 读出来时按别名表展开成新分组（`text` → 字体与颜色 + 段落与列表）。
 */
export const LEGACY_TEXT_GROUP_IDS: readonly string[] = LEGACY_GROUP_ALIASES.text || []

export const TOOLBAR_GROUPS: readonly ToolbarGroupDef[] = [
  {
    id: 'edit',
    label: '编辑',
    keys: ['undo', 'redo', 'find', 'formatPainter', 'pastePlain', 'pasteFormat', 'clear'],
  },
  {
    id: 'style',
    label: '字体与颜色',
    keys: [
      'fontSize', 'fontFamily', 'color', 'highlight',
      'bold', 'italic', 'underline', 'strike', 'subscript', 'superscript',
      'codeInline', 'emphasisDot', 'caseTransform', 'ruby',
    ],
  },
  {
    id: 'paragraph',
    label: '段落与列表',
    keys: [
      'heading', 'paraStyle', 'headingAutoNum',
      'list', 'listStyle',
      'align', 'lineHeight', 'spacing', 'indent', 'outdent', 'firstIndent',
      'quote', 'code',
    ],
  },
  {
    id: 'insert',
    label: '插入',
    keys: [
      'link', 'linkButton', 'linkCard',
      'image', 'video', 'audio', 'attach',
      'qrcode', 'emoji', 'specialChars', 'formula',
    ],
  },
  // 图表独立分组：一级分类各占一个下拉按钮（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）
  { id: 'charts', label: '图表', keys: CHART_TOOLBAR_KEYS },
  { id: 'table', label: '表格', keys: ['table', 'tableCsv', 'tableFilter'] },
  {
    id: 'blocks',
    label: '块与结构',
    keys: [
      'callout', 'hr', 'columns', 'pageBreak', 'toggleBlock', 'tabsBlock',
      'blockOps', 'insertDate',
      'form', 'template', 'timeline', 'statusChip', 'progressBar',
      'mermaid', 'snippets', 'crossDoc',
    ],
  },
  {
    id: 'notes',
    label: '注释与引用',
    keys: [
      'comment', 'note', 'footnote', 'footnoteList',
      'captionNum', 'bookmark', 'xref',
      'mentionBtn', 'mentionPerm',
    ],
  },
  {
    id: 'review',
    label: '审阅',
    keys: [
      'spellcheck', 'sensitive', 'headingCheck', 'linkCheck', 'cjkTip',
      'revision', 'revisionBase', 'suggest', 'suggestAccept', 'suggestReject',
      'speak', 'speakStop',
    ],
  },
  {
    id: 'view',
    label: '视图',
    keys: ['viewExtras', 'zoom', 'immersive', 'outline', 'wordStats', 'readTime', 'shortcuts'],
  },
  {
    id: 'file',
    label: '文件与导出',
    keys: ['print', 'import', 'export', 'copyMd'],
  },
  { id: 'other', label: '其他', keys: [] },
]

export const DEFAULT_TOOLBAR_GROUP_ORDER: readonly string[] = TOOLBAR_GROUPS.map((group) => group.id)

const GROUP_BY_ID = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group]))

/** 工具 key → 所属分组 id（一个 key 只属于一个分组）。 */
const TOOL_GROUP_BY_KEY = new Map<string, string>()
for (const group of TOOLBAR_GROUPS) {
  for (const key of group.keys) {
    if (!TOOL_GROUP_BY_KEY.has(key)) TOOL_GROUP_BY_KEY.set(key, group.id)
  }
}

/** 迁移组内配置时旧分组配置的处理顺序（先旧组、后新组）。 */
const MIGRATION_SOURCE_ORDER: readonly string[] = [
  ...Object.keys(LEGACY_GROUP_ALIASES),
  'style',
  'edit',
  'file',
]

export function normalizeToolbarGroupOrder(saved: unknown): string[] {
  const known = new Set(DEFAULT_TOOLBAR_GROUP_ORDER)
  const out: string[] = []
  const push = (id: string) => {
    if (known.has(id) && !out.includes(id)) out.push(id)
  }
  if (Array.isArray(saved)) {
    for (const raw of saved) {
      if (typeof raw !== 'string') continue
      const alias = LEGACY_GROUP_ALIASES[raw]
      if (alias) {
        for (const id of alias) push(id)
        continue
      }
      push(raw)
    }
  }
  for (const id of DEFAULT_TOOLBAR_GROUP_ORDER) push(id)
  return out
}

/**
 * 迁移旧文档的「组内按钮显隐与顺序」配置（面板 id → 分组 id → 配置）。
 *
 * 配置以分组 id 为键，分组改名 / 合并 / 拆分后旧配置若不迁移，用户隐藏的按钮
 * 会复活、组内顺序也会被打回默认。这里按「按钮 key 落在哪个新分组」重新归位：
 * 旧 `view` 隐藏的 `print` 会落到新 `file`，旧 `marks` 隐藏的 `ruby` 落到新 `style`。
 * 迁移后等于默认配置的分组不保留（画布保持干净）。函数是幂等的。
 *
 * 图表组的旧总入口 `echarts`（一个下拉里再分区）会展开成 9 个分类下拉 key
 * （`chart:<id>`）：旧顺序按默认展开，旧隐藏则 9 个全隐藏。
 */
export function migrateToolbarGroupButtons(
  map: ToolbarGroupButtonsByPanelId | null | undefined,
): ToolbarGroupButtonsByPanelId | undefined {
  if (!map || typeof map !== 'object') return undefined
  const out: ToolbarGroupButtonsByPanelId = {}
  for (const [panelId, panel] of Object.entries(map)) {
    if (!panel || typeof panel !== 'object') continue
    const merged: Record<string, { order: string[]; hidden: string[] }> = {}
    const targetOf = (key: unknown): string | undefined => {
      if (typeof key !== 'string') return undefined
      return TOOL_GROUP_BY_KEY.get(key)
    }
    for (const sourceId of MIGRATION_SOURCE_ORDER) {
      const config = panel[sourceId]
      if (!config || typeof config !== 'object') continue
      const order = Array.isArray(config.order) ? config.order : []
      const hidden = Array.isArray(config.hidden) ? config.hidden : []
      for (const rawKey of order) {
        // 旧配置里的总入口 `echarts` 展开成 9 个分类下拉（顺序按默认）
        for (const key of expandLegacyChartKey(rawKey)) {
          const target = targetOf(key)
          if (!target) continue
          const bucket = merged[target] || (merged[target] = { order: [], hidden: [] })
          if (!bucket.order.includes(key)) bucket.order.push(key)
        }
      }
      for (const rawKey of hidden) {
        for (const key of expandLegacyChartKey(rawKey)) {
          const target = targetOf(key)
          if (!target) continue
          const bucket = merged[target] || (merged[target] = { order: [], hidden: [] })
          if (!bucket.hidden.includes(key)) bucket.hidden.push(key)
        }
      }
    }
    const next: Record<string, ToolbarGroupButtonConfig> = {}
    for (const [groupId, bucket] of Object.entries(merged)) {
      const def = GROUP_BY_ID.get(groupId)
      if (!def) continue
      const normalized = normalizeGroupButtonConfig(bucket, def.keys)
      if (isDefaultToolbarGroupConfig(normalized, def.keys)) continue
      next[groupId] = normalized
    }
    if (Object.keys(next).length) out[panelId] = next
  }
  return Object.keys(out).length ? out : undefined
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
  buttonConfigs?: Record<string, ToolbarGroupButtonConfig> | null,
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
    // 组内按钮的显隐与顺序：按面板保存的配置来
    const config = buttonConfigs?.[id]
    const keys = visibleGroupButtonKeys(config, def.keys)
    const ordered = keys
      .map((key) => picked.find((tool) => tool.key === key))
      .filter((tool): tool is T => !!tool)
    return { id, label: def.label, tools: ordered }
  })
  const rest = tools.filter((tool) => !used.has(tool.key))
  const other = groups.find((group) => group.id === 'other')
  if (other) other.tools.push(...rest)
  return groups.filter((group) => group.tools.length > 0)
}
