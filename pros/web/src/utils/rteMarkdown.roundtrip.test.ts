// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from './rteExportMd'
import { markdownToHtml } from './rteMarkdown'

/**
 * 自建导入导出边界补齐。本轮不引入仍为 Beta 的官方 @tiptap/markdown：
 * 现有管线已覆盖块级/行内解析与导出，加入官方扩展会换一套解析器，和既有单测、自定义节点（任务列表、公式、内嵌表）对不齐。
 */

function roundtrip(md: string): { html: string; back: string } {
  const html = markdownToHtml(md)
  return { html, back: htmlToMarkdown(html) }
}

describe('Markdown 导入导出往返与边界', () => {
  it('空输入与只有空白时导入得到空段落，导出为空', () => {
    expect(markdownToHtml('')).toBe('<p></p>')
    expect(markdownToHtml('   \n\t  ')).toBe('<p></p>')
    expect(htmlToMarkdown('').trim()).toBe('')
    expect(htmlToMarkdown('   \n\t  ').trim()).toBe('')
  })

  it('多级标题、段落、分隔线往返后仍在', () => {
    const md = '# 一级\n\n## 二级\n\n### 三级\n\n正文一段。\n\n---\n'
    const { html, back } = roundtrip(md)
    expect(html).toMatch(/<h1[^>]*>一级<\/h1>/)
    expect(html).toMatch(/<h2[^>]*>二级<\/h2>/)
    expect(html).toMatch(/<h3[^>]*>三级<\/h3>/)
    expect(html).toContain('正文一段。')
    expect(html).toMatch(/<hr\b/i)
    expect(back).toContain('# 一级')
    expect(back).toContain('## 二级')
    expect(back).toContain('### 三级')
    expect(back).toContain('正文一段。')
    expect(back).toMatch(/^---$/m)
  })

  it('有序/无序/嵌套列表与任务列表往返后结构仍在', () => {
    const md = [
      '- 甲',
      '  - 甲子',
      '- 乙',
      '',
      '1. 第一',
      '2. 第二',
      '',
      '- [x] 已做',
      '- [ ] 待做',
    ].join('\n')
    const { html, back } = roundtrip(md)
    expect(html).toContain('<ul')
    expect(html).toContain('<ol')
    expect(html).toMatch(/甲子/)
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-type="taskItem"')
    expect(html).toContain('已做')
    expect(html).toContain('待做')
    expect(back).toContain('甲')
    expect(back).toContain('甲子')
    expect(back).toContain('第一')
    expect(back).toMatch(/\[x\]|\[X\]/)
    expect(back).toMatch(/\[ \]/)
  })

  it('GFM 表格导入后再导出仍是表格', () => {
    const md = '| 列甲 | 列乙 |\n| --- | --- |\n| 一 | 二 |\n| 三 | 四 |'
    const { html, back } = roundtrip(md)
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('列甲')
    expect(html).toContain('四')
    expect(back).toContain('|')
    expect(back).toContain('列甲')
    expect(back).toContain('四')
    expect(back).not.toMatch(/^列甲\s+列乙$/m)
  })

  it('引用块与带语言的代码块往返保留', () => {
    const md = '> 引用句\n\n```ts\nconst n = 1\n```\n'
    const { html, back } = roundtrip(md)
    expect(html).toContain('<blockquote')
    expect(html).toContain('引用句')
    expect(html).toMatch(/<pre|<code/)
    expect(html).toContain('const n = 1')
    expect(back).toMatch(/^>/m)
    expect(back).toContain('```ts')
    expect(back).toContain('const n = 1')
  })

  it('行内强调、删除线、行内代码与安全链接往返', () => {
    const md = '这是 **粗体**、*斜体*、~~删除~~ 和 `code`，以及 [说明](https://example.com/path)。'
    const { html, back } = roundtrip(md)
    expect(html).toMatch(/<strong>|<b>/)
    expect(html).toMatch(/<em>|<i>/)
    expect(html).toMatch(/<del>|<s>|<strike>/)
    expect(html).toContain('<code>')
    expect(html).toContain('href="https://example.com/path"')
    expect(back).toContain('**粗体**')
    expect(back).toMatch(/\*斜体\*|\_斜体\_/)
    expect(back).toContain('`code`')
    expect(back).toContain('https://example.com/path')
  })

  it('javascript / data 协议不生成可点击链接', () => {
    const md = '坏链 [点我](javascript:alert(1)) 和 [数据](data:text/html,hi)'
    const { html } = roundtrip(md)
    // 自建导入把危险协议留作正文，不生成 <a>；协议字符串可能仍出现在纯文本里。
    expect(html).not.toMatch(/<a\b/i)
    expect(html).toContain('点我')
    expect(html).toContain('数据')
  })

  it('导出时丢弃 HTML 里已有的危险协议链接，只保留锚文本', () => {
    const md = htmlToMarkdown('<p><a href="javascript:alert(1)">点我</a>与<a href="data:text/html,hi">数据</a></p>')
    expect(md).toContain('点我')
    expect(md).toContain('数据')
    expect(md).not.toMatch(/\]\((javascript|data|vbscript):/i)
  })

  it('原始 HTML 与 script 不会变成可执行内容', () => {
    const md = '前文 <script>alert(1)</script> 后文\n\n<div onclick="alert(1)">块</div>'
    const html = markdownToHtml(md)
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html).not.toMatch(/<[a-z][^>]*\sonclick=/i)
    // 转义后的标签会作为正文再导出，不应重新变成 HTML 标签节点。
    const back = htmlToMarkdown(html)
    const again = markdownToHtml(back)
    expect(again.toLowerCase()).not.toContain('<script')
    expect(again).not.toMatch(/<[a-z][^>]*\sonclick=/i)
  })

  it('图片与安全外链导出后再导入地址仍在', () => {
    const html = '<p><img src="https://example.com/a.png" alt="说明"><a href="https://example.com/doc">文档</a></p>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('![说明](https://example.com/a.png)')
    expect(md).toContain('[文档](https://example.com/doc)')
    const again = markdownToHtml(md)
    expect(again).toContain('src="https://example.com/a.png"')
    expect(again).toContain('href="https://example.com/doc"')
  })
})
