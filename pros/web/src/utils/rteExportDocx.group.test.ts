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

describe('标题、表头和题注导出到 Word', () => {
  it('六级标题、重复表头和题注各用自己的样式', async () => {
    const html =
      '<h6>细节</h6>' +
      '<table data-table-caption="表 1 销售">' +
      '<tr><th>月份</th><th>新增</th></tr>' +
      '<tr><td>一月</td><td>10</td></tr></table>' +
      `<img src="${pixel}" alt="趋势" data-caption="图 1 趋势">`
    const blob = await buildDocxBlob({ title: '样式', bodyHtml: html })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const doc = await zip.file('word/document.xml')?.async('string')
    const styles = await zip.file('word/styles.xml')?.async('string')
    expect(doc).toContain('Heading6')
    expect(doc).toContain('w:tblHeader')
    expect(doc).toContain('Caption')
    expect(doc).toContain('表 1 销售')
    expect(doc).toContain('图 1 趋势')
    expect(styles).toContain('heading 6')
    expect(styles).toContain('caption')
  })
})

describe('分页符导出到 Word', () => {
  it('分页符写成 Word 分页', async () => {
    const blob = await buildDocxBlob({ title: '页', bodyHtml: '<p>上</p><div class="rte-page-break" data-page-break="true"></div><p>下</p>' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const doc = await zip.file('word/document.xml')?.async('string')
    expect(doc).toContain('w:type="page"')
    expect(doc).toContain('上')
    expect(doc).toContain('下')
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
