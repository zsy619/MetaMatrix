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

function parseOfficeXml(xml: string): Document | null {
  const normalized = xml
    .replace(/\s[a-zA-Z0-9]+:([a-zA-Z0-9:-]+)="/g, ' $1="')
    .replace(/<(\/?)[a-zA-Z0-9]+:/g, '<$1')
  const doc = new DOMParser().parseFromString(normalized, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return null
  return doc
}

function elementsNamed(root: Document | Element, name: string): Element[] {
  return [...root.getElementsByTagName('*')].filter((el) => localName(el) === name)
}

function renderDocxXml(xml: string): string {
  const doc = parseOfficeXml(xml)
  if (!doc) return ''
  const body = elementsNamed(doc, 'body')[0]
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

/** docx 转成可阅读的 HTML。字段代码和段落属性不会出现在正文里。 */
export async function previewDocx(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
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

const CFB_END = 0xfffffff0

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function sectorSlice(file: Uint8Array, sector: number, sectorSize: number): Uint8Array {
  const offset = (sector + 1) * sectorSize
  return file.subarray(offset, Math.min(file.length, offset + sectorSize))
}

/** 读 OLE 复合文档里的流。Word 和旧版 Excel 都用这个容器。 */
function readCompoundStreams(file: Uint8Array): Map<string, Uint8Array> {
  const streams = new Map<string, Uint8Array>()
  if (file.length < 512 || u32(file, 0) !== 0xe011cfd0 || u32(file, 4) !== 0xe11ab1a1) return streams
  const sectorSize = 1 << u16(file, 0x1e)
  const miniSize = 1 << u16(file, 0x20)
  const dirStart = u32(file, 0x30)
  const miniCutoff = u32(file, 0x38) || 4096
  const miniFatStart = u32(file, 0x3c)
  const difatStart = u32(file, 0x44)
  const difatCount = u32(file, 0x48)
  const fatSectors: number[] = []
  for (let index = 0; index < 109; index += 1) {
    const sector = u32(file, 0x4c + index * 4)
    if (sector < CFB_END) fatSectors.push(sector)
  }
  let difat = difatStart
  for (let index = 0; index < difatCount && difat < CFB_END; index += 1) {
    const sector = sectorSlice(file, difat, sectorSize)
    const entries = Math.floor(sector.length / 4) - 1
    for (let entry = 0; entry < entries; entry += 1) {
      const next = u32(sector, entry * 4)
      if (next < CFB_END) fatSectors.push(next)
    }
    difat = u32(sector, sector.length - 4)
  }
  const fat: number[] = []
  for (const sector of fatSectors) {
    const data = sectorSlice(file, sector, sectorSize)
    for (let offset = 0; offset + 4 <= data.length; offset += 4) fat.push(u32(data, offset))
  }
  const chain = (start: number): Uint8Array => {
    const parts: Uint8Array[] = []
    const seen = new Set<number>()
    let sector = start
    while (sector < CFB_END && !seen.has(sector)) {
      seen.add(sector)
      parts.push(sectorSlice(file, sector, sectorSize))
      sector = fat[sector] ?? CFB_END
    }
    return concatBytes(parts)
  }
  const directory = chain(dirStart)
  type DirEntry = { name: string; type: number; start: number; size: number }
  const entries: DirEntry[] = []
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = u16(directory, offset + 64)
    const name = decodeUtf16(directory.subarray(offset, offset + Math.max(0, Math.min(64, nameLength - 2))))
    entries.push({
      name: name.replace(/\u0000/g, ''),
      type: directory[offset + 66] || 0,
      start: u32(directory, offset + 116),
      size: u32(directory, offset + 120),
    })
  }
  const root = entries[0]
  const miniStream = root ? chain(root.start).subarray(0, root.size) : new Uint8Array()
  const miniFat: number[] = []
  if (miniFatStart < CFB_END) {
    const table = chain(miniFatStart)
    for (let offset = 0; offset + 4 <= table.length; offset += 4) miniFat.push(u32(table, offset))
  }
  const readMini = (start: number, size: number): Uint8Array => {
    const parts: Uint8Array[] = []
    const seen = new Set<number>()
    let sector = start
    let left = size
    while (left > 0 && sector < CFB_END && !seen.has(sector)) {
      seen.add(sector)
      const offset = sector * miniSize
      parts.push(miniStream.subarray(offset, offset + miniSize))
      left -= miniSize
      sector = miniFat[sector] ?? CFB_END
    }
    return concatBytes(parts).subarray(0, size)
  }
  for (const entry of entries) {
    if (entry.type !== 2 || !entry.name) continue
    const data = entry.size < miniCutoff
      ? readMini(entry.start, entry.size)
      : chain(entry.start).subarray(0, entry.size)
    streams.set(entry.name, data)
  }
  return streams
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
  const streams = readCompoundStreams(bytes)
  const word = streams.get('WordDocument')
  if (!word) return ''
  const flags = word.length > 0x0b ? u16(word, 0x0a) : 0
  const table = streams.get(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) return ''
  return textToHtml(pieceText(word, table))
}

const SHEET_ROWS = 200
const SHEET_COLS = 30

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0] || 'A'
  let index = 0
  for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

function gridHtml(rows: string[][], truncated: boolean): string {
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const note = truncated ? '<p>表格较大，这里只显示前 200 行、30 列。</p>' : ''
  return `${note}<table>${body}</table>`
}

function sharedStringList(doc: Document): string[] {
  return elementsNamed(doc, 'si').map((item) => elementsNamed(item, 't').map((node) => node.textContent || '').join(''))
}

function sheetGrid(xml: string, shared: string[]): { rows: string[][]; truncated: boolean } {
  const doc = parseOfficeXml(xml)
  if (!doc) return { rows: [], truncated: false }
  const grid = new Map<number, Map<number, string>>()
  let truncated = false
  let rowFallback = 0
  for (const row of elementsNamed(doc, 'row')) {
    const cells = childElements(row).filter((el) => localName(el) === 'c')
    for (const cell of cells) {
      const ref = cell.getAttribute('r') || ''
      const rowIndex = ref ? Number((/\d+$/.exec(ref) || ['1'])[0]) - 1 : rowFallback
      const colIndex = ref ? columnIndex(ref) : 0
      if (rowIndex >= SHEET_ROWS || colIndex >= SHEET_COLS) {
        truncated = true
        continue
      }
      const kind = (cell.getAttribute('t') || '').toLowerCase()
      let value = ''
      if (kind === 'inlinestr') {
        value = elementsNamed(cell, 't').map((node) => node.textContent || '').join('')
      } else {
        const raw = elementsNamed(cell, 'v')[0]?.textContent || ''
        if (kind === 's') value = shared[Number(raw)] || ''
        else if (kind === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
        else value = raw
      }
      if (!grid.has(rowIndex)) grid.set(rowIndex, new Map())
      grid.get(rowIndex)!.set(colIndex, value)
    }
    rowFallback += 1
  }
  const rowIndexes = [...grid.keys()].sort((a, b) => a - b)
  const rows = rowIndexes.map((rowIndex) => {
    const cols = grid.get(rowIndex)!
    const width = Math.min(SHEET_COLS, Math.max(...cols.keys()) + 1)
    return Array.from({ length: width }, (_, col) => cols.get(col) || '')
  })
  return { rows, truncated }
}

async function previewXlsx(buffer: ArrayBuffer): Promise<SheetPreview[]> {
  const zip = await JSZip.loadAsync(buffer)
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  if (!workbookXml) return []
  const workbook = parseOfficeXml(workbookXml)
  if (!workbook) return []
  const relXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  const rels = new Map<string, string>()
  if (relXml) {
    const relDoc = parseOfficeXml(relXml)
    if (relDoc) {
      for (const rel of elementsNamed(relDoc, 'relationship')) {
        const id = rel.getAttribute('Id') || rel.getAttribute('id') || ''
        const target = rel.getAttribute('Target') || rel.getAttribute('target') || ''
        if (id && target) rels.set(id, target.replace(/^\//, ''))
      }
    }
  }
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  const shared = sharedXml && parseOfficeXml(sharedXml) ? sharedStringList(parseOfficeXml(sharedXml)!) : []
  const sheets = elementsNamed(workbook, 'sheet')
  const previews: SheetPreview[] = []
  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index]!
    const name = sheet.getAttribute('name') || `Sheet${index + 1}`
    const rel = sheet.getAttribute('id') || ''
    const target = rels.get(rel) || `worksheets/sheet${index + 1}.xml`
    const path = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`
    const xml = await zip.file(path)?.async('string')
    if (!xml) continue
    const grid = sheetGrid(xml, shared)
    if (!grid.rows.length) continue
    previews.push({ name, html: gridHtml(grid.rows, grid.truncated) })
  }
  return previews
}

function biffText(book: Uint8Array): string[] {
  const found: string[] = []
  let offset = 0
  while (offset + 4 <= book.length && found.length < 500) {
    const type = u16(book, offset)
    const size = u16(book, offset + 2)
    if (size > book.length || offset + 4 + size > book.length) break
    const data = book.subarray(offset + 4, offset + 4 + size)
    if ((type === 0x0204 || type === 0x00fd) && data.length >= 8) {
      const text = type === 0x00fd ? '' : decodeBiffString(data.subarray(6))
      if (text.trim()) found.push(text.trim())
    }
    offset += 4 + size
  }
  return found
}

function decodeBiffString(data: Uint8Array): string {
  if (data.length < 3) return ''
  const chars = u16(data, 0)
  const flags = data[2] || 0
  const unicode = (flags & 0x01) !== 0
  const bytes = data.subarray(3, 3 + chars * (unicode ? 2 : 1))
  return unicode ? decodeUtf16(bytes) : decode1252(bytes)
}

/** xlsx / xlsm / xls 转成每张工作表一个表格。 */
export async function previewSheets(blob: Blob): Promise<SheetPreview[]> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return previewXlsx(buffer)
  const streams = readCompoundStreams(bytes)
  const book = streams.get('Workbook') || streams.get('Book')
  if (!book) return []
  const lines = biffText(book)
  if (!lines.length) return []
  return [{ name: 'Sheet1', html: gridHtml(lines.map((line) => [line]), false) }]
}
