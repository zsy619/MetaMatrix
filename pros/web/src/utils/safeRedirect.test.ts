/**
 * 重定向白名单的边界。
 *
 * 这个函数挡的是开放重定向：登录页会把 ?redirect= 原样带回，
 * 不校验的话攻击者能让用户登录后被送去钓鱼站点。
 */
import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it('放行站内路径', () => {
    expect(safeRedirect('/')).toBe('/')
    expect(safeRedirect('/canvas/dual-triangle')).toBe('/canvas/dual-triangle')
    expect(safeRedirect('/account')).toBe('/account')
  })

  it('保留查询串和 hash', () => {
    expect(safeRedirect('/canvas/dual-triangle?documentId=doc-1')).toBe(
      '/canvas/dual-triangle?documentId=doc-1',
    )
    expect(safeRedirect('/canvas/x?panel=p#top')).toBe('/canvas/x?panel=p#top')
  })

  it('拒绝站外地址', () => {
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect('http://evil.com')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
    expect(safeRedirect('evil.com')).toBe('/')
  })

  it('拒绝协议相对 URL', () => {
    // "//evil.com" 会被浏览器当成外站，必须挡住。
    expect(safeRedirect('//evil.com')).toBe('/')
    expect(safeRedirect('//evil.com/path')).toBe('/')
  })

  it('拒绝反斜杠变体', () => {
    // 某些浏览器会把 "\/\/evil.com" 归一化成协议相对 URL。
    expect(safeRedirect('/\\evil.com')).toBe('/')
    expect(safeRedirect('/path\\to')).toBe('/')
  })

  it('拒绝路径部分含 :// 的地址', () => {
    expect(safeRedirect('/redirect?to=https://evil.com')).toBe(
      '/redirect?to=https://evil.com',
    )
    expect(safeRedirect('/https://evil.com')).toBe('/')
  })

  it('非字符串一律回落到默认值', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect(123)).toBe('/')
    expect(safeRedirect({})).toBe('/')
    expect(safeRedirect(undefined, '/canvas')).toBe('/canvas')
  })
})
