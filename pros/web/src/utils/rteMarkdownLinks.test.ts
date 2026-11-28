// @vitest-environment happy-dom
/**
 * 粘贴 Markdown 链接的契约：
 * - 链接语法要变成锚点，文字与地址都要转义；
 * - 危险协议不转换；
 * - 没有链接语法的文本原样返回（只做转义）。
 */
import { describe, expect, it } from 'vitest'
import {
  hasMarkdownLinkSyntax,
  isSafeMarkdownHref,
  markdownLinksToHtml,
} from './rteMarkdownLinks'

describe('粘贴用的 Markdown 链接处理', () => {
  it('识别链接语法', () => {
    expect(hasMarkdownLinkSyntax('见 [A](https://a.com)')).toBe(true)
    expect(hasMarkdownLinkSyntax('普通文字')).toBe(false)
    expect(hasMarkdownLinkSyntax('[A] (https://a.com)')).toBe(false)
  })

  it('链接语法转成锚点', () => {
    const html = markdownLinksToHtml('见 [A](https://a.com) 结束')
    expect(html).toContain('<a href="https://a.com"')
    expect(html).toContain('>A</a>')
    expect(html).toContain('见 ')
    expect(html).toContain(' 结束')
  })

  it('换行转成 <br>', () => {
    expect(markdownLinksToHtml('第一行\n第二行')).toBe('第一行<br>第二行')
  })

  it('危险协议不转换', () => {
    const html = markdownLinksToHtml('[点我](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).toContain('[点我](javascript:alert(1))')
  })

  it('文本里的 HTML 会被转义', () => {
    const html = markdownLinksToHtml('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('地址白名单', () => {
    expect(isSafeMarkdownHref('https://a.com')).toBe(true)
    expect(isSafeMarkdownHref('mailto:a@b.com')).toBe(true)
    expect(isSafeMarkdownHref('/media/abc')).toBe(true)
    expect(isSafeMarkdownHref('#anchor')).toBe(true)
    expect(isSafeMarkdownHref('data:text/html,<script>')).toBe(false)
    expect(isSafeMarkdownHref('')).toBe(false)
  })
})
