import { describe, expect, it } from 'vitest'
import { RTE_EMOJI_CATEGORIES } from './rteEmojiList'
import { ZH_ALIAS, emojiLabel, searchEmoji } from './rteEmojiSearch'

const PANEL = new Set(RTE_EMOJI_CATEGORIES.flatMap((c) => c.emojis))

describe('表情搜索', () => {
  it('中文别名能命中常见表情', () => {
    const hits = searchEmoji('火')
    expect(hits.some((h) => h.emoji === '🔥')).toBe(true)
  })

  it('中文别名能命中「爱」', () => {
    const hits = searchEmoji('爱')
    expect(hits.some((h) => h.emoji === '❤️')).toBe(true)
  })

  it('英文名能命中', () => {
    const hits = searchEmoji('rocket')
    expect(hits.some((h) => h.emoji === '🚀')).toBe(true)
  })

  it('粘贴 emoji 字符能精确命中', () => {
    const hits = searchEmoji('🎉')
    expect(hits[0]?.emoji).toBe('🎉')
  })

  it('分类名能命中（旗帜）', () => {
    const hits = searchEmoji('旗帜')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.category.length > 0)).toBe(true)
  })

  it('空关键词返回空数组', () => {
    expect(searchEmoji('   ')).toEqual([])
  })

  it('结果不重复', () => {
    const hits = searchEmoji('a')
    const set = new Set(hits.map((h) => h.emoji))
    expect(set.size).toBe(hits.length)
  })

  it('中文别名表里的字符都在面板内（避免写了别名但面板里没有）', () => {
    const missing = Object.keys(ZH_ALIAS).filter((char) => !PANEL.has(char))
    expect(missing).toEqual([])
  })

  it('emojiLabel 有可读名称', () => {
    expect(emojiLabel('🔥')).toBe('火')
  })
})

