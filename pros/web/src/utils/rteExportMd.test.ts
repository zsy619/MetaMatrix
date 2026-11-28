// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, withExternalLinkRel } from './rteExportMd'

describe('导出 Markdown 和 HTML 链接', () => {
  it('代码块带上语言，公式使用美元符', () => {
    const md = htmlToMarkdown(
      '<pre><code class="hljs language-ts">const n = 1</code></pre>' +
        '<p>行内<span data-type="math-inline" data-tex="a+b">a+b</span></p>' +
        '<div data-type="math-display" data-tex="x^2"></div>',
    )
    expect(md).toContain('```ts')
    expect(md).toContain('$a+b$')
    expect(md).toContain('$$\nx^2\n$$')
  })

  it('带链接的图片导出成可点的图片', () => {
    const md = htmlToMarkdown(
      '<img src="https://example.com/a.png" alt="说明" data-href="https://example.com/doc" data-caption="季度趋势">',
    )
    expect(md).toContain('[![说明](https://example.com/a.png)](https://example.com/doc)')
    expect(md).toContain('季度趋势')
  })

  it('替代文本和题注一样时只写一次', () => {
    const md = htmlToMarkdown('<img src="https://example.com/a.png" alt="季度趋势" data-caption="季度趋势">')
    expect(md).toContain('![季度趋势](https://example.com/a.png)')
    expect(md.match(/季度趋势/g)).toHaveLength(1)
  })

  it('没有替代文本时题注不重复写成说明', () => {
    const md = htmlToMarkdown('<img src="https://example.com/a.png" title="季度趋势" data-caption="季度趋势">')
    expect(md).toContain('![image](https://example.com/a.png)')
    expect(md).toContain('季度趋势')
    expect(md.match(/季度趋势/g)).toHaveLength(1)
  })

  it('单图题注跟在图片后面', () => {
    const md = htmlToMarkdown('<img src="https://example.com/a.png" alt="趋势" data-caption="季度趋势">')
    expect(md).toContain('![趋势](https://example.com/a.png)')
    expect(md).toContain('季度趋势')
  })

  it('外链补上 rel，已有 rel 的保持原样', () => {
    const html = withExternalLinkRel('<a href="https://example.com">甲</a><a href="https://b.test" rel="nofollow">乙</a><a href="/local">丙</a>')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('rel="nofollow"')
    expect(html.match(/noopener/g)).toHaveLength(1)
    expect(html).toContain('<a href="/local">丙</a>')
  })
})
