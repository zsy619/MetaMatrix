import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RTE_EMOJI_CATEGORIES, RTE_EMOJI_LIST } from './rteEmojiList'

/** 归一化：忽略 VS15 / VS16 / ZWJ 变体，🏳 与 🏳️ 视为同一个图标。 */
const normalize = (char: string) => char.replace(/[\uFE0E\uFE0F\u200D]/g, '')

/** 源数据文件：Unicode emoji 全量（按官方 8 大类分行）。 */
const SOURCE_FILE = fileURLToPath(new URL('../../scripts/data/emoji1016.txt', import.meta.url))

/**
 * 按「表情簇」切分：基字符 + 肤色修饰 + 变体选择符 + keycap + ZWJ 链
 * + tag 序列（旗帜）+ 区域指示符对。emoji-regex 会把 ZWJ 序列拆碎，不能用。
 */
function splitEmojiClusters(text: string): string[] {
  const cps = Array.from(text)
  const out: string[] = []
  let i = 0
  const isSkin = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff
  const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff
  const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007e
  while (i < cps.length) {
    if (/\s/.test(cps[i])) {
      i += 1
      continue
    }
    const start = i
    i += 1
    while (i < cps.length && isSkin(cps[i].codePointAt(0) ?? 0)) i += 1
    if (cps[i] === '️' || cps[i] === '︎') i += 1
    if (cps[i] === '⃣') i += 1
    while (i < cps.length && isTag(cps[i].codePointAt(0) ?? 0)) {
      i += 1
      if (cps[i] === '\u{E007F}') {
        i += 1
        break
      }
    }
    while (i < cps.length && cps[i] === '‍') {
      i += 1
      if (i < cps.length) i += 1
      while (i < cps.length && isSkin(cps[i].codePointAt(0) ?? 0)) i += 1
      if (cps[i] === '️' || cps[i] === '︎') i += 1
      if (cps[i] === '⃣') i += 1
      while (i < cps.length && isTag(cps[i].codePointAt(0) ?? 0)) {
        i += 1
        if (cps[i] === '\u{E007F}') {
          i += 1
          break
        }
      }
    }
    if (
      i - start === 1 &&
      isRegional(cps[start].codePointAt(0) ?? 0) &&
      i < cps.length &&
      isRegional(cps[i].codePointAt(0) ?? 0)
    ) {
      i += 1
    }
    out.push(cps.slice(start, i).join(''))
  }
  return out
}

describe('rteEmojiList', () => {
  const sourceEmoji = splitEmojiClusters(readFileSync(SOURCE_FILE, 'utf8'))
  const sourceKeys = new Set(sourceEmoji.map(normalize))

  it('分类标签页齐全且都有内容', () => {
    const ids = RTE_EMOJI_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const category of RTE_EMOJI_CATEGORIES) {
      expect(category.label).toBeTruthy()
      expect(category.emojis.length).toBeGreaterThan(0)
    }
  })

  it('全库没有重复图标（跨标签页、标签页内都不重复）', () => {
    const seen = new Set<string>()
    for (const item of RTE_EMOJI_LIST) {
      const key = normalize(item)
      expect(seen.has(key), `重复图标 ${item}`).toBe(false)
      seen.add(key)
    }
  })

  it('扁平列表与分类数据一致', () => {
    expect(RTE_EMOJI_LIST.length).toBe(
      RTE_EMOJI_CATEGORIES.reduce((sum, c) => sum + c.emojis.length, 0),
    )
  })

  it('源文件里的每个 emoji 都被收录（按归一化判重）', () => {
    const covered = new Set(RTE_EMOJI_LIST.map(normalize))
    const missing = [...sourceKeys].filter((key) => !covered.has(key))
    expect(missing, `未收录 ${missing.length} 个`).toHaveLength(0)
  })

  it('分类区条目全部来自源文件，不掺入源文件之外的 emoji', () => {
    const themed = RTE_EMOJI_CATEGORIES.filter(
      (c) => c.id !== 'frequent' && c.id !== 'large' && c.id !== 'kaomoji',
    )
    const extra = themed
      .flatMap((c) => c.emojis)
      .map(normalize)
      .filter((key) => !sourceKeys.has(key))
    expect(extra, `分类区多出 ${extra.length} 个非源文件 emoji`).toHaveLength(0)
  })

  it('源文件里被精选标签页占位的 emoji 不再出现在分类区', () => {
    const curatedKeys = new Set(
      RTE_EMOJI_CATEGORIES.filter((c) => c.id === 'frequent' || c.id === 'large')
        .flatMap((c) => c.emojis)
        .map(normalize),
    )
    const themed = RTE_EMOJI_CATEGORIES.filter(
      (c) => c.id !== 'frequent' && c.id !== 'large' && c.id !== 'kaomoji',
    )
    const leaked = themed
      .flatMap((c) => c.emojis)
      .map(normalize)
      .filter((key) => curatedKeys.has(key))
    expect(leaked, `精选与分类区重复 ${leaked.length} 个`).toHaveLength(0)
  })

  it('旗帜分类存在且覆盖区域旗帜', () => {
    const flags = RTE_EMOJI_CATEGORIES.find((c) => c.id === 'flags')
    expect(flags).toBeTruthy()
    expect(flags!.emojis.length).toBeGreaterThan(200)
    const keys = new Set(flags!.emojis.map(normalize))
    expect(keys.has('🇨🇳')).toBe(true)
    expect(keys.has('🇺🇸')).toBe(true)
  })
})
