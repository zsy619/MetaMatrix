// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildDocxBlob } from './rteExportDocx'

const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('脚注导出到 Word', () => {
  it('脚注写进 footnotes.xml，正文留下引用', async () => {
    const html = '<p>甲<sup class="rte-footnote" data-fn-text="注文" data-fn-n="1">1</sup></p>'
    const blob = await buildDocxBlob({ title: '注', bodyHtml: html })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const notes = await zip.file('word/footnotes.xml')?.async('string')
    const doc = await zip.file('word/document.xml')?.async('string')
    expect(notes).toContain('注文')
    expect(doc).toContain('footnoteReference')
  })
})

describe('高亮和分栏导出到 Word', () => {
  it('高亮块保留文字，分栏排成一行', async () => {
    const html = '<div data-type="callout">注意</div><div data-type="columns"><div>左</div><div>右</div></div>'
    const blob = await buildDocxBlob({ title: '块', bodyHtml: html })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const doc = await zip.file('word/document.xml')?.async('string')
    expect(doc).toContain('高亮')
    expect(doc).toContain('注意')
    expect(doc).toContain('<w:tbl>')
    expect(doc).toContain('左')
    expect(doc).toContain('右')
  })
})

describe('图片组导出到 Word', () => {
  it('两张及以上并排进同一行表格', async () => {
    const html =
      `<div data-type="image-group" class="rte-image-group">` +
      `<div class="rte-image-group-row">` +
      `<img src="${pixel}" alt="甲"><img src="${pixel}" alt="乙">` +
      `</div></div>`
    const blob = await buildDocxBlob({ title: '拼图', bodyHtml: html })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')?.async('string')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('descr="甲"')
    expect(xml).toContain('descr="乙"')
    expect(xml?.match(/<w:tr>/g)?.length).toBe(1)
  })
})
