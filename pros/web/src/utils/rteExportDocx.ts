import JSZip from 'jszip'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type InlineMark = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  footnoteId?: string
}

type Run = { text: string; marks: InlineMark }

type Block =
  | { kind: 'p'; style?: string; runs: Run[]; indent?: number }
  | { kind: 'listItem'; ordered: boolean; level: number; runs: Run[] }
  | { kind: 'table'; rows: Run[][][]; header?: boolean }
  | { kind: 'image'; src: string; alt: string; width: number; height: number }
  | { kind: 'imageRow'; images: Array<{ src: string; alt: string; width: number; height: number }> }
  | { kind: 'pageBreak' }

/** Word 正文可用宽度（px，96dpi）：A4 去掉左右页边距。 */
const MAX_IMAGE_WIDTH_PX = 600
/** 1px = 9525 EMU。 */
const EMU_PER_PX = 9525

function mergeMarks(a: InlineMark, b: InlineMark): InlineMark {
  return { ...a, ...b }
}

function runsToXml(runs: Run[]): string {
  if (!runs.length) {
    return '<w:r><w:t xml:space="preserve"></w:t></w:r>'
  }
  return runs
    .map((r) => {
      const pr: string[] = []
      if (r.marks.bold) pr.push('<w:b/>')
      if (r.marks.italic) pr.push('<w:i/>')
      if (r.marks.underline) pr.push('<w:u w:val="single"/>')
      if (r.marks.strike) pr.push('<w:strike/>')
      if (r.marks.code) {
        pr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>')
        pr.push('<w:sz w:val="20"/>')
      }
      if (r.marks.footnoteId) {
        return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${r.marks.footnoteId}"/></w:r>`
      }
      const rPr = pr.length ? `<w:rPr>${pr.join('')}</w:rPr>` : ''
      return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`
    })
    .join('')
}

function paraXml(runs: Run[], opts?: { style?: string; indent?: number; numId?: number; ilvl?: number }): string {
  const pPrParts: string[] = []
  if (opts?.style) pPrParts.push(`<w:pStyle w:val="${opts.style}"/>`)
  if (opts?.numId != null) {
    pPrParts.push(
      `<w:numPr><w:ilvl w:val="${opts.ilvl ?? 0}"/><w:numId w:val="${opts.numId}"/></w:numPr>`,
    )
  }
  if (opts?.indent && opts.indent > 0) {
    const twips = opts.indent * 420
    pPrParts.push(`<w:ind w:left="${twips}"/>`)
  }
  const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join('')}</w:pPr>` : ''
  return `<w:p>${pPr}${runsToXml(runs)}</w:p>`
}

function collectRuns(node: Node, inherited: InlineMark = {}): Run[] {
  const out: Run[] = []
  const walk = (n: Node, marks: InlineMark) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent ?? ''
      if (t) out.push({ text: t, marks })
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement
    const tag = el.tagName.toLowerCase()
    let next = { ...marks }
    if (tag === 'strong' || tag === 'b') next = mergeMarks(next, { bold: true })
    if (tag === 'em' || tag === 'i') next = mergeMarks(next, { italic: true })
    if (tag === 'u') next = mergeMarks(next, { underline: true })
    if (tag === 's' || tag === 'strike' || tag === 'del') next = mergeMarks(next, { strike: true })
    if (tag === 'code') next = mergeMarks(next, { code: true })
    if (tag === 'br') {
      out.push({ text: '\n', marks })
      return
    }
    if (el.hasAttribute('data-fn-text')) {
      const id = el.getAttribute('data-fn-export-id') || '1'
      out.push({ text: '', marks: { ...marks, footnoteId: id } })
      return
    }
    // skip script/style
    if (tag === 'script' || tag === 'style') return
    for (const child of Array.from(el.childNodes)) walk(child, next)
  }
  walk(node, inherited)
  return out
}

function headingStyle(level: number): string {
  if (level <= 1) return 'Heading1'
  if (level === 2) return 'Heading2'
  if (level === 3) return 'Heading3'
  if (level === 4) return 'Heading4'
  if (level === 5) return 'Heading5'
  return 'Heading6'
}

function parseIndent(el: HTMLElement): number {
  const raw = el.getAttribute('data-indent')
  if (raw) {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  return 0
}

/** 从 style 里取 px 尺寸（导出快照图带的是 `width:640px;height:320px`）。 */
function stylePx(el: HTMLElement, prop: 'width' | 'height'): number {
  const style = el.getAttribute('style') || ''
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([0-9.]+)px`, 'i').exec(style)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 造一个图片块（宽度超出版心时等比缩放）。 */
function imageBlockFrom(el: HTMLElement): Block {
  const src = el.getAttribute('src') || ''
  const alt = el.getAttribute('alt') || '图片'
  const attrNum = (name: string) => {
    const raw = Number(el.getAttribute(name) || '')
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  }
  let width = attrNum('data-width') || stylePx(el, 'width') || MAX_IMAGE_WIDTH_PX
  let height = attrNum('data-height') || stylePx(el, 'height') || Math.round((width / MAX_IMAGE_WIDTH_PX) * 320)
  if (width > MAX_IMAGE_WIDTH_PX) {
    const ratio = MAX_IMAGE_WIDTH_PX / width
    width = MAX_IMAGE_WIDTH_PX
    height = Math.max(1, Math.round(height * ratio))
  }
  return { kind: 'image', src, alt, width: Math.round(width), height: Math.round(height) }
}

function pushCaption(blocks: Block[], text: string) {
  const caption = text.trim()
  if (!caption) return
  blocks.push({ kind: 'p', style: 'Caption', runs: [{ text: caption, marks: {} }] })
}

function pushImage(blocks: Block[], el: HTMLElement) {
  blocks.push(imageBlockFrom(el))
  pushCaption(blocks, el.getAttribute('data-caption') || '')
}

function parseBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = []

  const pushPara = (el: HTMLElement, style?: string) => {
    const runs = collectRuns(el)
    // collapse pure whitespace paragraphs still keep one empty for spacing
    const text = runs.map((r) => r.text).join('')
    if (!text.trim() && !style) {
      blocks.push({ kind: 'p', runs: [{ text: '', marks: {} }] })
      return
    }
    blocks.push({
      kind: 'p',
      style,
      runs: runs.length ? runs : [{ text: '', marks: {} }],
      indent: parseIndent(el),
    })
  }

  const walkList = (listEl: HTMLElement, ordered: boolean, level: number) => {
    for (const child of Array.from(listEl.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag !== 'li') continue
      const li = child as HTMLElement
      // separate nested lists
      const nested: HTMLElement[] = []
      const clone = li.cloneNode(true) as HTMLElement
      for (const n of Array.from(clone.querySelectorAll('ul,ol'))) {
        nested.push(n as HTMLElement)
        n.remove()
      }
      const runs = collectRuns(clone)
      if (listEl.getAttribute('data-type') === 'taskList') {
        const box = li.getAttribute('data-checked') === 'true' ? '☑ ' : '☐ '
        runs.unshift({ text: box, marks: {} })
      }
      blocks.push({
        kind: 'listItem',
        ordered,
        level,
        runs: runs.length ? runs : [{ text: '', marks: {} }],
      })
      for (const n of nested) {
        walkList(n, n.tagName.toLowerCase() === 'ol', level + 1)
      }
    }
  }

  const walkTable = (table: HTMLElement) => {
    const rows: Run[][][] = []
    let header = false
    const rowEls = Array.from(table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'))
    rowEls.forEach((tr, index) => {
      const cells: Run[][] = []
      const kids = Array.from(tr.children).filter((cell) => {
        const ct = cell.tagName.toLowerCase()
        return ct === 'td' || ct === 'th'
      })
      if (index === 0 && kids.length && (tr.parentElement?.tagName === 'THEAD' || kids.every((cell) => cell.tagName === 'TH'))) {
        header = true
      }
      for (const cell of kids) {
        const ct = cell.tagName.toLowerCase()
        const runs = collectRuns(cell)
        if (ct === 'th') {
          cells.push(runs.map((r) => ({ ...r, marks: { ...r.marks, bold: true } })))
        } else {
          cells.push(runs.length ? runs : [{ text: '', marks: {} }])
        }
      }
      if (cells.length) rows.push(cells)
    })
    if (rows.length) blocks.push({ kind: 'table', rows, header })
  }

  const visit = (el: HTMLElement) => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent || '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: 'p', runs: [{ text: t, marks: {} }] })
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const node = child as HTMLElement
      const tag = node.tagName.toLowerCase()
      if (node.getAttribute('data-page-break') === 'true' || node.classList.contains('rte-page-break')) {
        blocks.push({ kind: 'pageBreak' })
        continue
      }
      if (node.getAttribute('data-type') === 'callout' || node.classList.contains('rte-callout')) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        blocks.push({ kind: 'p', runs: [{ text: text ? `【高亮】${text}` : '【高亮】', marks: { bold: true } }] })
        continue
      }
      if (node.getAttribute('data-type') === 'columns' || node.classList.contains('rte-columns')) {
        const cols = Array.from(node.children).map((col) => (col.textContent || '').replace(/\s+/g, ' ').trim())
        if (cols.length >= 2) {
          blocks.push({
            kind: 'table',
            rows: [cols.map((text) => [{ text, marks: {} }])],
          })
          continue
        }
      }
      if (node.getAttribute('data-type') === 'image-group' || node.classList.contains('rte-image-group')) {
        const imgs = Array.from(node.querySelectorAll('img'))
        if (imgs.length >= 2) {
          const share = Math.max(80, Math.floor(MAX_IMAGE_WIDTH_PX / imgs.length))
          blocks.push({
            kind: 'imageRow',
            images: imgs.map((img) => {
              const block = imageBlockFrom(img)
              if (block.kind !== 'image') return { src: '', alt: '图片', width: share, height: share }
              const ratio = block.height / Math.max(1, block.width)
              return { src: block.src, alt: block.alt, width: share, height: Math.max(1, Math.round(share * ratio)) }
            }),
          })
          continue
        }
      }
      if (/^h[1-6]$/.test(tag)) {
        pushPara(node, headingStyle(parseInt(tag[1], 10)))
      } else if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
        // 段里直接放图片（图表快照）：按图片块处理，不丢图
        const images = Array.from(node.querySelectorAll('img'))
        if (images.length) {
          for (const img of images) pushImage(blocks, img as HTMLElement)
          if (tag === 'p') {
            // 图已经单独成块；段里还有文字才再补一个文字段
            const text = collectRuns(node)
              .map((r) => r.text)
              .join('')
              .trim()
            if (text) pushPara(node)
            continue
          }
        }
        // if div only wraps block children, descend
        const hasBlock = Array.from(node.children).some((c) =>
          /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(c.tagName),
        )
        if (tag === 'div' && hasBlock) visit(node)
        else pushPara(node)
      } else if (tag === 'ul') {
        walkList(node, false, 0)
      } else if (tag === 'ol') {
        walkList(node, true, 0)
      } else if (tag === 'table') {
        pushCaption(blocks, node.getAttribute('data-table-caption') || '')
        walkTable(node)
      } else if (tag === 'img') {
        // 图片（图表快照就是图片）：走 media 关系内嵌，不落成占位文案
        pushImage(blocks, node)
      } else if (tag === 'pre' || tag === 'code') {
        const runs = collectRuns(node, { code: true })
        blocks.push({ kind: 'p', runs: runs.length ? runs : [{ text: '', marks: {} }] })
      } else if (tag === 'hr') {
        blocks.push({ kind: 'p', runs: [{ text: '────────', marks: {} }] })
      } else {
        visit(node)
      }
    }
  }

  visit(root)
  return blocks
}

function tableToXml(rows: Run[][][], header = false): string {
  const gridCols = Math.max(...rows.map((r) => r.length), 1)
  const colW = Math.floor(9000 / gridCols)
  const tblGrid = `<w:tblGrid>${Array.from({ length: gridCols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`
  const rowXml = rows
    .map((row, index) => {
      const cells = []
      for (let i = 0; i < gridCols; i++) {
        const runs = row[i] || [{ text: '', marks: {} }]
        cells.push(
          `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:tcBorders>` +
            `<w:top w:val="single" w:sz="4" w:color="auto"/>` +
            `<w:left w:val="single" w:sz="4" w:color="auto"/>` +
            `<w:bottom w:val="single" w:sz="4" w:color="auto"/>` +
            `<w:right w:val="single" w:sz="4" w:color="auto"/>` +
            `</w:tcBorders></w:tcPr><w:p>${runsToXml(runs)}</w:p></w:tc>`,
        )
      }
      const repeat = header && index === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
      return `<w:tr>${repeat}${cells.join('')}</w:tr>`
    })
    .join('')
  return (
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>` +
    `<w:top w:val="single" w:sz="4" w:color="auto"/>` +
    `<w:left w:val="single" w:sz="4" w:color="auto"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="auto"/>` +
    `<w:right w:val="single" w:sz="4" w:color="auto"/>` +
    `<w:insideH w:val="single" w:sz="4" w:color="auto"/>` +
    `<w:insideV w:val="single" w:sz="4" w:color="auto"/>` +
    `</w:tblBorders></w:tblPr>${tblGrid}${rowXml}</w:tbl>`
  )
}

/** data URL → 二进制（图片内嵌进 docx 用）。 */
type MediaData = { bytes: Uint8Array; ext: string; mime: string }

function extForMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/svg+xml') return 'svg'
  if (mime === 'image/bmp') return 'bmp'
  return 'png'
}

/** 文件后缀 → [Content_Types].xml 里的 MIME。 */
function mimeForExt(ext: string): string {
  if (ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'bmp') return 'image/bmp'
  return 'image/png'
}

function dataUrlToMedia(src: string): MediaData | null {
  const match = /^data:([^;,]+)?((?:;[^,]*)*),(.*)$/s.exec(src || '')
  if (!match) return null
  const mime = (match[1] || 'image/png').toLowerCase()
  const params = match[2] || ''
  const payload = match[3] || ''
  const ext = extForMime(mime)
  if (!/;base64/i.test(params)) {
    let text = payload
    try {
      text = decodeURIComponent(payload)
    } catch {
      text = payload
    }
    return { bytes: new TextEncoder().encode(text), ext, mime }
  }
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return { bytes, ext, mime }
  } catch {
    return null
  }
}

/** 内嵌图片的 OOXML（w:drawing → a:blip r:embed）。 */
function imageXml(opts: {
  rid: string
  id: number
  name: string
  descr: string
  width: number
  height: number
}): string {
  const cx = Math.max(1, Math.round(opts.width * EMU_PER_PX))
  const cy = Math.max(1, Math.round(opts.height * EMU_PER_PX))
  const name = xmlEscape(opts.name)
  const descr = xmlEscape(opts.descr)
  return (
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${opts.id}" name="${name}" descr="${descr}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${opts.id}" name="${name}" descr="${descr}"/>` +
    `<pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${opts.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  )
}

function blocksToBodyXml(
  blocks: Block[],
  resolveImage?: (block: Extract<Block, { kind: 'image' }>) => { rid: string } | null,
): string {
  const parts: string[] = []
  let needNumbering = false
  for (const b of blocks) {
    if (b.kind === 'listItem') needNumbering = true
  }
  let imageIndex = 0
  for (const b of blocks) {
    if (b.kind === 'pageBreak') {
      parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    } else if (b.kind === 'p') {
      parts.push(paraXml(b.runs, { style: b.style, indent: b.indent }))
    } else if (b.kind === 'listItem') {
      const numId = b.ordered ? 2 : 1
      parts.push(paraXml(b.runs, { numId, ilvl: Math.min(8, b.level) }))
    } else if (b.kind === 'table') {
      parts.push(tableToXml(b.rows, b.header))
    } else if (b.kind === 'imageRow') {
      const colW = Math.floor(9000 / Math.max(1, b.images.length))
      const cells = b.images.map((img) => {
        const resolved = resolveImage?.({ kind: 'image', ...img }) ?? null
        let inner = paraXml([{ text: img.alt || '图片', marks: {} }])
        if (resolved) {
          imageIndex += 1
          inner = imageXml({
            rid: resolved.rid,
            id: imageIndex,
            name: `Picture ${imageIndex}`,
            descr: img.alt,
            width: img.width,
            height: img.height,
          })
        }
        return (
          `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>` +
          `<w:tcBorders>` +
          `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>` +
          `</w:tcBorders></w:tcPr>${inner}</w:tc>`
        )
      })
      parts.push(
        `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
          `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>` +
          `<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
          `</w:tblPr><w:tblGrid>${b.images.map(() => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>` +
          `<w:tr>${cells.join('')}</w:tr></w:tbl>`,
      )
    } else if (b.kind === 'image') {
      const resolved = resolveImage?.(b) ?? null
      if (resolved) {
        imageIndex += 1
        parts.push(
          imageXml({
            rid: resolved.rid,
            id: imageIndex,
            name: `Picture ${imageIndex}`,
            descr: b.alt,
            width: b.width,
            height: b.height,
          }),
        )
      } else {
        // 不是 data URL（外链图）就没法内嵌，退化成一行说明文字
        parts.push(paraXml([{ text: b.alt || '图片', marks: {} }]))
      }
    }
  }
  void needNumbering
  return parts.join('')
}

function numberingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%3."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`
}

/**
 * 用 JSZip 生成可打开的 .docx（OOXML）。
 * 支持：标题层级、粗/斜/下划线/删除线、列表、基础表格；亦可回退纯文本。
 */
export async function buildDocxBlob(opts: {
  title: string
  /** @deprecated 纯文本回退；优先用 bodyHtml */
  bodyText?: string
  bodyHtml?: string
}): Promise<Blob> {
  const title = (opts.title || '').trim() || '未命名文档'
  let bodyXml = ''
  /** 内嵌图片：zip 内文件名 + 二进制。 */
  const mediaFiles: { name: string; bytes: Uint8Array; ext: string }[] = []
  const mediaRels: { id: string; target: string }[] = []
  let footnotesXml = ''

  if (opts.bodyHtml && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(
        `<div id="rte-docx-root">${opts.bodyHtml}</div>`,
        'text/html',
      )
      const root = doc.getElementById('rte-docx-root') || doc.body
      const footnotes: Array<{ id: string; text: string }> = []
      root.querySelectorAll('[data-fn-text]').forEach((el) => {
        if (el.getAttribute('data-fn-place') === 'end') return
        const id = String(footnotes.length + 1)
        el.setAttribute('data-fn-export-id', id)
        footnotes.push({ id, text: el.getAttribute('data-fn-text') || '' })
      })
      const endnotes: string[] = []
      root.querySelectorAll('[data-fn-place="end"]').forEach((el, index) => {
        endnotes.push(`${index + 1}. ${el.getAttribute('data-fn-text') || ''}`)
      })
      const blocks = parseBlocks(root as HTMLElement)
      if (footnotes.length) {
        const notesXml = footnotes
          .map(
            (note) =>
              `<w:footnote w:id="${note.id}"><w:p><w:r><w:t>${xmlEscape(note.text)}</w:t></w:r></w:p></w:footnote>`,
          )
          .join('')
        footnotesXml =
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
          `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>` +
          `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>` +
          notesXml +
          `</w:footnotes>`
      }
      // 图片块 → media 关系（rId3 起，避开 styles / numbering）
      let mediaSeq = 0
      const resolveImage = (block: Extract<Block, { kind: 'image' }>) => {
        const data = dataUrlToMedia(block.src)
        if (!data) return null
        mediaSeq += 1
        const rid = `rId${2 + mediaSeq}`
        const fileName = `image${mediaSeq}.${data.ext}`
        mediaFiles.push({ name: fileName, bytes: data.bytes, ext: data.ext })
        mediaRels.push({ id: rid, target: `media/${fileName}` })
        return { rid }
      }
      bodyXml = blocksToBodyXml(blocks, resolveImage)
      if (endnotes.length) {
        bodyXml += paraXml([{ text: '尾注', marks: { bold: true } }])
        bodyXml += endnotes.map((line) => paraXml([{ text: line, marks: {} }])).join('')
      }
    } catch {
      bodyXml = ''
    }
  }

  if (!bodyXml) {
    const text = opts.bodyText || ''
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    if (!lines.length) lines.push('')
    bodyXml = lines
      .map((line) => paraXml([{ text: line, marks: {} }]))
      .join('')
  }

  const paragraphs =
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>` +
    bodyXml

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const mediaDefaults = Array.from(new Set(mediaFiles.map((item) => item.ext)))
    .map((ext) => `<Default Extension="${ext}" ContentType="${mimeForExt(ext)}"/>`)
    .join('')

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${mediaDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  ${footnotesXml ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const mediaRelXml = mediaRels
    .map(
      (item) =>
        `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${item.target}"/>`,
    )
    .join('')

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  ${footnotesXml ? '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' : ''}
  ${mediaRelXml}
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels')?.file('.rels', rels)
  const word = zip.folder('word')
  word?.file('document.xml', documentXml)
  word?.file('styles.xml', stylesXml())
  word?.file('numbering.xml', numberingXml())
  if (footnotesXml) word?.file('footnotes.xml', footnotesXml)
  word?.folder('_rels')?.file('document.xml.rels', docRels)
  for (const media of mediaFiles) {
    word?.folder('media')?.file(media.name, media.bytes)
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
