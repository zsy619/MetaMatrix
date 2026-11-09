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
      'spellcheck', 'sensitive', 'headingCheck', 'linkCheck', 'watermark', 'outbound', 'audit', 'inlineAi', 'cjkTip',
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

/** 功能区栏目与原来的工具栏分组一一对应。点开栏目只显示这一组。 */
export const RIBBON_TABS: readonly { id: string; label: string; groups: readonly string[] }[] =
  TOOLBAR_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    groups: [group.id],
  }))

export function ribbonGroupsFor(tabId: string): readonly string[] {
  return RIBBON_TABS.find((tab) => tab.id === tabId)?.groups ?? RIBBON_TABS[0]!.groups
}

const GROUP_BY_ID = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group]))

/**
 * 紧凑态（未最大化）主栏要放的高频键：按分组声明。
 *
 * 口径（P0-5，紧凑栏与方案 A 对齐）：
 * - 紧凑主栏不再单独维护一份扁平顺序表，而是从方案 A 的分组定义派生：
 *   组内相对顺序 = 该组 `TOOLBAR_GROUPS.keys` 的顺序；组间顺序 = 用户可拖拽的分组顺序。
 * - 因此用户拖拽分组顺序后，紧凑主栏的高频键会随之同步（同一套心智）。
 * - 图表组（9 个一级分类下拉）不进紧凑主栏（按钮太多），统一收在「更多」里，
 *   窄屏也能找到入口；图表分类顺序始终等于 `CHART_TOOLBAR_KEYS`（= CHART_GROUPS 顺序）。
 */
export const COMPACT_PRIMARY_KEYS_BY_GROUP: Record<string, readonly string[]> = {
  edit: ['undo', 'redo'],
  style: ['bold', 'italic', 'underline', 'strike', 'color', 'highlight'],
  paragraph: ['heading', 'list', 'quote', 'code', 'align'],
  insert: ['link', 'image'],
}

/**
 * 紧凑主栏高频键（扁平顺序）。
 *
 * 组间顺序由 `groupOrder` 决定（用户拖拽后的分组顺序）；组内顺序固定取
 * `TOOLBAR_GROUPS` 里该组的 keys 顺序 —— 与最大化工具栏完全一致。
 */
export function compactPrimaryKeys(
  groupOrder: readonly string[] = DEFAULT_TOOLBAR_GROUP_ORDER,
): string[] {
  const out: string[] = []
  for (const groupId of normalizeToolbarGroupOrder(groupOrder)) {
    const def = GROUP_BY_ID.get(groupId)
    if (!def) continue
    const wanted = COMPACT_PRIMARY_KEYS_BY_GROUP[groupId]
    if (!wanted || !wanted.length) continue
    for (const key of def.keys) {
      if (wanted.includes(key) && !out.includes(key)) out.push(key)
    }
  }
  return out
}

/** 紧凑主栏高频键集合（按默认分组顺序展开）。 */
export const COMPACT_PRIMARY_KEY_SET: ReadonlySet<string> = new Set(compactPrimaryKeys())

/** 紧凑主栏每个分组的高频键（组内顺序同 TOOLBAR_GROUPS）。 */
export function compactPrimaryKeysByGroup(
  groupOrder: readonly string[] = DEFAULT_TOOLBAR_GROUP_ORDER,
): Array<{ id: string; label: string; keys: string[] }> {
  const out: Array<{ id: string; label: string; keys: string[] }> = []
  for (const groupId of normalizeToolbarGroupOrder(groupOrder)) {
    const def = GROUP_BY_ID.get(groupId)
    if (!def) continue
    const wanted = COMPACT_PRIMARY_KEYS_BY_GROUP[groupId]
    if (!wanted || !wanted.length) continue
    const keys = def.keys.filter((key) => wanted.includes(key))
    if (!keys.length) continue
    out.push({ id: def.id, label: def.label, keys })
  }
  return out
}

/** 「更多」里能看到的键 = 全部工具键 − 紧凑主栏高频键（图表 9 分类必然在内）。 */
export function compactOverflowKeys(
  allKeys: readonly string[],
  primaryKeys: ReadonlySet<string> = COMPACT_PRIMARY_KEY_SET,
): string[] {
  return allKeys.filter((key) => !primaryKeys.has(key))
}

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

/** 分组在视口里的盒子。orderIndex 是它在工具栏顺序里的下标。 */
export type ToolbarDropBox = {
  id: string
  orderIndex: number
  left: number
  top: number
  width: number
  height: number
  /** 分组折成多行时，只有首段的左缘和末段的右缘才是整组的前后。 */
  seam?: 'both' | 'before' | 'after' | 'none'
}

export type ToolbarDropGesture = {
  dx: number
  dy: number
}

/**
 * 宽分组只认两端大约 48px 的接缝。窄分组仍以中线分前后，两侧都点得到。
 * 落在宽分组中间时返回 null，调用方保持当前顺序。
 */
function horizontalEdgeIndex(target: ToolbarDropBox, point: number): number | null {
  const seam = target.seam ?? 'both'
  if (seam === 'none') return null
  if (target.width <= 160 && seam === 'both') {
    return point < target.left + target.width / 2 ? target.orderIndex : target.orderIndex + 1
  }
  const edge = Math.min(48, Math.max(28, target.width * 0.08))
  if ((seam === 'both' || seam === 'before') && point <= target.left + edge) return target.orderIndex
  if ((seam === 'both' || seam === 'after') && point >= target.left + target.width - edge) return target.orderIndex + 1
  return null
}

/**
 * 纵向按分组高度决定提前量。
 * 矮行大约三成高度就换；高卡片封顶 72px，并且不超过高度的 45%，所以总是早于中线。
 */
function dropLeadAlongHeight(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 8
  const byHeight = Math.min(72, Math.max(8, span * 0.28))
  return Math.min(byHeight, span * 0.45)
}

function orientDropBoxes(boxes: readonly ToolbarDropBox[], axis: 'x' | 'y'): ToolbarDropBox[] {
  if (axis === 'x') return boxes.map((box) => ({ ...box }))
  return boxes.map((box) => ({
    id: box.id,
    orderIndex: box.orderIndex,
    left: box.top,
    top: box.left,
    width: box.height,
    height: box.width,
  }))
}

function clusterDropBoxes(boxes: readonly ToolbarDropBox[]): ToolbarDropBox[][] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)
  const rows: ToolbarDropBox[][] = []
  for (const box of sorted) {
    const row = rows[rows.length - 1]
    if (!row) {
      rows.push([box])
      continue
    }
    const rowTop = Math.min(...row.map((item) => item.top))
    const rowBottom = Math.max(...row.map((item) => item.top + item.height))
    const overlap = Math.min(rowBottom, box.top + box.height) - Math.max(rowTop, box.top)
    const span = Math.min(box.height, rowBottom - rowTop)
    if (span > 0 && overlap > span * 0.45) row.push(box)
    else rows.push([box])
  }
  return rows
}

function rowSpanOf(row: readonly ToolbarDropBox[]): { top: number; bottom: number; height: number } {
  const top = Math.min(...row.map((item) => item.top))
  const bottom = Math.max(...row.map((item) => item.top + item.height))
  return { top, bottom, height: Math.max(0, bottom - top) }
}

function medianNumber(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * 指针在两行之间的空隙时，若手势已经走出约半行高，偏向手势前方的那一行。
 * 指针已经落进行内时不改行，避免轻拖被吸走。
 */
function pickDropCluster(
  rows: readonly (readonly ToolbarDropBox[])[],
  cross: number,
  approach: { dir: -1 | 0 | 1; reach: number } | null,
): readonly ToolbarDropBox[] {
  const measured = rows.map((row) => ({ row, span: rowSpanOf(row) }))
  for (const item of measured) {
    if (cross >= item.span.top && cross <= item.span.bottom) return item.row
  }
  let best = measured[0]!
  let bestDist = Infinity
  for (const item of measured) {
    const dist = cross < item.span.top ? item.span.top - cross : cross - item.span.bottom
    if (dist < bestDist) {
      bestDist = dist
      best = item
    }
  }
  if (!approach || approach.dir === 0 || approach.reach <= 0) return best.row
  let ahead: { row: readonly ToolbarDropBox[]; dist: number } | null = null
  for (const item of measured) {
    const toward = approach.dir > 0 ? item.span.top >= cross : item.span.bottom <= cross
    if (!toward) continue
    const dist = approach.dir > 0 ? item.span.top - cross : cross - item.span.bottom
    if (!ahead || dist < ahead.dist) ahead = { row: item.row, dist }
  }
  const nearestIsBehind =
    approach.dir > 0 ? best.span.bottom <= cross : best.span.top >= cross
  if (ahead && nearestIsBehind && ahead.dist <= approach.reach && ahead.dist <= bestDist + approach.reach * 0.25) {
    return ahead.row
  }
  return best.row
}

function nearestDropBox(row: readonly ToolbarDropBox[], point: number): ToolbarDropBox {
  let best = row[0]!
  let bestDist = Infinity
  for (const box of row) {
    const right = box.left + box.width
    const dist = point < box.left ? box.left - point : point > right ? point - right : 0
    if (dist < bestDist || (dist === bestDist && box.left < best.left)) {
      bestDist = dist
      best = box
    }
  }
  return best
}

function approachFromGesture(
  axis: 'x' | 'y',
  gesture: ToolbarDropGesture | undefined,
  rows: readonly (readonly ToolbarDropBox[])[],
): { dir: -1 | 0 | 1; reach: number } | null {
  if (!gesture || axis !== 'x') return null
  const along = gesture.dy
  const across = gesture.dx
  if (Math.abs(along) < 8 || Math.abs(along) < Math.abs(across) * 0.75) return null
  const height = medianNumber(rows.map((row) => rowSpanOf(row).height))
  return { dir: along > 0 ? 1 : -1, reach: Math.max(8, height * 0.45) }
}

/**
 * 指针在高分组的上/下缘，且手势已经走出约三成高度时，按高度而不是按宽度中线换位。
 * 矮行不走这条，避免把普通的横向拖判成换行。
 */
function indexFromGroupHeight(
  target: ToolbarDropBox,
  clientX: number,
  clientY: number,
  gesture: ToolbarDropGesture | undefined,
): number | null {
  if (!gesture || target.height < 56) return null
  if (clientX < target.left || clientX > target.left + target.width) return null
  if (clientY < target.top || clientY > target.top + target.height) return null
  const need = Math.max(10, target.height * 0.35)
  if (Math.abs(gesture.dy) < need || Math.abs(gesture.dy) < Math.abs(gesture.dx)) return null
  const frac = (clientY - target.top) / target.height
  if (gesture.dy > 0 && frac >= 0.72) return target.orderIndex + 1
  if (gesture.dy < 0 && frac <= 0.28) return target.orderIndex
  return null
}

/**
 * 指针应插在第几个分组之前。
 * 横向工具栏按行命中：换到下一行时不再被上一行的横坐标抢走。
 * direction 为沿主轴的拖动方向（1 正向，-1 反向，0 还没沿主轴移动）。
 * 横向只在分组两端的接缝换位：靠近左缘插到前面，靠近右缘插到后面，
 * 宽分组中间不换位，避免指针还在组中间就把整组跳走。
 * 纵向提前量按分组高度计算。
 * gesture 用来在行间空隙和高于一行的分组上按高度修正落点。
 * 盒子要用分组原来的占位，不要用已经跟着指针平移之后的矩形。
 */
export function toolbarDropIndexFromBoxes(
  clientX: number,
  clientY: number,
  boxes: readonly ToolbarDropBox[],
  axis: 'x' | 'y',
  orderLength: number,
  direction: -1 | 0 | 1 = 0,
  gesture?: ToolbarDropGesture,
): number | null {
  if (!Number.isInteger(orderLength) || orderLength < 0) return null
  const usable = boxes.filter(
    (box) =>
      box.width > 0 &&
      box.height > 0 &&
      Number.isInteger(box.orderIndex) &&
      box.orderIndex >= 0 &&
      box.orderIndex < orderLength,
  )
  if (!usable.length) return null
  const oriented = orientDropBoxes(usable, axis)
  const point = axis === 'x' ? clientX : clientY
  const cross = axis === 'x' ? clientY : clientX
  const clustered = clusterDropBoxes(oriented)
  const target = nearestDropBox(
    pickDropCluster(clustered, cross, approachFromGesture(axis, gesture, clustered)),
    point,
  )
  const byHeight = axis === 'x' ? indexFromGroupHeight(target, clientX, clientY, gesture) : null
  const alongEdge = axis === 'x' ? horizontalEdgeIndex(target, point) : undefined
  const lead = dropLeadAlongHeight(target.width)
  const right = target.left + target.width
  let index: number
  if (byHeight != null) index = byHeight
  else if (axis === 'x') {
    if (alongEdge == null) return null
    index = alongEdge
  } else if (direction > 0) index = point >= target.left + lead ? target.orderIndex + 1 : target.orderIndex
  else if (direction < 0) index = point <= right - lead ? target.orderIndex : target.orderIndex + 1
  else index = point < target.left + target.width / 2 ? target.orderIndex : target.orderIndex + 1
  if (index < 0) return 0
  if (index > orderLength) return orderLength
  return index
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
