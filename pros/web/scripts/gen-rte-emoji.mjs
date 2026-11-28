/**
 * 生成富文本表情分类数据。
 *
 * 输入：scripts/data/emoji1016.txt（Unicode emoji 全量，按 Unicode 官方 8 大类分行）
 *      src/components/common/iconData.ts（项目自己的图标库，用作语义分类器）
 * 输出：src/utils/rteEmojiThemed.ts（10 个分类，组内与组间互不重复）
 *
 * 跑法：node scripts/gen-rte-emoji.mjs
 *
 * 为什么要生成而不是手写：
 *  1. emoji1016.txt 自身就跨组重复（🦴 出现在人物与食物两组、👀 出现在手势与符号两组…），
 *     直接铺进面板会出现同一个图标在多个分类里各出现一次。
 *  2. 手动维护 1700+ 条目必然漏项、重复。
 *  3. 数据源换了（emoji14.txt / emoji264.txt …）只要替换 txt 重跑即可。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
const SRC_TXT = path.join(WEB_ROOT, 'scripts/data/emoji1016.txt')
const ICON_DATA = path.join(WEB_ROOT, 'src/components/common/iconData.ts')
const OUT_TS = path.join(WEB_ROOT, 'src/utils/rteEmojiThemed.ts')

const ZWJ = '‍'
const VS16 = '️'
const VS15 = '︎'
const KEYCAP = '⃣'
const TAG_END = '\u{E007F}'

const isSkin = (cp) => cp >= 0x1f3fb && cp <= 0x1f3ff
const isRegional = (cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff
const isTag = (cp) => cp >= 0xe0020 && cp <= 0xe007e

/**
 * 按「表情簇」切分一段文本：一个簇 = 基字符 + 可选肤色修饰 + 可选变体选择符
 * + 可选 keycap + 可选 ZWJ 链 + 可选 tag 序列（旗帜）+ 可选区域指示符对。
 * emoji-regex 会把 ZWJ 序列拆成碎片，不能用。
 */
function splitEmojiClusters(text) {
  // 按码点切：astral 字符（肤色、区域指示符、tag 序列）是代理对，
  // 直接按下标遍历会把它们劈成两半，导致 ZWJ 序列与旗帜被拆碎。
  const cps = Array.from(text)
  const out = []
  let i = 0
  while (i < cps.length) {
    if (/\s/.test(cps[i])) {
      i += 1
      continue
    }
    const start = i
    i += 1
    while (i < cps.length && isSkin(cps[i].codePointAt(0))) i += 1
    if (cps[i] === VS16 || cps[i] === VS15) i += 1
    if (cps[i] === KEYCAP) i += 1
    while (i < cps.length && isTag(cps[i].codePointAt(0))) {
      i += 1
      if (cps[i] === TAG_END) {
        i += 1
        break
      }
    }
    while (i < cps.length && cps[i] === ZWJ) {
      i += 1
      if (i < cps.length) i += 1
      while (i < cps.length && isSkin(cps[i].codePointAt(0))) i += 1
      if (cps[i] === VS16 || cps[i] === VS15) i += 1
      if (cps[i] === KEYCAP) i += 1
      while (i < cps.length && isTag(cps[i].codePointAt(0))) {
        i += 1
        if (cps[i] === TAG_END) {
          i += 1
          break
        }
      }
    }
    // 区域指示符对（旗帜）由两个码位组成
    if (
      i - start === 1 &&
      isRegional(cps[start].codePointAt(0)) &&
      i < cps.length &&
      isRegional(cps[i].codePointAt(0))
    ) {
      i += 1
    }
    out.push(cps.slice(start, i).join(''))
  }
  return out
}

/** 归一化：去掉变体选择符与零宽连接符，让 🏳 与 🏳️、👩‍🦱 与 👩🦱 视为同一个图标。 */
function normalize(char) {
  return char.replace(/[\uFE0E\uFE0F\u200D]/g, '')
}

/** 取表情簇的首个码点，用于按 Unicode 区块判定语义。 */
function baseCodePoint(char) {
  return char.codePointAt(0) ?? 0
}

/**
 * 手势 / 身体部位：iconData 的 people 组里既有「人」也有「手」，这里按码点拆开。
 * 依据 Unicode 码位：
 *   1F440-1F450 眼/耳/口/手等身体部位与手势
 *   1F446-1F450 上下左右等指向手势
 *   1F463 脚印   1F485 指甲   1F4AA 肌肉
 *   1F590-1F596 摊手/胜利/交叉手指等
 *   1F918-1F91F 摇滚/交叉手指/手势
 *   1F933 自拍   1F9B4-1F9BF 骨骼与机械肢体
 *   1F9BB 耳     1F9E0 大脑   1FAC0-1FAC1 心脏与肺
 *   1FAF0-1FAF8 新版手势
 *   261D 食指向上 270B/270C/270D 手势
 */
const GESTURE_RANGES = [
  [0x1f440, 0x1f450],
  [0x1f463, 0x1f463],
  [0x1f485, 0x1f485],
  [0x1f48b, 0x1f48b],
  [0x1f4aa, 0x1f4aa],
  [0x1f590, 0x1f596],
  [0x1f918, 0x1f91f],
  [0x1f933, 0x1f933],
  [0x1f9b4, 0x1f9bf],
  [0x1f9e0, 0x1f9e0],
  [0x1fac0, 0x1fac1],
  [0x1faf0, 0x1faf8],
  [0x1f64c, 0x1f64c], // 🙌 举双手
  [0x1f64f, 0x1f64f], // 🙏 合十
  [0x1f932, 0x1f932], // 🤲 掌心向上
  [0x261d, 0x261d],
  [0x270b, 0x270d],
]

/**
 * 服饰 / 配饰：从人物组挪到「物品」组。
 *   1F392 书包 1F393 学士帽 1F3A9 礼帽 1F451-1F45D 冠/衣/包/鞋
 *   1F45E-1F462 鞋类   1F484 口红 1F48D 戒指 1F4BC 公文包
 *   1F6D1 头盔 1F9BA 安全马甲 1F9E2-1F9E7 围巾手套等
 *   1F97B 保暖背心 1F97E-1F97F 靴鞋 1FA70-1FA74 泳装 1FA78 绷带 1FA96 头盔
 */
const CLOTHING_RANGES = [
  [0x1f392, 0x1f392],
  [0x1f393, 0x1f393],
  [0x1f3a9, 0x1f3a9],
  [0x1f451, 0x1f45d],
  [0x1f45e, 0x1f462],
  [0x1f484, 0x1f484],
  [0x1f48d, 0x1f48d],
  [0x1f4bc, 0x1f4bc],
  [0x1f6d1, 0x1f6d1],
  [0x1f9ba, 0x1f9ba],
  [0x1f9e2, 0x1f9e7],
  [0x1f97b, 0x1f97b],
  [0x1f97e, 0x1f97f],
  [0x1fa70, 0x1fa74],
  [0x1fa96, 0x1fa96],
]

function inRanges(code, ranges) {
  return ranges.some(([start, end]) => code >= start && code <= end)
}

/**
 * emoji1016.txt 的 8 大组（Unicode 官方分类）→ 面板分类。
 * 这 8 组就是 Unicode 的权威语义划分，直接作为分类基准；
 * iconData.ts 只是用来判断「哪张脸」（它的 smileys 组正好是各种脸）。
 */
const TXT_GROUP_TO_CATEGORY = [
  'smileys', // 1 组 Smileys & People → 再按码位拆成 笑脸 / 手势 / 人物 / 物品
  'nature',
  'food',
  'activities',
  'travel',
  'objects',
  'symbols',
  'flags',
]

/** 面板分类顺序（与 rteEmojiList.ts 的标签页顺序一致）。 */
const CATEGORY_ORDER = [
  { id: 'smileys', label: '笑脸' },
  { id: 'gestures', label: '手势' },
  { id: 'people', label: '人物' },
  { id: 'nature', label: '自然' },
  { id: 'food', label: '食物' },
  { id: 'objects', label: '物品' },
  { id: 'symbols', label: '符号' },
  { id: 'travel', label: '旅行' },
  { id: 'activities', label: '活动' },
  { id: 'flags', label: '旗帜' },
]

/** 读取 iconData.ts，抽出「字符 → 语义分组」。 */
function readIconGroups() {
  const source = fs.readFileSync(ICON_DATA, 'utf8')
  const map = new Map()
  const blocks = source.split(/\{ key: "/).slice(1)
  for (const block of blocks) {
    const key = block.slice(0, block.indexOf('"'))
    const body = block.slice(block.indexOf('items: ['), block.indexOf('] },'))
    for (const match of body.matchAll(/char: "([^"]*)"/g)) {
      const normalized = normalize(match[1])
      if (!map.has(normalized)) map.set(normalized, [])
      map.get(normalized).push(key)
    }
  }
  // 「常用」是聚合视图（同一图标也会出现在语义组里），分类时优先用语义组
  return new Map(
    [...map].map(([char, groups]) => {
      const semantic = groups.find((group) => group !== 'favorites')
      return [char, semantic ?? groups[0]]
    }),
  )
}

/** 读 emoji1016.txt，按空行切成 8 个 Unicode 大类。 */
function readTxtGroups() {
  return fs
    .readFileSync(SRC_TXT, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function main() {
  const iconGroups = readIconGroups()
  const txtGroups = readTxtGroups()

  /** 归一化字符 → 面板分类 */
  const categoryOf = new Map()
  let duplicates = 0
  let unclassified = 0

  txtGroups.forEach((line, groupIndex) => {
    for (const emoji of splitEmojiClusters(line)) {
      const key = normalize(emoji)
      if (!key) continue
      if (categoryOf.has(key)) {
        duplicates += 1
        continue
      }
      const iconGroup = iconGroups.get(key)
      const code = baseCodePoint(emoji)
      let category
      if (groupIndex === 0) {
        // Smileys & People：手势 → 手势；服饰 → 物品；其余按「是不是一张脸」分
        if (inRanges(code, GESTURE_RANGES)) category = 'gestures'
        else if (inRanges(code, CLOTHING_RANGES)) category = 'objects'
        else if (iconGroup === 'smileys') category = 'smileys'
        else if (code === 0x1f383) category = 'objects' // 🎃 万圣节南瓜
        else category = 'people'
      } else if (iconGroup) {
        category = TXT_GROUP_TO_CATEGORY[groupIndex]
      } else {
        category = TXT_GROUP_TO_CATEGORY[groupIndex]
        unclassified += 1
      }
      categoryOf.set(key, { category, emoji })
    }
  })

  const buckets = new Map(CATEGORY_ORDER.map((c) => [c.id, []]))
  for (const { category, emoji } of categoryOf.values()) {
    buckets.get(category).push(emoji)
  }

  const lines = []
  lines.push('/**')
  lines.push(' * 富文本表情：分类数据（自动生成，请勿手改）。')
  lines.push(' *')
  lines.push(' * 由 `node scripts/gen-rte-emoji.mjs` 从 `scripts/data/emoji1016.txt` 生成，')
  lines.push(' * 分类语义取自 `src/components/common/iconData.ts`，同组与跨组均已去重。')
  lines.push(' *')
  lines.push(' * 换数据源：替换 `scripts/data/emoji1016.txt` 后重跑生成脚本。')
  lines.push(' */')
  lines.push('')
  lines.push('export type RteEmojiThemedCategory = {')
  lines.push('  id: string')
  lines.push('  label: string')
  lines.push('  emojis: string[]')
  lines.push('}')
  lines.push('')
  lines.push('export const RTE_EMOJI_THEMED: RteEmojiThemedCategory[] = [')

  for (const category of CATEGORY_ORDER) {
    const emojis = buckets.get(category.id)
    lines.push(`  { id: '${category.id}', label: '${category.label}', emojis: [`)
    for (let i = 0; i < emojis.length; i += 10) {
      const chunk = emojis.slice(i, i + 10).map((e) => `'${e}'`).join(', ')
      lines.push(`    ${chunk},`)
    }
    lines.push('  ] },')
  }
  lines.push(']')
  lines.push('')

  fs.writeFileSync(OUT_TS, lines.join('\n'), 'utf8')

  const total = [...buckets.values()].reduce((sum, list) => sum + list.length, 0)
  console.log(`✔ 已生成 ${path.relative(WEB_ROOT, OUT_TS)}`)
  console.log(`  输入条目 ${categoryOf.size} 个（跳过源文件内重复 ${duplicates} 个，未匹配 iconData ${unclassified} 个）`)
  for (const category of CATEGORY_ORDER) {
    console.log(`  ${category.label.padEnd(4, '　')} ${buckets.get(category.id).length}`)
  }
  console.log(`  合计 ${total}`)
}

main()
