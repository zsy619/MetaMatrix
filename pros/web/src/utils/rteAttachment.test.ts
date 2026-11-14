// @vitest-environment happy-dom
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import {
  attachmentDownloadName,
  attachmentInsertHref,
  attachmentKind,
  attachmentKindFor,
  attachmentTable,
  attachmentText,
  docxPlainText,
  isAttachmentAnchor,
  loadAttachment,
  rteAttachmentUploadReject,
} from './rteAttachment'

describe('附件链接', () => {
  it('只接受素材路径和 http 链接', () => {
    expect(attachmentInsertHref('/media/asset-1')).toBe('/media/asset-1')
    expect(attachmentInsertHref('https://files.example.com/a.docx')).toBe('https://files.example.com/a.docx')
    expect(attachmentInsertHref('data:application/pdf;base64,QQ==')).toBeNull()
    expect(attachmentInsertHref('blob:http://localhost/abc')).toBeNull()
    expect(attachmentInsertHref('javascript:alert(1)')).toBeNull()
  })

  it('回形针链接和附件样式都能打开预览', () => {
    expect(isAttachmentAnchor('https://files.example.com/a.pdf', '📎 说明.pdf', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('/media/asset-1', '说明.pdf', 'rte-attachment-link rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://example.com', '普通链接', 'rte-link')).toBe(false)
    expect(isAttachmentAnchor('https://files.example.com/说明.pdf', '说明', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/预算.xlsx', '预算', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/讲解.mp3', '讲解', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/预算.csv', '预算', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/汇报.pptx', '汇报', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/汇报.ppsx', '放映', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/说明.rtf', '说明', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/文稿.odt', '文稿', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/文稿.pages', '文稿', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/书.epub', '书', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/书.azw3', '书', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/书.djvu', '书', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/片.mkv', '片', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.7z', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/稿.wps', '稿', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.zip', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.gz', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.bz2', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.xz', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.tar', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.zst', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.cab', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.lz4', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.lzma', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/盘.dmg', '盘', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.tgz', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/盘.iso', '盘', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/表.et', '表', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/包.rar', '包', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/片.avi', '片', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/画.cbz', '画', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/书.fb2', '书', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/书.mobi', '书', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/预算.numbers', '预算', 'rte-link')).toBe(true)
    expect(attachmentKind('说明.rtf', '')).toBe('text')
    expect(attachmentKind('宏.docm', '')).toBe('doc')
    expect(isAttachmentAnchor('https://files.example.com/宏.docm', '宏', 'rte-link')).toBe(true)
    expect(isAttachmentAnchor('https://files.example.com/readme.md', '说明', 'rte-link')).toBe(false)
  })

  it('超大文件和网页脚本不能上传，Word 可以', () => {
    expect(rteAttachmentUploadReject('说明.docx', '', 1024)).toBeNull()
    expect(rteAttachmentUploadReject('页.html', 'text/html', 100)).toMatch(/SVG|脚本/)
    expect(rteAttachmentUploadReject('大.zip', 'application/zip', 4 * 1024 * 1024)).toMatch(/3MB/)
  })

  it('CSV 预览成表格，引号里的逗号留在单元格里', () => {
    expect(attachmentTable('名称,金额\n"甲,乙",12\n', '预算.csv')).toEqual([
      ['名称', '金额'],
      ['甲,乙', '12'],
    ])
    expect(attachmentTable('只有一段话', '笔记.txt')).toEqual([])
    expect(attachmentTable('{"a":1,"b":2}', '数据.json')).toEqual([])
    expect(attachmentTable('你好,世界', '笔记.txt')).toEqual([])
    expect(attachmentTable('名称;金额\n甲;1,5\n', '预算.csv')).toEqual([
      ['名称', '金额'],
      ['甲', '1,5'],
    ])
    expect(attachmentTable('名称,说明\n甲,"第一行\n第二行",1\n', '预算.csv')).toEqual([
      ['名称', '说明', ''],
      ['甲', '第一行\n第二行', '1'],
    ])
  })

  it('按文件名和类型判断预览方式', () => {
    expect(attachmentKind('说明.docx', '')).toBe('docx')
    expect(attachmentKind('表.pdf', 'application/pdf')).toBe('pdf')
    expect(attachmentKind('图.png', 'image/png')).toBe('image')
    expect(attachmentKind('旧版.doc', 'application/msword')).toBe('doc')
    expect(attachmentKind('预算.xlsx', '')).toBe('sheet')
    expect(attachmentKind('旧表.xls', 'application/vnd.ms-excel')).toBe('sheet')
    expect(attachmentKind('讲解.mp3', '')).toBe('audio')
    expect(attachmentKind('演示.mp4', 'video/mp4')).toBe('video')
    expect(attachmentKindFor('说明', 'https://files.example.com/a.docx', 'application/octet-stream')).toBe('docx')
    expect(attachmentDownloadName('报告/说明?.pdf')).toBe('报告-说明-.pdf')
  })

  it('国标编码的文本按中文读出，UTF-8 保持原样', async () => {
    const gbk = new Blob([new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])])
    expect(await attachmentText(gbk)).toBe('中文')
    const utf8 = new Blob([new TextEncoder().encode('中文')])
    expect(await attachmentText(utf8)).toBe('中文')
  })

  it('用素材元数据里的签名地址取回文件', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input === '/api/media/asset-1') {
        return new Response(JSON.stringify({
          previewUrl: '/media/asset-1?exp=10&sig=ab',
          originalName: '说明.txt',
          mimeType: 'text/plain',
        }), { status: 200 })
      }
      if (input === '/api/media/asset-1?exp=10&sig=ab') {
        return new Response('预览正文', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response('', { status: 404 })
    })
    const loaded = await loadAttachment('/media/asset-1', '说明.txt', { fetch: fetchImpl, token: 'token' })
    expect(loaded.href).toBe('/media/asset-1')
    expect(loaded.kind).toBe('text')
    expect(await loaded.blob.text()).toBe('预览正文')
    expect(fetchImpl).toHaveBeenCalledWith('/api/media/asset-1', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('抽出 docx 正文，不带段落属性和域代码', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      '<w:document><w:body>' +
        '<w:p w14:paraId="36F5D964"><w:r><w:instrText>HYPERLINK \\l "section-1"</w:instrText></w:r>' +
        '<w:r><w:t>你好&amp;世界</w:t></w:r></w:p>' +
        '</w:body></w:document>',
    )
    const blob = await zip.generateAsync({ type: 'blob' })
    const text = await docxPlainText(blob)
    expect(text).toContain('你好&世界')
    expect(text).not.toContain('paraId')
    expect(text).not.toContain('HYPERLINK')
  })
})
