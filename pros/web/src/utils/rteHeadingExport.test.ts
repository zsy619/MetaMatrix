// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildDocxBlob } from './rteExportDocx'
import { htmlToMarkdown } from './rteExportMd'
import { withHeadingNumbers } from './rteHeadingExport'

const source = '<h1>总览</h1><h2>范围</h2><h2>进度</h2><h1>附录</h1><h3>补充</h3><p>正文</p>'

describe('标题编号只出现在导出副本', () => {
  it('多级编号与屏幕计数器一致，重复导出相同，原文不变', () => {
    const once = withHeadingNumbers(source)
    const twice = withHeadingNumbers(source)
    expect(once).toBe(twice)
    expect(source).not.toContain('1. ')
    expect(once).toContain('>1. 总览<')
    expect(once).toContain('>1.1 范围<')
    expect(once).toContain('>1.2 进度<')
    expect(once).toContain('>2. 附录<')
    expect(once).toContain('>2.0.1 补充<')
    expect(htmlToMarkdown(once)).toContain('# 1. 总览')
    expect(htmlToMarkdown(once)).toContain('## 1.1 范围')
    expect(htmlToMarkdown(source)).toBe('# 总览\n\n## 范围\n\n## 进度\n\n# 附录\n\n### 补充\n\n正文\n')
  })

  it('Word 是 OOXML，编号写在标题文字里，不是 HTML 套壳', async () => {
    const blob = await buildDocxBlob({ title: '验收', bodyHtml: withHeadingNumbers(source) })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')?.async('string')
    expect(xml).toContain('<w:document')
    expect(xml).toContain('1. 总览')
    expect(xml).toContain('1.1 范围')
    expect(xml).not.toContain('<html')
    expect(source).not.toContain('1. 总览')
  })
})
