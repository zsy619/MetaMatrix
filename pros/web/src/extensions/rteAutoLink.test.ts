// @vitest-environment happy-dom
/**
 * 自动链接的契约：
 * - 中文/英文标点不能被吞进 href；
 * - 括号配平：网址外的右括号留在链接外；
 * - www. 补 https://，裸域名补 https://；
 * - 只剩协议头、域名没写完、文件名都不算网址；
 * - 英文句号只在确定是句末点时才算终止符（避免 "a.io." 后半截被甩掉）。
 */
import { describe, expect, it } from 'vitest'
import { parseTrailingUrl } from './rteAutoLink'

describe('自动链接解析', () => {
  it('识别普通网址', () => {
    const target = parseTrailingUrl('见 https://example.com/page ')
    expect(target?.text).toBe('https://example.com/page')
    expect(target?.href).toBe('https://example.com/page')
    expect(target?.tail).toBe(' ')
  })

  it('中文句号不被吞进 href', () => {
    const target = parseTrailingUrl('见 https://example.com/page。')
    expect(target?.text).toBe('https://example.com/page')
    expect(target?.href).toBe('https://example.com/page')
    expect(target?.tail).toBe('。')
  })

  it('中文逗号、顿号、感叹号同样留在链接外', () => {
    expect(parseTrailingUrl('https://a.com，')?.href).toBe('https://a.com')
    expect(parseTrailingUrl('https://a.com、')?.href).toBe('https://a.com')
    expect(parseTrailingUrl('https://a.com！')?.href).toBe('https://a.com')
  })

  it('英文标点同样留在链接外', () => {
    expect(parseTrailingUrl('https://a.com.')?.href).toBe('https://a.com')
    expect(parseTrailingUrl('https://a.com.')?.tail).toBe('.')
    expect(parseTrailingUrl('https://a.com,')?.href).toBe('https://a.com')
    expect(parseTrailingUrl('https://a.com;')?.href).toBe('https://a.com')
    expect(parseTrailingUrl('https://a.com?!')?.href).toBe('https://a.com')
  })

  it('括号配平：右括号不属于网址时留在外面', () => {
    const target = parseTrailingUrl('(https://example.com/x)')
    expect(target?.text).toBe('https://example.com/x')
    expect(target?.href).toBe('https://example.com/x')
    expect(target?.tail).toBe(')')
    // 网址自身带括号时保留
    const inner = parseTrailingUrl('https://example.com/a_(b)')
    expect(inner?.text).toBe('https://example.com/a_(b)')
    expect(inner?.tail).toBe('')
  })

  it('www. 开头补 https://', () => {
    const target = parseTrailingUrl('看 www.example.com。')
    expect(target?.text).toBe('www.example.com')
    expect(target?.href).toBe('https://www.example.com')
  })

  it('裸域名补 https://，但文件名不误判', () => {
    expect(parseTrailingUrl('example.com ')?.href).toBe('https://example.com')
    expect(parseTrailingUrl('readme.md ')).toBeNull()
    expect(parseTrailingUrl('index.ts ')).toBeNull()
    expect(parseTrailingUrl('main.go ')).toBeNull()
  })

  it('域名没写完时不自动链接', () => {
    expect(parseTrailingUrl('https://example')).toBeNull()
    expect(parseTrailingUrl('https://example.com')).not.toBeNull()
  })

  it('本机地址与带端口的地址照样识别', () => {
    expect(parseTrailingUrl('http://localhost:5173/x ')?.href).toBe('http://localhost:5173/x')
    expect(parseTrailingUrl('http://192.168.1.8:8080/a ')?.href).toBe('http://192.168.1.8:8080/a')
  })

  it('只有协议头不算网址', () => {
    expect(parseTrailingUrl('https://')).toBeNull()
    expect(parseTrailingUrl('http://')).toBeNull()
    expect(parseTrailingUrl('www.')).toBeNull()
    expect(parseTrailingUrl('普通文字')).toBeNull()
  })

  it('英文句号只在句末点时才是终止符', () => {
    // ".com" 之后的句号是句末点，可以成链
    expect(parseTrailingUrl('https://a.com.')?.text).toBe('https://a.com')
    // ".io" 之后多半还要写 ".cn"，此时不成链
    expect(parseTrailingUrl('https://a.io.')).toBeNull()
  })

  it('返回网址在原文中的起始位置', () => {
    const target = parseTrailingUrl('见 https://example.com。')
    expect(target?.start).toBe(2)
  })
})
