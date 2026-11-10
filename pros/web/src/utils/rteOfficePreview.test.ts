// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import CFB from 'cfb'
import * as XLSX from 'xlsx'
import { previewDoc, previewDocx, previewSheets, sanitizePreviewHtml } from './rteOfficePreview'

function u32(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >> 8) & 0xff
  buf[offset + 2] = (value >> 16) & 0xff
  buf[offset + 3] = (value >> 24) & 0xff
}

function utf16(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[i * 2] = code & 0xff
    out[i * 2 + 1] = code >> 8
  }
  return out
}

function legacyDoc(body: string): Blob {
  const text = `${body}\r`
  const encoded = utf16(text)
  const filePos = 0x200
  const word = new Uint8Array(filePos + encoded.length)
  word[0] = 0xec
  word[1] = 0xa5
  u32(word, 0x004c, text.length)
  const table = new Uint8Array(21)
  table[0] = 2
  u32(table, 1, 16)
  u32(table, 5, 0)
  u32(table, 9, text.length)
  u32(table, 15, filePos)
  word.set(encoded, filePos)
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, 'WordDocument', word)
  CFB.utils.cfb_add(cfb, '0Table', table)
  const raw = CFB.write(cfb) as Uint8Array | number[] | string
  const bytes = typeof raw === 'string' ? Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff) : new Uint8Array(raw)
  return new Blob([bytes])
}

describe('办公文档预览', () => {
  it('去掉脚本，只保留表格和安全链接', () => {
    const html = sanitizePreviewHtml(
      '<p onclick="alert(1)">标题</p><script>alert(1)</script><a href="javascript:alert(1)">坏</a><a href="https://example.com/a">好</a><table><tr><td colspan="2">格</td></tr></table>',
    )
    expect(html).toContain('标题')
    expect(html).not.toContain('script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('https://example.com/a')
    expect(html).toContain('colspan="2"')
  })

  it('docx 按段落和表格排版', async () => {
    const zip = await import('jszip').then((mod) => new mod.default())
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    )
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    )
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
        <w:body>
          <w:p w14:paraId="36F5D964">
            <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
            <w:r><w:instrText>TOC \\o "1-2"</w:instrText></w:r>
            <w:r><w:t>调研报告</w:t></w:r>
          </w:p>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>名称</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>V01</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`,
    )
    const html = await previewDocx(await zip.generateAsync({ type: 'blob' }))
    expect(html).toContain('调研报告')
    expect(html).toContain('V01')
    expect(html).toContain('<table>')
    expect(html).not.toContain('paraId')
    expect(html).not.toContain('HYPERLINK')
    expect(html).not.toContain('TOC')
  })

  it('旧版 doc 只保留正文', async () => {
    const html = await previewDoc(legacyDoc('调研报告\x13 HYPERLINK \x14可见标题\x15'))
    expect(html).toContain('调研报告')
    expect(html).toContain('可见标题')
    expect(html).not.toContain('HYPERLINK')
  })

  it('excel 按工作表输出表格', async () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['名称', '数量'], ['报告', 2]]), '明细')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['合计', 2]]), '汇总')
    const written = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const copy = new Uint8Array(written.byteLength)
    copy.set(new Uint8Array(written))
    const sheets = await previewSheets(new Blob([copy.buffer]))
    expect(sheets.map((sheet) => sheet.name)).toEqual(['明细', '汇总'])
    expect(sheets[0]?.html).toContain('报告')
    expect(sheets[0]?.html).toContain('<table>')
    expect(sheets[1]?.html).toContain('合计')
  })
})
