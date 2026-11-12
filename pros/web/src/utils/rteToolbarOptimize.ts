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

export type ToolbarSearchTool = { key: string; label?: string; title?: string }
export type ToolbarSearchGroup = { id: string; label: string; tools: readonly ToolbarSearchTool[] }
export type ToolbarSearchHit = { groupId: string; groupLabel: string; key: string; label: string }

/** 口语和说明里的叫法。按钮名称对不上时仍能搜到。 */
export const TOOLBAR_SEARCH_KEYWORDS: Record<string, readonly string[]> = {
  ruby: ['拼音', '注音'],
  mermaid: ['流程图', '流程'],
  table: ['表格', '插入表格'],
  find: ['查找', '搜索'],
  undo: ['撤销'],
  redo: ['重做'],
  formatPainter: ['格式刷', '刷子'],
  callout: ['告示', '提示框', '警告'],
  columns: ['分栏', '多栏'],
  fontSize: ['字号', '磅值', '小四'],
  fontFamily: ['字体'],
  highlight: ['高亮', '荧光笔', '底色'],
  color: ['颜色', '文字颜色'],
  quote: ['引用'],
  quoteStyle: ['引用样式'],
  list: ['列表', '编号', '项目符号'],
  listStyle: ['编号样式', '罗马', '字母'],
  bold: ['加粗', '粗体'],
  italic: ['斜体'],
  underline: ['下划线'],
  strike: ['删除线'],
  align: ['对齐', '居中', '两端对齐'],
  image: ['图片', '插图'],
  imageLayout: ['环绕', '排法'],
  link: ['链接', '超链接'],
  clear: ['清除格式'],
  heading: ['标题', '正文', '段落样式'],
  paraStyle: ['段样式', '导语'],
  zoom: ['缩放'],
  print: ['打印'],
  export: ['导出', 'pdf', 'word'],
  import: ['导入'],
  textTidy: ['整理', '半角', '全角'],
  textDir: ['方向', '从右到左'],
  writingPaper: ['纸样', '田字格', '稿纸', '信纸'],
  tableStruct: ['行列', '插入行'],
  speak: ['朗读'],
  outline: ['大纲'],
  hr: ['分割线'],
  emoji: ['表情'],
}

/** 收掉首尾和连续空格，便于「拼 音」仍能匹配。 */
export function normalizeToolbarQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

function searchScoreOne(tool: ToolbarSearchTool, query: string): number {
  const label = (tool.label || '').trim().toLowerCase()
  if (!label) return -1
  const title = (tool.title || '').toLowerCase()
  const aliases = (TOOLBAR_SEARCH_KEYWORDS[tool.key] || []).map((item) => item.toLowerCase())
  const key = tool.key.toLowerCase()
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (label.includes(query)) return 2
  if (aliases.some((item) => item === query || item.includes(query))) return 3
  if (title.includes(query)) return 4
  if (key.includes(query)) return 5
  return -1
}

/** 「拼 音」去掉中间空格后再比一次。 */
function searchScore(tool: ToolbarSearchTool, query: string): number {
  const compact = query.replace(/\s+/g, '')
  const spaced = searchScoreOne(tool, query)
  if (!compact || compact === query) return spaced
  const tight = searchScoreOne(tool, compact)
  if (spaced < 0) return tight
  if (tight < 0) return spaced
  return Math.min(spaced, tight)
}

/** 按名称、说明、别名或 key 找工具。空查询不返回结果。完全匹配排在前面。 */
export function searchToolbarTools(groups: readonly ToolbarSearchGroup[], query: string, limit = 8): ToolbarSearchHit[] {
  const q = normalizeToolbarQuery(query)
  if (!q) return []
  const ranked: Array<{ hit: ToolbarSearchHit; score: number; index: number }> = []
  let index = 0
  for (const group of groups) {
    for (const tool of group.tools) {
      const label = (tool.label || '').trim()
      const score = searchScore(tool, q)
      index += 1
      if (!label || score < 0) continue
      ranked.push({
        hit: { groupId: group.id, groupLabel: group.label, key: tool.key, label },
        score,
        index,
      })
    }
  }
  ranked.sort((a, b) => a.score - b.score || a.index - b.index)
  return ranked.slice(0, Math.max(1, limit)).map((item) => item.hit)
}

/** 搜索框下方的一句结果。空查询不显示。 */
export function toolbarSearchStatus(query: string, count: number): string {
  if (!normalizeToolbarQuery(query)) return ''
  if (count <= 0) return '没有匹配的按钮'
  return `找到 ${count} 个按钮`
}

export const FOCUS_MODE_NOTE = '专注中，只留撤销、重做和查找'

/** 当前栏目可 Tab 进去，其余交给方向键。 */
export function ribbonTabTabIndex(selected: boolean): 0 | -1 {
  return selected ? 0 : -1
}

const MENU_TOOL_KINDS = new Set([
  'heading', 'list', 'align', 'paraStyle', 'listStyle', 'fontSize', 'fontFamily', 'lineHeight',
  'form', 'template', 'callout', 'presetMenu', 'textTidy', 'imageLayout', 'zoom', 'viewExtras',
  'caseTransform', 'import', 'export', 'table', 'echartsGroup', 'linkButton', 'columns',
  'hr', 'blockOps', 'insertDate', 'highlight', 'color',
])

/** 会打开菜单的按钮需要小三角。 */
export function menuToolNeedsCaret(kind: string | undefined): boolean {
  return !!kind && MENU_TOOL_KINDS.has(kind)
}

/** 不可用时在原提示后补一句，避免只看到灰掉的图标。 */
export function disabledToolTitle(title: string, disabled: boolean): string {
  const base = title.trim() || '按钮'
  if (!disabled) return base
  return base.includes('当前不可用') ? base : `${base}（当前不可用）`
}

/** 拖动手柄说明带上本组还剩几个按钮。 */
export function groupHandleTitle(label: string, count: number): string {
  const name = label.trim() || '分组'
  const n = Math.max(0, Math.floor(count))
  return `拖动${name}分组，本组 ${n} 个按钮。Alt+左/右也可移动`
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
