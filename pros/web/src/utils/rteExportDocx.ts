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
}

type Run = { text: string; marks: InlineMark }

type Block =
  | { kind: 'p'; style?: string; runs: Run[]; indent?: number }
  | { kind: 'listItem'; ordered: boolean; level: number; runs: Run[] }
  | { kind: 'table'; rows: Run[][][] }

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
  return 'Heading4'
}

function parseIndent(el: HTMLElement): number {
  const raw = el.getAttribute('data-indent')
  if (raw) {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  return 0
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
    for (const tr of Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr, :scope > thead > tr'))) {
      const cells: Run[][] = []
      for (const cell of Array.from(tr.children)) {
        const ct = cell.tagName.toLowerCase()
        if (ct !== 'td' && ct !== 'th') continue
        const runs = collectRuns(cell)
        // bold header cells
        if (ct === 'th') {
          cells.push(runs.map((r) => ({ ...r, marks: { ...r.marks, bold: true } })))
        } else {
          cells.push(runs.length ? runs : [{ text: '', marks: {} }])
        }
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) blocks.push({ kind: 'table', rows })
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
      if (/^h[1-6]$/.test(tag)) {
        pushPara(node, headingStyle(parseInt(tag[1], 10)))
      } else if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
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
        walkTable(node)
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

function tableToXml(rows: Run[][][]): string {
  const gridCols = Math.max(...rows.map((r) => r.length), 1)
  const colW = Math.floor(9000 / gridCols)
  const tblGrid = `<w:tblGrid>${Array.from({ length: gridCols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`
  const rowXml = rows
    .map((row) => {
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
      return `<w:tr>${cells.join('')}</w:tr>`
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

function blocksToBodyXml(blocks: Block[]): string {
  const parts: string[] = []
  let needNumbering = false
  for (const b of blocks) {
    if (b.kind === 'listItem') needNumbering = true
  }
  for (const b of blocks) {
    if (b.kind === 'p') {
      parts.push(paraXml(b.runs, { style: b.style, indent: b.indent }))
    } else if (b.kind === 'listItem') {
      const numId = b.ordered ? 2 : 1
      parts.push(paraXml(b.runs, { numId, ilvl: Math.min(8, b.level) }))
    } else if (b.kind === 'table') {
      parts.push(tableToXml(b.rows))
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

  if (opts.bodyHtml && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(
        `<div id="rte-docx-root">${opts.bodyHtml}</div>`,
        'text/html',
      )
      const root = doc.getElementById('rte-docx-root') || doc.body
      const blocks = parseBlocks(root as HTMLElement)
      bodyXml = blocksToBodyXml(blocks)
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
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels')?.file('.rels', rels)
  const word = zip.folder('word')
  word?.file('document.xml', documentXml)
  word?.file('styles.xml', stylesXml())
  word?.file('numbering.xml', numberingXml())
  word?.folder('_rels')?.file('document.xml.rels', docRels)

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
