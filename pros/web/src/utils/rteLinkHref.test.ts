// @vitest-environment happy-dom
/**
 * 链接地址规范化的契约：
 * - 末尾粘连的中英文标点要去掉；
 * - 裸域名、www. 开头要补 https://；
 * - 相对路径、锚点、mailto、tel 原样保留。
 */
import { describe, expect, it } from 'vitest'
import { normalizeLinkHref } from './rteLinkHref'

describe('链接地址规范化', () => {
  it('去掉末尾中文标点', () => {
    expect(normalizeLinkHref('见 https://example.com/page。')).toBe('见 https://example.com/page')
    expect(normalizeLinkHref('https://example.com。')).toBe('https://example.com')
    expect(normalizeLinkHref('https://example.com，')).toBe('https://example.com')
  })

  it('去掉末尾英文标点', () => {
    expect(normalizeLinkHref('https://example.com.')).toBe('https://example.com')
    expect(normalizeLinkHref('https://example.com,')).toBe('https://example.com')
  })

  it('裸域名与 www 补 https://', () => {
    expect(normalizeLinkHref('example.com')).toBe('https://example.com')
    expect(normalizeLinkHref('www.example.com')).toBe('https://www.example.com')
    expect(normalizeLinkHref('example.com/path')).toBe('https://example.com/path')
  })

  it('相对路径、锚点与特殊协议原样保留', () => {
    expect(normalizeLinkHref('/media/abc')).toBe('/media/abc')
    expect(normalizeLinkHref('#anchor')).toBe('#anchor')
    expect(normalizeLinkHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(normalizeLinkHref('tel:13800000000')).toBe('tel:13800000000')
  })

  it('空值与非法地址原样返回', () => {
    expect(normalizeLinkHref('')).toBe('')
    expect(normalizeLinkHref('   ')).toBe('')
    expect(normalizeLinkHref('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
})
