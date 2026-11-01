/** 第七轮可单测的缩进、表格粘贴、斜杠/快捷键检索与导出片段。 */

export const MAX_BLOCK_INDENT = 8
export const MAX_QUOTE_NEST = 4

export type TabAction =
  | 'pass'
  | 'list-sink'
  | 'list-lift'
  | 'quote-nest'
  | 'quote-lift'
  | 'indent'
  | 'outdent'

export type TabContext = {
  inTable: boolean
  inCode: boolean
  inList: boolean
  inQuote: boolean
  quoteDepth: number
  paragraphIndent: number
  shift: boolean
}

export function nextIndentLevel(current: number, delta: number): number {
  const n = Number.isFinite(current) ? current : 0
  const next = n + delta
  if (next < 0) return 0
  if (next > MAX_BLOCK_INDENT) return MAX_BLOCK_INDENT
  return next
}

export function countNodeName(names: readonly string[], name: string): number {
  let n = 0
  for (const item of names) if (item === name) n += 1
  return n
}

/**
 * Tab / Shift+Tab：表格与代码块留给原有行为；
 * 列表升降级；引用嵌套到 4 层；其余段落/标题缩进 0–8。
 */
export function tabAction(ctx: TabContext): TabAction {
  if (ctx.inTable || ctx.inCode) return 'pass'
  if (ctx.inList) return ctx.shift ? 'list-lift' : 'list-sink'
  if (ctx.inQuote) {
    if (!ctx.shift) {
      return ctx.quoteDepth < MAX_QUOTE_NEST ? 'quote-nest' : 'indent'
    }
    if (ctx.quoteDepth > 1) return 'quote-lift'
    if (ctx.paragraphIndent > 0) return 'outdent'
    return 'quote-lift'
  }
  return ctx.shift ? 'outdent' : 'indent'
}

export type RteViewModeName = 'edit' | 'preview' | 'source'

export function togglePreviewMode(mode: RteViewModeName): 'edit' | 'preview' {
  return mode === 'preview' ? 'edit' : 'preview'
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function htmlHasTable(html: string): boolean {
  return /<table[\s>]/i.test(html || '')
}

/** 至少两行、且至少两行含制表符；Markdown 管道表不走这条路径。 */
export function looksLikeTsvTable(plain: string): boolean {
  const text = (plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return false
  const lines = text.split('\n').map((line) => line.replace(/\s+$/, '')).filter((line) => line.length > 0)
  if (lines.length < 2) return false
  if (lines.every((line) => /^\s*\|/.test(line))) return false
  return lines.filter((line) => line.split('\t').length >= 2).length >= 2
}

export function tsvToTableHtml(plain: string): string {
  const text = (plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines = text.split('\n')
  const rows = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/\s+$/, '').split('\t'))
  if (!rows.length) return '<p></p>'
  const body = rows
    .map((cells) => {
      const tds = cells
        .map((cell) => {
          const value = escapeHtmlText(cell)
          return `<td><p>${value || '<br>'}</p></td>`
        })
        .join('')
      return `<tr>${tds}</tr>`
    })
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

/** 复制到飞书/文档时保留表格边框的 HTML 片段。 */
export function feishuClipboardDocument(bodyHtml: string, title?: string): string {
  const safeTitle = (title || '').trim()
  const heading = safeTitle ? `<h1>${escapeHtmlText(safeTitle)}</h1>` : ''
  const tables = (bodyHtml || '').replace(
    /<table\b(?![^>]*\bborder=)/gi,
    '<table border="1" cellpadding="6" cellspacing="0"',
  )
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${heading}${tables}</body></html>`
}

export type SlashSearchable = {
  label: string
  description?: string
  id: string
  keywords?: string[]
  action?: {
    type: string
    level?: number
    variant?: string
    kind?: string
    cols?: number
    id?: string
  }
}

const ACTION_EN: Record<string, string> = {
  heading: 'heading title 标题',
  paragraph: 'paragraph text 正文',
  bulletList: 'bullet list unordered 无序列表',
  orderedList: 'ordered list numbered 有序列表',
  taskList: 'task todo checkbox 任务',
  blockquote: 'quote blockquote nested 引用',
  codeBlock: 'code block 代码',
  hr: 'hr horizontal rule divider separator 分割线',
  toggleBlock: 'toggle fold collapse accordion 折叠',
  table: 'table 表格',
  image: 'image picture 图片',
  callout: 'callout admonition 提示',
  columns: 'columns 分栏',
  formula: 'formula math katex 公式',
  dateChip: 'date 日期',
  dateRemind: 'remind date 提醒',
  xref: 'cross reference xref 引用',
}

export function slashItemSearchText(item: SlashSearchable): string {
  const action = item.action
  const tokens: string[] = []
  if (action) {
    tokens.push(action.type)
    tokens.push(action.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
    const extra = ACTION_EN[action.type]
    if (extra) tokens.push(extra)
    if (action.level) tokens.push(`h${action.level}`, `heading ${action.level}`)
    if (action.variant) tokens.push(action.variant)
    if (action.kind) tokens.push(String(action.kind))
    if (action.cols) tokens.push(String(action.cols), 'columns', '分栏')
    if (action.id) tokens.push(action.id)
  }
  return [item.label, item.description || '', item.id, ...(item.keywords || []), ...tokens].join(' ')
}

export function textMatchesQuery(hay: string, query: string): boolean {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  const h = (hay || '').toLowerCase()
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => h.includes(part))
}

const SHORTCUT_EN: Array<[RegExp, string]> = [
  [/加粗/, 'bold'],
  [/斜体/, 'italic'],
  [/下划线/, 'underline'],
  [/删除线/, 'strike strikethrough'],
  [/链接/, 'link'],
  [/标题/, 'heading title'],
  [/正文/, 'paragraph body'],
  [/无序/, 'bullet unordered list'],
  [/有序/, 'ordered numbered list'],
  [/任务/, 'task todo checkbox'],
  [/引用/, 'quote blockquote'],
  [/行内代码/, 'inline code'],
  [/代码块/, 'code block'],
  [/斜杠/, 'slash command'],
  [/缩进/, 'indent outdent tab'],
  [/快捷键/, 'shortcut help'],
  [/撤销/, 'undo'],
  [/重做/, 'redo'],
  [/查找/, 'find replace search'],
  [/全选/, 'select all'],
  [/上移|下移/, 'move block'],
  [/复制当前块/, 'duplicate block'],
  [/目录/, 'outline toc'],
  [/公式/, 'formula math'],
  [/导出/, 'export markdown'],
  [/打印/, 'print pdf'],
  [/高亮/, 'highlight'],
  [/块的操作|块操作/, 'block menu'],
  [/提及/, 'mention at'],
  [/告示/, 'callout admonition'],
  [/表格/, 'table'],
  [/预览/, 'preview readonly'],
  [/折叠/, 'toggle fold collapse'],
  [/分割/, 'divider horizontal rule'],
]

export function shortcutSearchText(keys: string, desc: string): string {
  const source = `${keys} ${desc}`
  const extra = SHORTCUT_EN.filter(([re]) => re.test(source)).map(([, hint]) => hint)
  return `${source} ${extra.join(' ')}`
}

export function stepMenuIndex(index: number, count: number, key: string): number | null {
  if (count <= 0) return null
  if (key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export function mentionEmptyHint(query: string): string {
  const q = (query || '').trim()
  if (!q) return '输入姓名、标题或块名。↑↓ 选择，Enter 插入，Esc 关闭'
  return `没有「${q}」的匹配。继续输入，或按 Esc 关闭`
}

export function filterLabeledTargets<T extends { label: string; kind?: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = (query || '').trim()
  if (!q) return [...items]
  return items.filter((item) => {
    const kindEn =
      item.kind === 'heading'
        ? 'heading title'
        : item.kind === 'figure'
          ? 'figure image'
          : item.kind === 'table'
            ? 'table'
            : ''
    const kindZh =
      item.kind === 'heading' ? '标题' : item.kind === 'figure' ? '图' : item.kind === 'table' ? '表' : ''
    return textMatchesQuery(`${item.label} ${kindEn} ${kindZh} ${item.kind || ''}`, q)
  })
}
