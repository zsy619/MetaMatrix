import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markdownToHtml } from './rteMarkdown'

const fixture = readFileSync(new URL('./__fixtures__/markdown-sample.md', import.meta.url), 'utf8')

describe('Markdown 行内解析', () => {
  it('反斜杠转义还原成字面字符', () => {
    expect(markdownToHtml('主色 \\#0088cc')).toContain('#0088cc')
    expect(markdownToHtml('\\[1\\]\\[2\\]')).toContain('[1][2]')
    expect(markdownToHtml('\\-\\-tg\\-theme\\-bg\\-color')).toContain('--tg-theme-bg-color')
    expect(markdownToHtml('C\\+\\+ / Qt 6')).toContain('C++ / Qt 6')
    expect(markdownToHtml('约 33\\.7k')).toContain('33.7k')
  })

  it('粗体 / 斜体 / 删除线 / 行内代码', () => {
    expect(markdownToHtml('**粗**')).toBe('<p><strong>粗</strong></p>')
    expect(markdownToHtml('*斜*')).toBe('<p><em>斜</em></p>')
    expect(markdownToHtml('~~删~~')).toBe('<p><s>删</s></p>')
    expect(markdownToHtml('`code`')).toBe('<p><code>code</code></p>')
    expect(markdownToHtml('**仓库链接：**[https://github.com/x](https://github.com/x)')).toContain(
      '<strong>仓库链接：</strong><a href="https://github.com/x" class="rte-link">',
    )
  })

  it('链接与图片', () => {
    const html = markdownToHtml('[Telegram](https://telegram.org)')
    expect(html).toContain('<a href="https://telegram.org" class="rte-link">Telegram</a>')
    const img = markdownToHtml('![图](https://example.com/a.png)')
    expect(img).toContain('<img src="https://example.com/a.png" alt="图" />')
  })

  it('危险协议不生成链接', () => {
    const html = markdownToHtml('[点我](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).toContain('javascript:alert(1)')
  })

  it('自动链接与引用式链接', () => {
    expect(markdownToHtml('<https://telegram.org>')).toContain(
      '<a href="https://telegram.org" class="rte-link">https://telegram.org</a>',
    )
    const html = markdownToHtml('[Telegram][tg]\n\n[tg]: https://telegram.org')
    expect(html).toContain('<a href="https://telegram.org" class="rte-link">Telegram</a>')
  })

  it('原始 HTML 不会变成可执行内容', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).not.toContain('<script>')
    expect(markdownToHtml('<b onclick="x">粗</b>')).not.toContain('<b onclick')
  })
})

describe('Markdown 块级解析', () => {
  it('标题与段落', () => {
    expect(markdownToHtml('# 一级')).toBe('<h1>一级</h1>')
    expect(markdownToHtml('### 1\\. telegramdesktop/tdesktop（约 33\\.7k Star）')).toBe(
      '<h3>1. telegramdesktop/tdesktop（约 33.7k Star）</h3>',
    )
    expect(markdownToHtml('标题\n===')).toBe('<h1>标题</h1>')
    expect(markdownToHtml('段落一\n段落二')).toBe('<p>段落一<br />段落二</p>')
  })

  it('GFM 表格', () => {
    const html = markdownToHtml('|A|B|\n|---|---|\n|1|2|')
    expect(html).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead>')
    expect(html).toContain('<tbody><tr><td>1</td><td>2</td></tr></tbody></table>')
  })

  it('列表：有序 / 无序 / 嵌套 / 任务列表', () => {
    expect(markdownToHtml('- 一\n- 二')).toBe('<ul><li>一</li><li>二</li></ul>')
    expect(markdownToHtml('1. 一\n2. 二')).toBe('<ol><li>一</li><li>二</li></ol>')
    const nested = markdownToHtml('- 外层\n  - 内层')
    expect(nested).toMatch(/<ul><li>外层\s*<ul><li>内层<\/li><\/ul><\/li><\/ul>/)
    const task = markdownToHtml('- [x] 已完成\n- [ ] 待办')
    expect(task).toContain('data-type="taskItem" data-checked="true"')
    expect(task).toContain('data-type="taskItem" data-checked="false"')
  })

  it('引用块、代码块、分隔线', () => {
    expect(markdownToHtml('> 提示')).toBe('<blockquote><p>提示</p></blockquote>')
    const code = markdownToHtml('```bash\nnpm run dev\n```')
    expect(code).toBe('<pre><code class="language-bash">npm run dev</code></pre>')
    expect(markdownToHtml('---')).toBe('<hr />')
  })
})

describe('真实文档（参考指南）解析', () => {
  const html = markdownToHtml(fixture)

  it('表格被解析成真正的表格，不是段落', () => {
    expect(html).toContain('<table>')
    expect(html).not.toMatch(/<p>[^<]*\|[^<]*\|/)
  })

  it('标题层级完整', () => {
    expect(html).toContain('<h1>GitHub Telegram 设计风格高星项目 Top 10 参考指南（小白版）</h1>')
    expect(html).toContain('<h2>（一）官方与主流客户端</h2>')
    expect(html).toContain('<h3>1. telegramdesktop/tdesktop（约 33.7k Star）</h3>')
  })

  it('转义字符全部还原，不残留反斜杠', () => {
    expect(html).not.toMatch(/\\\\[#[\]_+.\-]/)
    expect(html).toContain('#0088cc')
    expect(html).toContain('--tg-theme-bg-color')
    expect(html).toContain('C++ / Qt 6')
    expect(html).toContain('33.7k')
  })

  it('链接地址去掉转义反斜杠', () => {
    expect(html).toContain('href="https://github.com/telegramdesktop/tdesktop"')
    expect(html).not.toContain('github\\.com')
  })

  it('列表与任务列表都落到位', () => {
    expect(html).toContain('<ul><li>桌面端经典三栏结构：会话列表、聊天窗口、详情侧栏。</li>')
    expect(html).toContain('<ol><li><strong>先看官方成品：</strong>')
    expect(html).toContain('data-type="taskItem" data-checked="true"')
    expect(html).toContain('data-type="taskItem" data-checked="false"')
  })

  it('代码块与引用块保留', () => {
    expect(html).toContain('<pre><code class="language-bash">npm run dev</code></pre>')
    expect(html).toContain('<blockquote><p>提示：以上描述为第三方整理，实际以官方客户端为准。</p></blockquote>')
  })
})
