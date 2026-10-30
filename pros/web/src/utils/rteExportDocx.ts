import JSZip from 'jszip'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 将纯文本拆成 Word 段落 XML */
function textToParagraphs(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (!lines.length) lines.push('')
  return lines
    .map((line) => {
      const t = xmlEscape(line)
      return `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
    })
    .join('')
}

/**
 * 用 JSZip 生成可打开的简易 .docx（OOXML）。
 * 不依赖 docx 包；保留标题 + 正文纯文本结构。
 */
export async function buildDocxBlob(opts: {
  title: string
  bodyText: string
}): Promise<Blob> {
  const title = (opts.title || '').trim() || '未命名文档'
  const body = opts.bodyText || ''
  const paragraphs =
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>` +
    textToParagraphs(body)

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
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
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels')?.file('.rels', rels)
  zip.folder('word')?.file('document.xml', documentXml)

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
