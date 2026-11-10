import JSZip from 'jszip'

export type SheetPreview = { name: string; html: string }

const ALLOWED = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'strong', 'em', 'b', 'i', 'u',
  'a', 'br', 'span', 'img', 'colgroup', 'col', 'sup', 'sub', 'blockquote',
])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'])

/** 只留下排版需要的标签，去掉脚本和外部地址。 */
export function sanitizePreviewHtml(html: string): string {
  const fullDocument = /<html[\s>]/i.test(html)
  const doc = new DOMParser().parseFromString(
    fullDocument ? html : `<div id="rte-preview-root">${html}</div>`,
    'text/html',
  )
  const root = fullDocument ? doc.body : doc.getElementById('rte-preview-root')
  if (!root) return ''
  const pending: Element[] = [...root.children]
  while (pending.length) {
    const el = pending.shift()
    if (!el?.parentNode) continue
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) {
      el.remove()
      continue
    }
    if (!ALLOWED.has(tag)) {
      const kids = [...el.childNodes]
      const parent = el.parentNode
      const ref = el.nextSibling
      el.remove()
      for (const kid of kids) {
        parent.insertBefore(kid, ref)
        if (kid.nodeType === Node.ELEMENT_NODE) pending.push(kid as Element)
      }
      continue
    }
    const href = el.getAttribute('href') || ''
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    const span: Record<string, string> = {}
    for (const attr of ['colspan', 'rowspan']) {
      const value = el.getAttribute(attr) || ''
      if (/^\d{1,3}$/.test(value)) span[attr] = value
    }
    ;[...el.attributes].forEach((attr) => el.removeAttribute(attr.name))
    if (tag === 'a' && /^https?:\/\//i.test(href)) {
      el.setAttribute('href', href)
      el.setAttribute('rel', 'noopener noreferrer')
      el.setAttribute('target', '_blank')
    }
    if (tag === 'img') {
      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(src) && src.length < 1_800_000) {
        el.setAttribute('src', src)
        el.setAttribute('alt', alt)
      } else {
        el.remove()
        continue
      }
    }
    for (const [attr, value] of Object.entries(span)) el.setAttribute(attr, value)
    pending.push(...[...el.children])
  }
  return root.innerHTML.trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToHtml(text: string): string {
  const blocks = text.replace(/\r/g, '\n').split(/\n/)
  const html = blocks
    .map((line) => line.trim())
    .filter((line, index, all) => line || (index > 0 && index < all.length - 1))
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('')
  return html
}

function localName(el: Element): string {
  return (el.localName || el.tagName).replace(/^.*:/, '').toLowerCase()
}

function childElements(el: Element): Element[] {
  return [...el.children]
}

function inlineText(el: Element): string {
  const name = localName(el)
  if (name === 'instrtext' || name === 'deltext' || name === 'pict' || name === 'drawing' || name === 'object') {
    return ''
  }
  if (name === 't') return el.textContent || ''
  if (name === 'tab') return '\t'
  if (name === 'br' || name === 'cr') return '\n'
  let out = ''
  for (const child of childElements(el)) out += inlineText(child)
  return out
}

function paragraphStyle(p: Element): string {
  for (const child of childElements(p)) {
    if (localName(child) !== 'ppr') continue
    for (const style of childElements(child)) {
      if (localName(style) === 'pstyle') return style.getAttribute('w:val') || style.getAttribute('val') || ''
    }
  }
  return ''
}

function renderParagraph(p: Element): string {
  const text = escapeHtml(inlineText(p).replace(/\s+$/g, ''))
  if (!text.trim()) return ''
  const style = paragraphStyle(p)
  const heading = /^(heading|标题)\s*(\d)$/i.exec(style)
  if (heading) {
    const level = Math.min(6, Math.max(1, Number(heading[2]) || 1))
    return `<h${level}>${text}</h${level}>`
  }
  return `<p>${text}</p>`
}

function renderTable(tbl: Element): string {
  const rows = childElements(tbl).filter((el) => localName(el) === 'tr')
  if (!rows.length) {
    const nested = [...tbl.getElementsByTagName('*')].filter((el) => localName(el) === 'tr' && el.parentElement && localName(el.parentElement) === 'tbl')
    if (!nested.length) return ''
    return renderRows(nested)
  }
  return renderRows(rows)
}

function renderRows(rows: Element[]): string {
  const body = rows
    .map((row) => {
      const cells = childElements(row).filter((el) => localName(el) === 'tc')
      const html = cells
        .map((cell) => {
          const inner = childElements(cell)
            .map((block) => (localName(block) === 'p' ? renderParagraph(block) : ''))
            .filter(Boolean)
            .join('')
          return `<td>${inner || '<br>'}</td>`
        })
        .join('')
      return html ? `<tr>${html}</tr>` : ''
    })
    .join('')
  return body ? `<table>${body}</table>` : ''
}

function renderDocxXml(xml: string): string {
  const normalized = xml
    .replace(/\s[a-zA-Z0-9]+:val="/g, ' val="')
    .replace(/\s[a-zA-Z0-9]+:[a-zA-Z0-9:-]+="[^"]*"/g, '')
    .replace(/<(\/?)[a-zA-Z0-9]+:/g, '<$1')
  const doc = new DOMParser().parseFromString(normalized, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return ''
  const body = [...doc.getElementsByTagName('*')].find((el) => localName(el) === 'body')
  if (!body) return ''
  return childElements(body)
    .map((el) => {
      const name = localName(el)
      if (name === 'p') return renderParagraph(el)
      if (name === 'tbl') return renderTable(el)
      return ''
    })
    .filter(Boolean)
    .join('')
}

type MammothImage = { contentType: string; read: (encoding: 'base64') => Promise<string> }
type MammothApi = {
  convertToHtml: (
    input: { arrayBuffer: ArrayBuffer },
    options?: { convertImage?: unknown },
  ) => Promise<{ value: string }>
  images?: { imgElement: (fn: (image: MammothImage) => Promise<{ src: string }>) => unknown }
}

async function mammothHtml(buffer: ArrayBuffer): Promise<string> {
  const mod = await import('mammoth')
  const mammoth = ((mod as { default?: MammothApi }).default || mod) as MammothApi
  const options = mammoth.images
    ? {
        convertImage: mammoth.images.imgElement(async (image) => {
          const b64 = await image.read('base64')
          if (b64.length > 1_500_000) return { src: '' }
          return { src: `data:${image.contentType};base64,${b64}` }
        }),
      }
    : undefined
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, options)
  return result.value || ''
}

/** docx 转成可阅读的 HTML。字段代码和段落属性不会出现在正文里。 */
export async function previewDocx(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  try {
    const html = sanitizePreviewHtml(await mammothHtml(buffer))
    if (html.replace(/<[^>]+>/g, '').trim()) return html
  } catch {
    /* 不完整的包改用正文 XML */
  }
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return ''
  return renderDocxXml(xml)
}

function u16(buf: Uint8Array, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8)
}

function u32(buf: Uint8Array, offset: number): number {
  return (
    buf[offset]! |
    (buf[offset + 1]! << 8) |
    (buf[offset + 2]! << 16) |
    (buf[offset + 3]! << 24)
  ) >>> 0
}

const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
}

function decode1252(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += CP1252[byte] || String.fromCharCode(byte)
  return text
}

function decodeUtf16(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode(bytes[i]! | (bytes[i + 1]! << 8))
  }
  return text
}

/** 去掉域指令，只留读者能看见的结果。 */
export function cleanWordText(raw: string): string {
  let out = ''
  let instruction = false
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    if (code === 0x13) {
      instruction = true
      continue
    }
    if (code === 0x14) {
      instruction = false
      continue
    }
    if (code === 0x15) {
      instruction = false
      continue
    }
    if (instruction) continue
    if (code === 0x0d || code === 0x0b) {
      out += '\n'
      continue
    }
    if (code === 0x07) {
      out += '\t'
      continue
    }
    if (code < 0x20 || code === 0x7f) continue
    out += ch
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

type CfbModule = {
  read: (data: Uint8Array, opts: { type: 'array' }) => unknown
  find: (cfb: unknown, path: string) => { content?: Uint8Array | number[] } | null
}

function cfbStream(cfb: CfbModule, container: unknown, name: string): Uint8Array | null {
  const entry = cfb.find(container, name) || cfb.find(container, `/${name}`)
  const content = entry?.content
  if (!content) return null
  return content instanceof Uint8Array ? content : new Uint8Array(content)
}

function pieceText(word: Uint8Array, table: Uint8Array): string {
  if (word.length < 0x1a6 || u16(word, 0) !== 0xa5ec) return ''
  let pos = u32(word, 0x01a2)
  if (pos >= table.length) return ''
  while (table[pos] === 1) {
    pos += 1
    if (pos + 2 > table.length) return ''
    const skip = u16(table, pos)
    pos += 2 + skip
  }
  if (table[pos] !== 2) return ''
  pos += 1
  const pieceTableSize = u32(table, pos)
  pos += 4
  if (pieceTableSize < 16 || (pieceTableSize - 4) % 12 !== 0) return ''
  const pieces = (pieceTableSize - 4) / 12
  let text = ''
  for (let index = 0; index < pieces; index += 1) {
    const fcPos = pos + (pieces + 1) * 4 + index * 8 + 2
    const cpStart = u32(table, pos + index * 4)
    const cpEnd = u32(table, pos + (index + 1) * 4)
    if (cpEnd < cpStart || fcPos + 4 > table.length) continue
    let filePos = u32(table, fcPos)
    const unicode = (filePos & 0x40000000) === 0
    if (!unicode) filePos = Math.floor((filePos & 0x3fffffff) / 2)
    const chars = cpEnd - cpStart
    const size = chars * (unicode ? 2 : 1)
    if (filePos + size > word.length) continue
    const slice = word.subarray(filePos, filePos + size)
    text += unicode ? decodeUtf16(slice) : decode1252(slice)
  }
  const bodyChars = u32(word, 0x004c)
  const body = bodyChars > 0 && bodyChars < text.length ? text.slice(0, bodyChars) : text
  return cleanWordText(body)
}

/** 旧版 .doc。若文件其实是 docx，按 docx 打开。 */
export async function previewDoc(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return previewDocx(new Blob([buffer]))
  const mod = await import('cfb')
  const cfb = ((mod as { default?: CfbModule }).default || mod) as CfbModule
  const container = cfb.read(bytes, { type: 'array' })
  const word = cfbStream(cfb, container, 'WordDocument')
  if (!word) return ''
  const flags = word.length > 0x0b ? u16(word, 0x0a) : 0
  const tableName = flags & 0x0200 ? '1Table' : '0Table'
  const table = cfbStream(cfb, container, tableName)
  if (!table) return ''
  return textToHtml(pieceText(word, table))
}

const SHEET_ROWS = 200
const SHEET_COLS = 30

/** xlsx / xlsm / xls 转成每张工作表一个表格。 */
export async function previewSheets(blob: Blob): Promise<SheetPreview[]> {
  const mod = await import('xlsx')
  const xlsx = ((mod as { default?: typeof import('xlsx') }).default || mod) as typeof import('xlsx')
  const book = xlsx.read(await blob.arrayBuffer(), { type: 'array' })
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]
    if (!sheet) return { name, html: '' }
    const ref = sheet['!ref']
    let note = ''
    if (ref) {
      const range = xlsx.utils.decode_range(ref)
      if (range.e.r >= SHEET_ROWS || range.e.c >= SHEET_COLS) {
        note = '<p>表格较大，这里只显示前 200 行、30 列。</p>'
        range.e.r = Math.min(range.e.r, SHEET_ROWS - 1)
        range.e.c = Math.min(range.e.c, SHEET_COLS - 1)
        sheet['!ref'] = xlsx.utils.encode_range(range)
      }
    }
    const html = sanitizePreviewHtml(xlsx.utils.sheet_to_html(sheet))
    return { name, html: `${note}${html}` }
  }).filter((sheet) => sheet.html.replace(/<[^>]+>/g, '').trim())
}
