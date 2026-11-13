import type { Editor } from '@tiptap/core'

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

/** Excel 序列日：整数落在 1954–2118 之间才转换，避免把普通编号当成日期。 */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isInteger(serial) || serial < 20000 || serial > 80000) return null
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

function isDateHeader(text: string): boolean {
  return /日期|date/i.test(text.trim())
}

export function tsvToTableHtml(plain: string): string {
  const text = (plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines = text.split('\n')
  const rows = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/\s+$/, '').split('\t'))
  if (!rows.length) return '<p></p>'
  const dateCols = new Set<number>()
  rows[0]?.forEach((cell, index) => {
    if (isDateHeader(cell)) dateCols.add(index)
  })
  const body = rows
    .map((cells, rowIndex) => {
      const tds = cells
        .map((cell, index) => {
          let shown = cell
          if (rowIndex > 0 && dateCols.has(index) && /^\d+$/.test(cell.trim())) {
            shown = excelSerialToDate(Number(cell.trim())) || cell
          }
          const value = escapeHtmlText(shown)
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
            : item.kind === 'bookmark'
              ? 'bookmark'
              : ''
    const kindZh =
      item.kind === 'heading'
        ? '标题'
        : item.kind === 'figure'
          ? '图'
          : item.kind === 'table'
            ? '表'
            : item.kind === 'bookmark'
              ? '书签'
              : ''
    return textMatchesQuery(`${item.label} ${kindEn} ${kindZh} ${item.kind || ''}`, q)
  })
}

/** 制表符分隔。引号里的制表符和换行留在同一个格子。 */
function splitTsvGrid(plain: string): string[][] {
  const source = String(plain || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let quoted = false
  const pushRow = () => {
    row.push(current)
    if (row.some((cell) => cell.length > 0)) rows.push(row)
    row = []
    current = ''
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && char === '\t') {
      row.push(current)
      current = ''
      continue
    }
    if (!quoted && char === '\n') {
      pushRow()
      continue
    }
    current += char
  }
  pushRow()
  return rows
}

function cellSpan(cell: { attrs: { colspan?: unknown; rowspan?: unknown } }): { colspan: number; rowspan: number } {
  return {
    colspan: Math.max(1, Number(cell.attrs.colspan) || 1),
    rowspan: Math.max(1, Number(cell.attrs.rowspan) || 1),
  }
}

/** 子单元格在视觉网格里的起始列。上一行的 rowspan 会把后面的格子往右推。 */
function visualColumnAt(table: { forEach: (fn: (row: { forEach: (fn: (cell: { attrs: { colspan?: unknown; rowspan?: unknown } }) => void) => void }) => void) => void }, targetRow: number, targetChild: number): number {
  const occupied: boolean[][] = []
  let found = targetChild
  let rowIndex = 0
  table.forEach((rowNode) => {
    let visual = 0
    let child = 0
    rowNode.forEach((cellNode) => {
      while (occupied[rowIndex]?.[visual]) visual += 1
      if (rowIndex === targetRow && child === targetChild) found = visual
      const { colspan, rowspan } = cellSpan(cellNode)
      for (let down = 0; down < rowspan; down += 1) {
        if (!occupied[rowIndex + down]) occupied[rowIndex + down] = []
        for (let span = 0; span < colspan; span += 1) occupied[rowIndex + down]![visual + span] = true
      }
      visual += colspan
      child += 1
    })
    rowIndex += 1
  })
  return found
}

/** 光标已经在表格里时，按制表符把纯文本填进后面的格子。一次粘贴一步撤销。 */
export function pasteTsvIntoTable(editor: Editor, plain: string): boolean {
  const text = String(plain || '')
  if (!text.includes('\t')) return false
  const { state } = editor
  const $from = state.selection.$from
  let cellDepth = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name
    if (name === 'tableCell' || name === 'tableHeader') {
      cellDepth = depth
      break
    }
  }
  if (cellDepth < 2) return false
  const table = $from.node(cellDepth - 2)
  if (table.type.name !== 'table') return false
  const rows = splitTsvGrid(text)
  if (!rows.length) return false
  const tablePos = $from.before(cellDepth - 2)
  const startRow = $from.index(cellDepth - 2)
  const startCol = visualColumnAt(table, startRow, $from.index(cellDepth - 1))
  const header = table.child(0)
  const dateCols = new Set<number>()
  if (header) {
    let col = 0
    header.forEach((cell) => {
      if (/日期|date/i.test(cell.textContent)) dateCols.add(col)
      col += Math.max(1, Number(cell.attrs.colspan) || 1)
    })
  }
  const jobs: Array<{ from: number; to: number; text: string }> = []
  const occupied: boolean[][] = []
  let rowIndex = 0
  table.forEach((rowNode, rowOffset) => {
    const gridRow = rowIndex >= startRow ? rows[rowIndex - startRow] : undefined
    let visual = 0
    let pasteCol = 0
    rowNode.forEach((cellNode, cellOffset) => {
      while (occupied[rowIndex]?.[visual]) visual += 1
      const { colspan, rowspan } = cellSpan(cellNode)
      if (gridRow && visual >= startCol) {
        let value = gridRow[pasteCol]
        pasteCol += 1
        if (value != null) {
          if (dateCols.has(visual) && /^\d+$/.test(value.trim())) {
            value = excelSerialToDate(Number(value.trim())) || value
          }
          const cellPos = tablePos + 1 + rowOffset + 1 + cellOffset
          const para = cellNode.firstChild
          if (para) {
            jobs.push({
              from: cellPos + 2,
              to: cellPos + 1 + para.nodeSize - 1,
              text: value,
            })
          }
        }
      }
      for (let down = 0; down < rowspan; down += 1) {
        if (!occupied[rowIndex + down]) occupied[rowIndex + down] = []
        for (let span = 0; span < colspan; span += 1) occupied[rowIndex + down]![visual + span] = true
      }
      visual += colspan
    })
    rowIndex += 1
  })
  if (!jobs.length) return false
  let tr = state.tr
  jobs.sort((a, b) => b.from - a.from)
  for (const job of jobs) {
    const mappedFrom = tr.mapping.map(job.from)
    const mappedTo = tr.mapping.map(job.to)
    const next = job.text ? state.schema.text(job.text) : []
    tr = tr.replaceWith(mappedFrom, mappedTo, next)
  }
  editor.view.dispatch(tr)
  return true
}
