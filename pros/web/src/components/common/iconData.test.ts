import { describe, expect, it } from 'vitest'
import { ICON_GROUPS, ICON_SEARCH, ICON_TOTAL } from './iconData'

/** 归一化：忽略 VS16 / ZWJ 变体，🏳 与 🏳️ 视为同一个图标。 */
const normalize = (char: string) => char.replace(/[\uFE0E\uFE0F\u200D]/g, '')

describe('iconData', () => {
  it('图标总数与搜索索引一致', () => {
    expect(ICON_TOTAL).toBe(ICON_SEARCH.length)
    expect(ICON_TOTAL).toBe(ICON_GROUPS.reduce((sum, g) => sum + g.items.length, 0))
  })

  it('不存在重复字符（跨分组、组内都不重复）', () => {
    const seen = new Set<string>()
    for (const item of ICON_SEARCH) {
      const key = normalize(item.char)
      expect(seen.has(key), `重复图标 ${item.char} (${item.name})`).toBe(false)
      seen.add(key)
    }
  })

  it('不存在重复名称（视觉等价符号只保留一个）', () => {
    const seen = new Set<string>()
    for (const item of ICON_SEARCH) {
      const key = item.name.trim().toLowerCase()
      expect(seen.has(key), `重复名称 ${item.name}`).toBe(false)
      seen.add(key)
    }
  })

  it('每个分组都有标签且不为空', () => {
    for (const group of ICON_GROUPS) {
      expect(group.label).toBeTruthy()
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('每个分组不少于 100 个图标', () => {
    for (const group of ICON_GROUPS) {
      expect(group.items.length, `分组 ${group.label} 数量不足 100`).toBeGreaterThanOrEqual(100)
    }
  })

  it('图标规模不低于 3000', () => {
    expect(ICON_TOTAL).toBeGreaterThanOrEqual(3000)
  })
})
