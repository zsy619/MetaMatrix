// @vitest-environment happy-dom
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { attachmentInsertHref, attachmentKind, docxPlainText, loadAttachment } from './rteAttachment'

describe('附件链接', () => {
  it('只接受素材路径和 http 链接', () => {
    expect(attachmentInsertHref('/media/asset-1')).toBe('/media/asset-1')
    expect(attachmentInsertHref('https://files.example.com/a.docx')).toBe('https://files.example.com/a.docx')
    expect(attachmentInsertHref('data:application/pdf;base64,QQ==')).toBeNull()
    expect(attachmentInsertHref('blob:http://localhost/abc')).toBeNull()
    expect(attachmentInsertHref('javascript:alert(1)')).toBeNull()
  })

  it('按文件名和类型判断预览方式', () => {
    expect(attachmentKind('说明.docx', '')).toBe('docx')
    expect(attachmentKind('表.pdf', 'application/pdf')).toBe('pdf')
    expect(attachmentKind('图.png', 'image/png')).toBe('image')
    expect(attachmentKind('旧版.doc', 'application/msword')).toBe('doc')
    expect(attachmentKind('预算.xlsx', '')).toBe('sheet')
    expect(attachmentKind('旧表.xls', 'application/vnd.ms-excel')).toBe('sheet')
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
