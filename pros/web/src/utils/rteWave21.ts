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

/** 当前表复制为 CSV / TSV */
export function tableToDelimited(editor: Editor, delim: ',' | '\t'): string | null {
  const found = findTable(editor)
  if (!found) return null
  const rows: string[] = []
  found.table.forEach((row) => {
    if (row.type.name !== 'tableRow') return
    const cols: string[] = []
    row.forEach((cell) => {
      if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return
      let t = cellText(cell)
      if (delim === ',') {
        if (/[",\n\r]/.test(t)) t = `"${t.replace(/"/g, '""')}"`
      } else {
        t = t.replace(/\t/g, ' ').replace(/\n/g, ' ')
      }
      cols.push(t)
    })
    rows.push(cols.join(delim === ',' ? ',' : '\t'))
  })
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

/** 表格行筛选：按关键词隐藏不匹配的数据行（DOM 临时，不改文档） */
export function applyTableRowFilter(editor: Editor, query: string): number {
  const q = (query || '').trim().toLowerCase()
  const view = editor.view
  const found = findTable(editor)
  if (!found) return -1
  const tableDom = view.nodeDOM(found.pos) as HTMLElement | null
  if (!tableDom) return -1
  const trs = tableDom.querySelectorAll('tr')
  let hidden = 0
  trs.forEach((tr, idx) => {
    if (idx === 0) {
      ;(tr as HTMLElement).style.display = ''
      return
    }
    const text = (tr.textContent || '').toLowerCase()
    const show = !q || text.includes(q)
    ;(tr as HTMLElement).style.display = show ? '' : 'none'
    ;(tr as HTMLElement).dataset.rteFilterHide = show ? '0' : '1'
    if (!show) hidden += 1
  })
  return hidden
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
