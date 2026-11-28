import { describe, expect, it } from 'vitest'
import { RTE_SPECIAL_CHAR_CATEGORIES } from './rteSpecialChars'
import { ALIAS_BY_CHAR, searchSpecialChar, specialCharLabel } from './rteSpecialCharSearch'

const PANEL = new Set(RTE_SPECIAL_CHAR_CATEGORIES.flatMap((c) => c.chars))

describe('符号搜索', () => {
  it('中文别名能命中（逗号）', () => {
    const hits = searchSpecialChar('逗号')
    expect(hits.some((h) => h.char === '，')).toBe(true)
  })

  it('中文别名能命中（求和 / 人民币）', () => {
    expect(searchSpecialChar('求和').some((h) => h.char === '∑')).toBe(true)
    expect(searchSpecialChar('人民币').some((h) => h.char === '¥')).toBe(true)
  })

  it('分类名能命中（箭头 / 版权）', () => {
    expect(searchSpecialChar('箭头').length).toBeGreaterThan(0)
    expect(searchSpecialChar('版权').length).toBeGreaterThan(0)
  })

  it('粘贴字符能精确命中', () => {
    const hits = searchSpecialChar('→')
    expect(hits[0]?.char).toBe('→')
  })

  it('空关键词返回空数组', () => {
    expect(searchSpecialChar('  ')).toEqual([])
  })

  it('结果不重复', () => {
    const hits = searchSpecialChar('a')
    expect(new Set(hits.map((h) => h.char)).size).toBe(hits.length)
  })

  it('别名表里的字符都在面板内（避免写了别名但面板里没有）', () => {
    const missing = Object.keys(ALIAS_BY_CHAR).filter((char) => !PANEL.has(char))
    expect(missing).toEqual([])
  })

  it('specialCharLabel 有可读名称', () => {
    expect(specialCharLabel('，')).toBe('逗号')
  })
})

