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
  outline: ['大纲', '目录导航'],
  hr: ['分割线'],
  emoji: ['表情'],
  qrcode: ['二维码', 'qr'],
  formula: ['公式', 'latex'],
  video: ['视频'],
  audio: ['音频'],
  pageBreak: ['分页', '分页符'],
  printPreview: ['打印预览'],
  comment: ['评论', '批注'],
  footnote: ['脚注'],
  watermark: ['水印'],
  emphasisDot: ['着重号'],
  pastePlain: ['纯文本', '粘贴'],
  pasteFormat: ['粘贴格式'],
  tableZebra: ['斑马纹', '隔行'],
  subscript: ['下标'],
  superscript: ['上标'],
  imageReplace: ['换图'],
  headingAutoNum: ['标题号', '自动编号'],
  spellcheck: ['拼写检查', '错词'],
  revision: ['修订', '改动'],
  bookmark: ['书签', '锚点'],
  readTime: ['阅读时长', '时长'],
  shortcuts: ['快捷键'],
  snippets: ['片段', '常用语'],
  timeline: ['时间线'],
  linkCard: ['网页卡', '链接卡片'],
  speakStop: ['停止朗读', '停读'],
  immersive: ['沉浸', '全屏'],
  statusChip: ['徽章', '状态'],
  progressBar: ['进度条', '进度'],
  sensitive: ['敏感词', '错别字'],
  wordStats: ['字数', '统计'],
  headingCheck: ['标题检查', '跳级'],
  linkCheck: ['链接检查', '死链'],
  outbound: ['外链', '白名单'],
  note: ['注释'],
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
function searchScore(tool: ToolbarSearchTool, query: string, groupLabel = ''): number {
  const compact = query.replace(/\s+/g, '')
  const spaced = searchScoreOne(tool, query)
  const tight = !compact || compact === query ? -1 : searchScoreOne(tool, compact)
  let own = spaced
  if (tight >= 0 && (own < 0 || tight < own)) own = tight
  const group = groupLabel.trim().toLowerCase()
  if (group && (group === query || group === compact)) return own < 0 ? 6 : own
  return own
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
      const score = searchScore(tool, q, group.label)
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

/** 搜索框下方的一句结果。空查询不显示。有结果时点出首选按钮和所在栏目。 */
export function toolbarSearchStatus(query: string, count: number, best = '', capped = false, place = ''): string {
  if (!normalizeToolbarQuery(query)) return ''
  if (count <= 0) return '没有匹配的按钮'
  const first = best.trim() ? `，首选「${best.trim()}」` : ''
  const where = place.trim() ? `，在${place.trim()}` : ''
  const more = capped ? '，只列出前若干个' : ''
  if (count === 1) return `找到 1 个按钮${first}${where}，按 Enter 直接使用`
  return `找到 ${count} 个按钮${first}${where}${more}`
}

/** 栏目上 PageUp / PageDown 一次跳三格，不绕回。 */
export function stepRibbonTabBy(ids: readonly string[], current: string, delta: number): string {
  if (!ids.length || !Number.isFinite(delta) || delta === 0) return current
  const index = Math.max(0, ids.indexOf(current))
  const next = Math.min(ids.length - 1, Math.max(0, index + Math.trunc(delta)))
  return ids[next] || current
}

export function zoomToolLabel(zoom: number): string {
  if (!Number.isFinite(zoom) || Math.abs(zoom - 1) < 0.001) return '实际大小'
  return `${Math.round(zoom * 100)}%`
}

export function pasteFormatLabel(mode: string): string {
  if (mode === 'plain') return '粘贴·纯文本'
  if (mode === 'markdown') return '粘贴·MD'
  return '粘贴·保留'
}

export function tableToolLabel(inTable: boolean): string {
  return inTable ? '表操作' : '插表格'
}

export function quoteToolTitle(active: boolean): string {
  return active ? '已在引用中，再点一次取消 (Ctrl/⌘+Shift+9)' : '引用 (Ctrl/⌘+Shift+9)'
}

export function codeBlockToolTitle(active: boolean): string {
  return active ? '光标在代码块里，再点一次取消' : '代码块 (Ctrl/⌘+Shift+E)'
}

export function spellcheckToolTitle(active: boolean): string {
  return active ? '拼写检查已开启，再点一次关闭' : '拼写检查（用浏览器词典）'
}

export const EMPTY_GROUP_NOTE = '本组按钮都已隐藏，双击组名恢复'

export const RIBBON_TAB_BLURBS: Record<string, string> = {
  edit: '撤销、查找、格式刷、粘贴',
  style: '字号、颜色、加粗、高亮',
  paragraph: '段落、列表、对齐、行距',
  writing: '方向、引用样式、纸样',
  tidy: '半角、全角、空格',
  insert: '链接、图片、二维码、公式',
  picture: '排法、换图、替代文本',
  frame: '圆角、阴影、边框',
  charts: '基础、统计、关系等图表',
  table: '插入、斑马纹、冻结、行列',
  blocks: '告示、分栏、流程图、模板',
  notes: '批注、脚注、书签',
  review: '检查、修订、朗读',
  view: '缩放、大纲、字数',
  file: '打印、导入、导出',
  page: '纸张、分页、打印预览',
}

/** 栏目悬停时写出里面有什么。 */
export function ribbonTabHint(id: string, label: string): string {
  const name = label.trim() || '栏目'
  const blurb = RIBBON_TAB_BLURBS[id]
  return blurb ? `${name}：${blurb}` : name
}

/** 定义里有按钮、但当前都被隐藏时，仍留出分组以便恢复。 */
export function hiddenGroupPlaceholders<T extends { id: string }>(
  visible: readonly T[],
  allowedIds: readonly string[],
  defined: readonly { id: string; label: string; keyCount: number }[],
): Array<T | { id: string; label: string; tools: []; hiddenAll: true }> {
  const seen = new Set(visible.map((group) => group.id))
  const extra: Array<{ id: string; label: string; tools: []; hiddenAll: true }> = []
  for (const id of allowedIds) {
    if (seen.has(id)) continue
    const def = defined.find((item) => item.id === id)
    if (!def || def.keyCount <= 0) continue
    extra.push({ id: def.id, label: def.label, tools: [], hiddenAll: true })
  }
  return [...visible.map((group) => ({ ...group, hiddenAll: false as const })), ...extra]
}

export function listToolLabel(kind: 'bullet' | 'ordered' | 'task' | ''): string {
  if (kind === 'task') return '任务'
  if (kind === 'ordered') return '有序'
  if (kind === 'bullet') return '无序'
  return '列表'
}

export function formatPainterLabel(mode: 'off' | 'once' | 'sticky'): string {
  if (mode === 'sticky') return '连刷'
  if (mode === 'once') return '刷中'
  return '格式刷'
}

/** 鼠标移向菜单时多留一点时间，避免菜单提前关掉。 */
export const MENU_CLOSE_DELAY_MS = 320

export function searchEnterActivates(count: number): boolean {
  return count === 1
}

/** 按相关度重排分组和组内按钮。空查询返回空列表。 */
export function orderToolbarSearchGroups<T extends ToolbarSearchTool>(
  groups: readonly { id: string; label: string; tools: readonly T[] }[],
  query: string,
  limit = 24,
): { groups: Array<{ id: string; label: string; tools: T[] }>; total: number; capped: boolean } {
  const cap = Math.max(1, limit)
  const hits = searchToolbarTools(groups, query, cap + 1)
  const shown = hits.slice(0, cap)
  const lookup = new Map<string, T>()
  for (const group of groups) {
    for (const tool of group.tools) lookup.set(`${group.id}:${tool.key}`, tool)
  }
  const ordered: Array<{ id: string; label: string; tools: T[] }> = []
  for (const hit of shown) {
    const tool = lookup.get(`${hit.groupId}:${hit.key}`)
    if (!tool) continue
    let bucket = ordered.find((item) => item.id === hit.groupId)
    if (!bucket) {
      bucket = { id: hit.groupId, label: hit.groupLabel, tools: [] }
      ordered.push(bucket)
    }
    bucket.tools.push(tool)
  }
  return { groups: ordered, total: hits.length, capped: hits.length > cap }
}

/** 搜索时组名带上命中数量。 */
export function searchGroupCaption(label: string, count: number, searching: boolean): string {
  const name = label.trim() || '分组'
  if (!searching) return name
  return `${name} · ${Math.max(0, count)}`
}

export function fontFamilyCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '字体'
  const named = options.find((item) => item.value === current)
  const raw = named?.label && named.label !== '默认字体' ? named.label.split('/')[0].trim() : current.split(',')[0].replace(/["']/g, '').trim()
  if (!raw || raw === '默认字体') return '字体'
  return raw.length > 6 ? `${raw.slice(0, 6)}…` : raw
}

export function lineHeightCaption(value: string, options: readonly { label: string; value: string }[]): string {
  const current = value.trim()
  if (!current) return '行距'
  const named = options.find((item) => item.value === current)
  if (!named || named.label === '默认行高') return current
  return named.label
}

export function alignToolTitle(align: string): string {
  if (align === 'center') return '当前居中。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'right') return '当前右对齐。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'justify') return '当前两端对齐。可选左对齐、居中、右对齐、两端对齐'
  if (align === 'left') return '当前左对齐。可选左对齐、居中、右对齐、两端对齐'
  return '对齐：左对齐、居中、右对齐、两端对齐'
}

export function zoomToolTitle(zoom: number): string {
  if (!Number.isFinite(zoom) || Math.abs(zoom - 1) < 0.001) return '编辑区缩放，当前为实际大小'
  return `编辑区缩放，当前 ${Math.round(zoom * 100)}%`
}

/** Alt+1 到 Alt+9 对应前九个栏目。越界返回空字符串。 */
export function ribbonTabForDigit(ids: readonly string[], digit: number): string {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return ''
  return ids[digit - 1] || ''
}

/** 栏目上直接打字，拼进搜索词。方向键和修饰键不接收。 */
export function ribbonTypeaheadQuery(key: string, current: string): string | null {
  if (key === 'Backspace') return current.slice(0, -1)
  if (key.length !== 1 || /[\s\u0000-\u001f]/.test(key)) return null
  return `${current}${key}`
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
  'hr', 'blockOps', 'insertDate', 'highlight', 'color', 'wordStats', 'shortcuts', 'spacing',
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
