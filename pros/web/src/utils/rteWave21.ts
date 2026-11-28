import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'

export type ParaStyleId = 'body' | 'lead' | 'caption' | 'quote' | 'codeish' | 'small'

export const PARA_STYLE_OPTIONS: Array<{
  id: ParaStyleId
  label: string
  desc: string
}> = [
  { id: 'body', label: '正文', desc: '默认正文字号与段距' },
  { id: 'lead', label: '导语', desc: '略大字号、加段后距' },
  { id: 'caption', label: '题注体', desc: '小号灰色说明文字' },
  { id: 'quote', label: '引用体', desc: '斜体 + 左右缩进感' },
  { id: 'codeish', label: '等宽说明', desc: '等宽字体小字' },
  { id: 'small', label: '注释小字', desc: '更小字号' },
]

export function applyParagraphStyle(editor: Editor, id: ParaStyleId): boolean {
  const chain = editor.chain().focus()
  switch (id) {
    case 'body':
      return chain.setFontSize('16px').setLineHeight('1.75').run()
    case 'lead':
      return chain.setFontSize('18px').setLineHeight('1.8').run()
    case 'caption':
      return chain.setFontSize('13px').setColor('#86909c').setLineHeight('1.5').run()
    case 'quote':
      return chain.setFontSize('15px').setLineHeight('1.7').setMark('italic').run()
    case 'codeish':
      return chain.setFontFamily('ui-monospace, SFMono-Regular, Menlo, monospace').setFontSize('13px').run()
    case 'small':
      return chain.setFontSize('12px').setColor('#86909c').run()
    default:
      return false
  }
}

export const ORDERED_LIST_STYLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'decimal', label: '1. 2. 3.' },
  { value: 'lower-alpha', label: 'a. b. c.' },
  { value: 'upper-alpha', label: 'A. B. C.' },
  { value: 'lower-roman', label: 'i. ii. iii.' },
  { value: 'upper-roman', label: 'I. II. III.' },
  { value: 'cjk-ideographic', label: '一、二、三' },
]

export type HeadingIssue = {
  pos: number
  level: number
  text: string
  message: string
}

/** 标题层级检查：不允许跳级、空标题 */
export function checkHeadingHierarchy(editor: Editor): HeadingIssue[] {
  const issues: HeadingIssue[] = []
  let prevLevel = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level) || 1
    const text = node.textContent.trim()
    if (!text) {
      issues.push({ pos, level, text: '(空)', message: `H${level} 标题为空` })
    }
    if (prevLevel === 0 && level > 1) {
      issues.push({
        pos,
        level,
        text: text || '(空)',
        message: `文档以 H${level} 开头，建议从 H1 开始`,
      })
    } else if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        pos,
        level,
        text: text || '(空)',
        message: `从 H${prevLevel} 跳到 H${level}（跳级）`,
      })
    }
    prevLevel = level
  })
  return issues
}

export type LinkIssue = {
  pos: number
  href: string
  text: string
  message: string
  severity: 'empty' | 'invalid' | 'ok-unknown'
}

/** 死链 / 空链检查（本地规则；外网不强制探测以免 CORS） */
export function checkDocumentLinks(editor: Editor): LinkIssue[] {
  const issues: LinkIssue[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const linkMark = node.marks.find((m) => m.type.name === 'link')
    if (!linkMark) return
    const href = String(linkMark.attrs.href || '').trim()
    const text = node.text || ''
    if (!href) {
      issues.push({
        pos,
        href: '',
        text,
        message: '空链接（无 href）',
        severity: 'empty',
      })
      return
    }
    if (/^(javascript:|data:text\/html)/i.test(href)) {
      issues.push({
        pos,
        href,
        text,
        message: '不安全协议',
        severity: 'invalid',
      })
      return
    }
    if (!/^(https?:|mailto:|tel:|data:|blob:|#|\/)/i.test(href)) {
      issues.push({
        pos,
        href,
        text,
        message: '链接格式可能无效',
        severity: 'invalid',
      })
    }
  })
  // linkCard nodes
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'linkCard') return
    const href = String(node.attrs.href || '').trim()
    if (!href) {
      issues.push({
        pos,
        href: '',
        text: '网页卡',
        message: '网页卡缺少链接',
        severity: 'empty',
      })
    }
  })
  return issues
}

export function estimateReadingMinutes(charCount: number, cpm = 400): number {
  if (charCount <= 0) return 0
  return Math.max(1, Math.ceil(charCount / Math.max(100, cpm)))
}

function findTable(editor: Editor): { table: PmNode; pos: number } | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') return { table: node, pos: $from.before(d) }
  }
  return null
}

function cellText(cell: PmNode): string {
  return cell.textContent.trim()
}

/** 把合并单元格铺开，复制时列和屏幕上的列对齐。被跨过的格子留空。 */
function visualRowTexts(table: PmNode): string[][] {
  const grid: string[][] = []
  const occupied: boolean[][] = []
  let rowIndex = 0
  table.forEach((row) => {
    if (row.type.name !== 'tableRow') return
    let col = 0
    row.forEach((cell) => {
      if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return
      while (occupied[rowIndex]?.[col]) col += 1
      const text = cellText(cell)
      const colspan = Math.max(1, Number(cell.attrs.colspan) || 1)
      const rowspan = Math.max(1, Number(cell.attrs.rowspan) || 1)
      for (let down = 0; down < rowspan; down += 1) {
        if (!grid[rowIndex + down]) grid[rowIndex + down] = []
        if (!occupied[rowIndex + down]) occupied[rowIndex + down] = []
        for (let span = 0; span < colspan; span += 1) {
          const covered = grid[rowIndex + down]![col + span]
          grid[rowIndex + down]![col + span] = down === 0 && span === 0 ? text : (covered ?? '')
          occupied[rowIndex + down]![col + span] = true
        }
      }
      col += colspan
    })
    rowIndex += 1
  })
  const height = rowIndex
  const width = Math.max(0, ...grid.slice(0, height).map((line) => line.length))
  return Array.from({ length: height }, (_, index) => {
    const line = grid[index] ?? []
    return Array.from({ length: width }, (_, col) => line[col] ?? '')
  })
}

/** 当前表复制为 CSV / TSV */
export function tableToDelimited(editor: Editor, delim: ',' | '\t'): string | null {
  const found = findTable(editor)
  if (!found) return null
  const sep = delim === ',' ? ',' : '\t'
  const rows = visualRowTexts(found.table).map((cols) =>
    cols
      .map((text) => {
        if (delim === ',') {
          if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
          return text
        }
        return text.replace(/\t/g, ' ').replace(/\n/g, ' ')
      })
      .join(sep),
  )
  return rows.join('\n')
}

export async function copyTableAs(editor: Editor, format: 'csv' | 'tsv'): Promise<boolean> {
  const text = tableToDelimited(editor, format === 'csv' ? ',' : '\t')
  if (text == null) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function findTablePos(editor: Editor): number | null {
  return findTable(editor)?.pos ?? null
}

function rowIsHeader(row: HTMLElement): boolean {
  const cells = [...row.children].filter((node) => node.tagName === 'TD' || node.tagName === 'TH')
  return cells.length > 0 && cells.every((node) => node.tagName === 'TH')
}

function rowStaysVisible(row: HTMLElement, index: number, headerEnd: number): boolean {
  if (index < headerEnd) return true
  const first = (row.querySelector('th, td')?.textContent || '').replace(/\s+/g, ' ').trim()
  return first === '合计' || first === 'SUM'
}

/** 筛选时忽略千分位逗号，让 1200 能对上 1,200。 */
export function tableFilterHaystack(text: string): string {
  return text.toLowerCase().replace(/[,，]/g, '')
}

function paintTableRows(tableDom: HTMLElement, query: string): number {
  const q = tableFilterHaystack((query || '').trim())
  const trs = [...tableDom.querySelectorAll('tr')] as HTMLElement[]
  let headerEnd = 0
  while (headerEnd < trs.length && rowIsHeader(trs[headerEnd]!)) headerEnd += 1
  let hidden = 0
  trs.forEach((row, idx) => {
    if (!q || rowStaysVisible(row, idx, headerEnd)) {
      row.style.display = ''
      delete row.dataset.rteFilterHide
      return
    }
    const text = tableFilterHaystack(row.textContent || '')
    const show = text.includes(q)
    row.style.display = show ? '' : 'none'
    row.dataset.rteFilterHide = show ? '0' : '1'
    if (!show) hidden += 1
  })
  return hidden
}

/** 按表格起点把筛选画到当前 DOM。表格不在该位置时返回 -1。不改文档。 */
export function paintTableFilterAt(editor: Editor, pos: number, query: string): number {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'table') return -1
  const tableDom = editor.view.nodeDOM(pos)
  if (!(tableDom instanceof HTMLElement)) return -1
  return paintTableRows(tableDom, query)
}

/** 表格行筛选：按关键词隐藏不匹配的数据行（只改当前 DOM，不改文档） */
export function applyTableRowFilter(editor: Editor, query: string): number {
  const pos = findTablePos(editor)
  if (pos == null) return -1
  return paintTableFilterAt(editor, pos, query)
}

type MappedTransaction = { mapping: { map: (pos: number, assoc?: number) => number } }

/**
 * 编辑器每次更新都会按文档重画表格，上次写在 tr 上的 display 会丢。
 * 用记住的表格位置跟过映射，在事务落地后再画一次。
 */
export function mapTableFilterPos(pos: number, transactions: readonly MappedTransaction[]): number {
  return transactions.reduce((at, tr) => tr.mapping.map(at, -1), pos)
}

export function clearTableRowFilter(editor: Editor): void {
  applyTableRowFilter(editor, '')
}

/** 图片压缩：限制最长边，输出 jpeg/png dataURL */
export function compressImageFile(
  file: File,
  opts?: { maxEdge?: number; quality?: number; mime?: string },
): Promise<{ dataUrl: string; width: number; height: number }> {
  const maxEdge = opts?.maxEdge ?? 1600
  const quality = opts?.quality ?? 0.82
  const mime = opts?.mime ?? (file.type === 'image/png' ? 'image/png' : 'image/jpeg')
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const scale = Math.min(1, maxEdge / Math.max(width, height))
      width = Math.max(1, Math.round(width * scale))
      height = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL(mime, quality)
      resolve({ dataUrl, width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('load'))
    }
    img.src = url
  })
}

export type RteSnippet = { id: string; title: string; body: string }

const SNIPPET_KEY = 'rte-snippets-v1'

export const DEFAULT_SNIPPETS: RteSnippet[] = [
  {
    id: 'disclaimer',
    title: '免责声明',
    body: '本文内容仅供参考，不构成任何建议；最终以正式文件为准。',
  },
  {
    id: 'meeting-open',
    title: '会议开场',
    body: '各位好，今天会议目标：1）同步进展 2）确认风险 3）明确下一步 owner 与截止日。',
  },
  {
    id: 'thanks',
    title: '致谢收尾',
    body: '感谢各位的时间与反馈。如有问题请随时联系。',
  },
]

export function loadSnippets(): RteSnippet[] {
  try {
    const raw = localStorage.getItem(SNIPPET_KEY)
    if (!raw) return [...DEFAULT_SNIPPETS]
    const parsed = JSON.parse(raw) as RteSnippet[]
    if (!Array.isArray(parsed) || !parsed.length) return [...DEFAULT_SNIPPETS]
    return parsed
  } catch {
    return [...DEFAULT_SNIPPETS]
  }
}

export function saveSnippets(list: RteSnippet[]) {
  localStorage.setItem(SNIPPET_KEY, JSON.stringify(list))
}

export const STATUS_CHIP_TONES = [
  { value: 'gray', label: '灰' },
  { value: 'blue', label: '蓝' },
  { value: 'green', label: '绿' },
  { value: 'orange', label: '橙' },
  { value: 'red', label: '红' },
  { value: 'purple', label: '紫' },
] as const

export const IMAGE_RADIUS_PRESETS = [
  { value: '', label: '直角' },
  { value: '4px', label: '小圆' },
  { value: '8px', label: '圆角' },
  { value: '16px', label: '大圆' },
  { value: '9999px', label: '胶囊' },
]

export const IMAGE_SHADOW_PRESETS = [
  { value: '', label: '无影' },
  { value: '0 2px 8px rgba(0,0,0,.12)', label: '轻影' },
  { value: '0 8px 24px rgba(0,0,0,.18)', label: '深影' },
]

export const IMAGE_BORDER_PRESETS = [
  { value: '', label: '无边' },
  { value: '1px solid #e5e6eb', label: '细边' },
  { value: '2px solid #5b8cff', label: '强调' },
]
