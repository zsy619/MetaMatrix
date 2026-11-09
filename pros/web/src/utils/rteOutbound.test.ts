import { describe, expect, it } from 'vitest'
import {
  classifyHref,
  externalHrefRows,
  hostAllowed,
  normalizeHost,
  normalizeOutboundPolicy,
  writeOutboundPolicy,
} from './rteOutbound'

const origin = 'https://docs.example.com'

describe('外链', () => {
  it('区分站内、外链和不安全协议', () => {
    expect(classifyHref('/media/abc', origin)).toBe('internal')
    expect(classifyHref('mailto:a@b.c', origin)).toBe('internal')
    expect(classifyHref('https://docs.example.com/a', origin)).toBe('internal')
    expect(classifyHref('https://evil.test/a', origin)).toBe('external')
    expect(classifyHref('javascript:alert(1)', origin)).toBe('unsafe')
    expect(classifyHref('data:text/html,hi', origin)).toBe('unsafe')
  })

  it('白名单只认主机名', () => {
    expect(normalizeHost(' HTTPS://Feishu.CN/path ')).toBe('feishu.cn')
    const policy = normalizeOutboundPolicy({ confirmExternal: true, hosts: ['HTTPS://Feishu.CN/a', 'feishu.cn'] })
    expect(policy.hosts).toEqual(['feishu.cn'])
    expect(hostAllowed(policy, 'https://feishu.cn/docx')).toBe(true)
    expect(hostAllowed(policy, 'https://other.cn')).toBe(false)
  })

  it('从正文收集外链，默认策略不落盘', () => {
    const rows = externalHrefRows(
      '<p><a href="/in">内</a><a href="https://evil.test/x">外</a><a href="https://evil.test/x">重</a></p>',
      origin,
    )
    expect(rows).toEqual([{ href: 'https://evil.test/x', host: 'evil.test' }])
    expect(writeOutboundPolicy(undefined, 'p', { confirmExternal: true, hosts: [] })).toBeUndefined()
    expect(writeOutboundPolicy(undefined, 'p', { confirmExternal: false, hosts: [] })?.p.confirmExternal).toBe(false)
  })
})
