// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildDocxBlob } from './rteExportDocx'

const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
