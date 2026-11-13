import { getToken } from '../api/http'
import { MAX_ATTACHMENT_BYTES } from './attachmentPolicy'
import { mediaFetchUrl } from './mediaPath'
import { previewDocx } from './rteOfficePreview'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** 能写进文档的附件地址：素材库路径或 http(s) 链接。 */
export function attachmentInsertHref(src: string): string | null {
  const value = src.trim()
  if (!value || /^(data|blob):/i.test(value)) return null
  if (/^\/media\/[0-9a-zA-Z-]+$/.test(value)) return value
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.username || url.password) return null
      return url.toString()
    } catch {
      return null
    }
  }
  return null
}

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'docx' | 'doc' | 'sheet' | 'file'

export function attachmentKind(name: string, mime: string): AttachmentKind {
  const fileName = name.toLowerCase()
  const type = mime.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileName)) return 'image'
  if (type === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf'
  if (type.includes('wordprocessingml') || fileName.endsWith('.docx')) return 'docx'
  if (type === 'application/msword' || fileName.endsWith('.doc')) return 'doc'
  if (
    type.includes('spreadsheet')
    || type.includes('excel')
    || /\.(xlsx|xlsm|xls)$/.test(fileName)
  ) {
    return 'sheet'
  }
  if (
    type.startsWith('text/')
    || type === 'application/json'
    || /\.(txt|md|markdown|json|csv|log)$/.test(fileName)
  ) {
    return 'text'
  }
  return 'file'
}

export function attachmentDisplayName(name: string, href = ''): string {
  const cleaned = name.replace(/^📎\s*/, '').trim()
  if (cleaned) return cleaned.slice(0, 180)
  try {
    const path = new URL(href, 'https://attachment.local').pathname
    const base = decodeURIComponent(path.split('/').pop() || '')
    if (base) return base.slice(0, 180)
  } catch {
    /* 用默认名 */
  }
  return '附件'
}

const DANGEROUS_ATTACHMENT_EXT = new Set(['svg', 'html', 'htm', 'js', 'mjs', 'xhtml'])

/** 编辑器里上传附件：超大文件和网页脚本不收，Word、Excel、PDF、图片和文本可以。 */
export function rteAttachmentUploadReject(name: string, mime: string, size: number): string | null {
  if (size > MAX_ATTACHMENT_BYTES) {
    return `文件超过 3MB（当前 ${(size / 1024 / 1024).toFixed(1)}MB），请压缩后重试。`
  }
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const type = mime.toLowerCase()
  if (
    DANGEROUS_ATTACHMENT_EXT.has(ext)
    || type === 'image/svg+xml'
    || type === 'text/html'
    || type.includes('javascript')
  ) {
    return '为安全起见，不接受网页脚本或 SVG。请改用 PNG、PDF、Word 或 Excel。'
  }
  return null
}

/** 正文里的附件链接：带附件样式，或文字以回形针开头。 */
export function isAttachmentAnchor(href: string, text: string, className = ''): boolean {
  if (!attachmentInsertHref(href)) return false
  if (className.split(/\s+/).includes('rte-attachment-link')) return true
  return text.replace(/^\s+/, '').startsWith('📎')
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') return line.split(delimiter).map((cell) => cell.trim())
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

/** CSV 或 TSV 预览成表格。不是表格时返回空数组。 */
export function attachmentTable(text: string, name = ''): string[][] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = source.split('\n').filter((line) => line.trim())
  if (!lines.length) return []
  const fileName = name.toLowerCase()
  const sample = lines[0] || ''
  const delimiter = fileName.endsWith('.tsv') || (sample.split('\t').length > sample.split(',').length && sample.includes('\t'))
    ? '\t'
    : fileName.endsWith('.csv') || sample.includes(',')
      ? ','
      : ''
  if (!delimiter) return []
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter))
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return []
  return rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ''))
}

export type LoadedAttachment = {
  name: string
  mime: string
  href: string
  blob: Blob
  kind: AttachmentKind
}

type MediaMeta = {
  previewUrl?: string
  originalName?: string
  mimeType?: string
}

/** 按链接取回附件字节。素材库地址会先换签名预览地址。 */
export async function loadAttachment(
  href: string,
  nameHint = '',
  deps: { fetch?: FetchLike; token?: string | null } = {},
): Promise<LoadedAttachment> {
  const link = attachmentInsertHref(href)
  if (!link) throw new Error('附件地址不是可打开的链接')
  const fetchImpl = deps.fetch || fetch
  if (link.startsWith('/media/')) {
    const token = deps.token === undefined ? getToken() : deps.token
    if (!token) throw new Error('请登录后预览附件')
    const metaUrl = mediaFetchUrl(link)
    if (!metaUrl) throw new Error('附件地址不合法')
    const metaRes = await fetchImpl(metaUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!metaRes.ok) throw new Error('附件不存在或已失效')
    const meta = (await metaRes.json()) as MediaMeta
    const preview = mediaFetchUrl(String(meta.previewUrl || ''))
    if (!preview) throw new Error('附件缺少预览地址')
    const fileRes = await fetchImpl(preview, { headers: { Authorization: `Bearer ${token}` } })
    if (!fileRes.ok) throw new Error('附件读取失败')
    const blob = await fileRes.blob()
    const name = attachmentDisplayName(meta.originalName || nameHint, link)
    const mime = meta.mimeType || blob.type || ''
    return { name, mime, href: link, blob, kind: attachmentKind(name, mime) }
  }
  const res = await fetchImpl(link)
  if (!res.ok) throw new Error('附件读取失败')
  const blob = await res.blob()
  const name = attachmentDisplayName(nameHint, link)
  const mime = blob.type || ''
  return { name, mime, href: link, blob, kind: attachmentKind(name, mime) }
}

/** 从 docx 里抽出正文，不带字段代码和段落属性。 */
export async function docxPlainText(blob: Blob): Promise<string> {
  const html = await previewDocx(blob)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function downloadAttachment(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachmentDisplayName(name)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
