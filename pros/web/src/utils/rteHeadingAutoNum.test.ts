import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readHeadingAutoNum, writeHeadingAutoNum } from './rteHeadingAutoNum'

describe('标题自动编号落库', () => {
  it('关掉时不写字段，打开时只记 true', () => {
    expect(writeHeadingAutoNum(undefined, 'panel-a', false)).toBeUndefined()
    expect(writeHeadingAutoNum(undefined, 'panel-a', true)).toEqual({ 'panel-a': true })
    const both = writeHeadingAutoNum({ 'panel-a': true, 'panel-b': true }, 'panel-a', false)
    expect(both).toEqual({ 'panel-b': true })
    expect(readHeadingAutoNum(both, 'panel-a')).toBe(false)
    expect(readHeadingAutoNum(both, 'panel-b')).toBe(true)
  })

  it('不认识的值当成关闭', () => {
    expect(readHeadingAutoNum({ 'panel-a': 'yes' as unknown as true }, 'panel-a')).toBe(false)
    expect(readHeadingAutoNum(undefined, 'panel-a')).toBe(false)
  })

  it('H5 和 H6 也有计数器', () => {
    const css = readFileSync(new URL('../components/rte/styles/editor.global.css', import.meta.url), 'utf8')
    expect(css).toContain('.rte-root.is-heading-auto-num .ProseMirror h5::before')
    expect(css).toContain('.rte-root.is-heading-auto-num .ProseMirror h6::before')
    expect(css).not.toMatch(/is-heading-auto-num :deep/)
    expect(css).toContain('counter-reset: h5')
    expect(css).toContain('counter-reset: h6')
    expect(css).toContain('[data-manual-num]::before')
  })
})
