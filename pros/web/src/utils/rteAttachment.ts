import JSZip from 'jszip'
import { getToken } from '../api/http'
import { mediaFetchUrl } from './mediaPath'

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

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'docx' | 'file'

export function attachmentKind(name: string, mime: string): AttachmentKind {
  const fileName = name.toLowerCase()
  const type = mime.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileName)) return 'image'
  if (type === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf'
  if (
    type.startsWith('text/')
    || type === 'application/json'
    || /\.(txt|md|markdown|json|csv|log)$/.test(fileName)
  ) {
    return 'text'
  }
  if (type.includes('wordprocessingml') || fileName.endsWith('.docx')) return 'docx'
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

/** 从 docx 里抽出正文，供页面预览。 */
export async function docxPlainText(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return ''
  return xml
    .replace(/<w:p[^>]*\/>/g, '\n')
    .replace(/<w:p[\s>]/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
