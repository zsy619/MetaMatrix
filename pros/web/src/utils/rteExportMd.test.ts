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

  it('外链补上 rel，已有 rel 的保持原样', () => {
    const html = withExternalLinkRel('<a href="https://example.com">甲</a><a href="https://b.test" rel="nofollow">乙</a><a href="/local">丙</a>')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('rel="nofollow"')
    expect(html.match(/noopener/g)).toHaveLength(1)
    expect(html).toContain('<a href="/local">丙</a>')
  })
})
