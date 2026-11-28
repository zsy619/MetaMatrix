/**
 * 富文本表情：分类标签页数据（中文 UI）。
 *
 * 分两部分：
 *  1. 精选标签页（常用 / 大号表情 / 颜文字）：手工挑选，优先占位；
 *  2. 分类标签页（笑脸 / 手势 / 人物 / 自然 / 食物 / 物品 / 符号 / 旅行 / 活动 / 旗帜）：
 *     由 `node scripts/gen-rte-emoji.mjs` 从 `scripts/data/emoji1016.txt` 生成，
 *     共 1789 个不重复 emoji，按 Unicode 官方 8 大类归位。
 *
 * 去重规则（与 `components/common/iconData.ts` 的「常用优先占位」一致）：
 * 同一个 emoji 在整个表情面板里只出现一次 —— 归一化（去掉变体选择符 VS15/VS16
 * 与零宽连接符 ZWJ）后判重，先出现的标签页占位，后续标签页跳过。
 * 例：😀 与 😀 归一化后是同一个图标，只保留先出现的那一个。
 */

import { RTE_EMOJI_THEMED } from './rteEmojiThemed'

export type RteEmojiCategory = {
  id: string
  label: string
  emojis: string[]
  /** 大号展示（网格列更少、字号更大） */
  large?: boolean
  /** 颜文字文本展示（宽格、较小字号） */
  kaomoji?: boolean
}

const CURATED_CATEGORIES: RteEmojiCategory[] = [
  {
    id: 'frequent',
    label: '常用',
    emojis: [
      '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '🤔', '😎', '🤩',
      '👍', '👎', '👏', '🙏', '🤝', '💪', '✌️', '🤞', '❤️', '💯',
      '🔥', '✨', '⭐', '🎉', '✅', '❌', '⚠️', '💡', '📌', '📝',
    ],
  },
  {
    id: 'large',
    label: '大号表情',
    large: true,
    emojis: [
      // 大号装饰脸 / 情绪
      '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
      '😋', '😎', '😍', '😘', '🥰', '🤩', '🤗', '🤔', '😏', '😌',
      '😴', '🤤', '😜', '🤪', '😝', '🤑', '🤠', '🥳', '🥸', '😈',
      '👿', '👻', '💀', '☠️', '👽', '🤖', '💩', '😺', '😹', '😻',
      // 手势 / 强调
      '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '✌️', '🤞', '🤟',
      '🤘', '🤙', '👋', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜',
      '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      // 装饰大符号
      '⭐', '🌟', '✨', '💫', '⚡', '🔥', '💥', '💢', '💯', '✅',
      '❌', '⭕', '❗', '❓', '⚠️', '🚫', '💡', '🔔', '🎉', '🎊',
      '🎈', '🎁', '🏆', '🥇', '👑', '💎', '🔮', '🌈', '☀️', '🌙',
      '🌸', '🌺', '🌻', '🌹', '🍀', '🦋', '🦄', '🐶', '🐱', '🐻',
      '🐼', '🦊', '🐯', '🦁', '🐸', '🐧', '🎵', '🎶', '💬', '💭',
    ],
  },
  {
    id: 'kaomoji',
    label: '颜文字',
    kaomoji: true,
    emojis: [
      '(◕‿◕)', '(｡♥‿♥｡)', '(╯°□°）╯︵ ┻━┻', '¯\\_(ツ)_/¯', '(≧∇≦)ﾉ',
      '(๑•̀ㅂ•́)و✧', '♪(´▽｀)', 'ヾ(≧∇≦*)ゝ', '(っ˘ω˘ς)', '(๑´ڡ`๑)',
      '(´；ω；`)', '(T_T)', '(≧ω≦)', '(・∀・)', '(´・ω・`)',
      "(●'◡'●)", 'ψ(｀∇´)ψ', '(ง •̀_•́)ง', '(๑˃̵ᴗ˂̵)و', '٩(◕‿◕｡)۶',
      '(づ｡◕‿‿◕｡)づ', '(ノ°ο°)ノ', '(￣▽￣)', '(≧▽≦)', '(๑•ᴗ•๑)',
      '∠( ᐛ 」∠)_', '(・ω・)', '(￣ε￣)', '(¬‿¬)', '(⊙_⊙)',
    ],
  },
]

/** 归一化：去掉变体选择符与零宽连接符，让 🏳 与 🏳️、👩‍🦱 与 👩🦱 视为同一个图标。 */
function normalize(char: string): string {
  return char.replace(/[\uFE0E\uFE0F\u200D]/g, '')
}

/**
 * 组装标签页：按顺序遍历，先出现的标签页优先占位，
 * 其余标签页跳过已被占用的字符，保证任意一个图标在全库只出现一次。
 */
function buildCategories(): RteEmojiCategory[] {
  const taken = new Set<string>()
  const claim = (list: string[]): string[] =>
    list.filter((char) => {
      const key = normalize(char)
      if (!key || taken.has(key)) return false
      taken.add(key)
      return true
    })

  const categories: RteEmojiCategory[] = CURATED_CATEGORIES.map((category) => ({
    ...category,
    emojis: claim(category.emojis),
  }))
  for (const themed of RTE_EMOJI_THEMED) {
    categories.push({ id: themed.id, label: themed.label, emojis: claim(themed.emojis) })
  }
  return categories.filter((category) => category.emojis.length > 0)
}

export const RTE_EMOJI_CATEGORIES: RteEmojiCategory[] = buildCategories()

/** 扁平列表（兼容旧引用） */
export const RTE_EMOJI_LIST: string[] = Array.from(
  new Set(RTE_EMOJI_CATEGORIES.flatMap((c) => c.emojis)),
)
