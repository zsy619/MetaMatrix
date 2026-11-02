/**
 * 拼音首字母检索。斜杠命令、@提及、工具栏搜索共用一套匹配规则。
 *
 * 依赖 pinyin-pro：中文取首字母、全拼（不带声调），
 * 英文与数字原样保留，方便「bt」搜到「标题」。
 */
import { pinyin } from 'pinyin-pro'

/** 汉字转拼音首字母，非汉字字符原样保留（小写）。「标题 1」-> 「bt1」 */
export function pinyinInitials(text: string): string {
  const raw = String(text ?? '')
  if (!raw) return ''
  return pinyin(raw, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
    .join('')
    .toLowerCase()
}

/** 汉字转全拼（不带声调、不含空格）。「标题」-> 「biaoti」 */
export function pinyinFull(text: string): string {
  const raw = String(text ?? '')
  if (!raw) return ''
  return pinyin(raw, {
    pattern: 'pinyin',
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
    .join('')
    .toLowerCase()
}

function parts(query: string): string[] {
  return String(query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/** 查询词是否按顺序出现在候选串里（模糊首字母，如 ybt 命中 yjbt）。 */
function isSubsequence(query: string, target: string): boolean {
  if (!query) return true
  let i = 0
  for (const ch of target) {
    if (ch === query[i]) i += 1
    if (i >= query.length) return true
  }
  return false
}

/** 检索命中：原字符串、首字母、全拼三者之一包含查询词即命中。多个词按「与」处理。 */
export function matchesPinyin(haystack: string, query: string): boolean {
  const partsList = parts(query)
  if (!partsList.length) return true
  const hay = String(haystack ?? '').toLowerCase()
  const initials = pinyinInitials(haystack)
  const full = pinyinFull(haystack)
  return partsList.every(
    (part) =>
      hay.includes(part) ||
      initials.includes(part) ||
      full.includes(part) ||
      isSubsequence(part, initials),
  )
}

/**
 * 命中打分。0 表示不命中，数值越大越靠前。
 * 顺序：完全相等 > 前缀命中 > 首字母前缀 > 首字母包含 > 全拼包含 > 普通包含。
 */
export function pinyinSearchScore(haystack: string, query: string): number {
  const partsList = parts(query)
  if (!partsList.length) return 1
  const hay = String(haystack ?? '').toLowerCase()
  if (!hay) return 0
  const initials = pinyinInitials(haystack)
  const full = pinyinFull(haystack)
  // 多词查询要求每个词都命中，取最弱的一项作为整体分数。
  let weakest = Number.POSITIVE_INFINITY
  for (const part of partsList) {
    let score = 0
    if (hay === part) score = 100
    else if (hay.startsWith(part)) score = 80
    else if (initials.startsWith(part)) score = 60
    else if (initials.includes(part)) score = 40
    else if (isSubsequence(part, initials)) score = 35
    else if (full.includes(part)) score = 30
    else if (hay.includes(part)) score = 20
    if (score < weakest) weakest = score
  }
  return weakest === Number.POSITIVE_INFINITY ? 0 : weakest
}

/** 预先算好一批标签的首字母，菜单里反复过滤时省掉重复计算。 */
export function buildPinyinIndex(labels: readonly string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const label of labels || []) {
    if (!map.has(label)) map.set(label, pinyinInitials(label))
  }
  return map
}
