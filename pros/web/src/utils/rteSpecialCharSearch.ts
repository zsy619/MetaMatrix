/**
 * 富文本符号面板的搜索索引。
 *
 * `rteSpecialChars.ts` 只给字符、不给名称，所以中文检索靠两类来源：
 *  - `ALIAS_GROUPS`：按「一组字符共用若干关键词」维护（逗号 → 「，」等）；
 *  - 分类名：输入「箭头」「版权」直接命中该分类。
 * 另外支持直接复制/粘贴某个字符来精确检索。
 */

import { RTE_SPECIAL_CHAR_CATEGORIES, type RteSpecialCharCategory } from './rteSpecialChars'

/** 一组字符共用一组关键词。 */
const ALIAS_GROUPS: { chars: string[]; words: string }[] = [
  { chars: ['，'], words: '逗号 全角逗号' },
  { chars: ['.'], words: '点 句点 小数点' },
  { chars: ['。'], words: '句号 全角句号' },
  { chars: ['、'], words: '顿号 顿号' },
  { chars: ['；'], words: '分号' },
  { chars: [':'], words: '冒号' },
  { chars: ['：'], words: '全角冒号' },
  { chars: ['?'], words: '问号' },
  { chars: ['？'], words: '全角问号' },
  { chars: ['!'], words: '感叹号' },
  { chars: ['！'], words: '全角感叹号' },
  { chars: ['…'], words: '省略号' },
  { chars: ['—'], words: '破折号 短横线' },
  { chars: ['-'], words: '连字符 减号' },
  { chars: ['–'], words: '短破折号' },
  { chars: ['_'], words: '下划线' },
  { chars: ['~'], words: '波浪号 约等于' },
  { chars: ['～'], words: '全角波浪号' },
  { chars: ['·'], words: '间隔号 中点' },
  { chars: ['•'], words: '圆点 项目符号' },
  { chars: ['※'], words: '注音符号 参考' },
  { chars: ['《'], words: '左书名号' },
  { chars: ['》'], words: '右书名号' },
  { chars: ['〈'], words: '左单书名号' },
  { chars: ['〉'], words: '右单书名号' },
  { chars: ['「'], words: '直角引号' },
  { chars: ['」'], words: '直角引号' },
  { chars: ['『'], words: '双直角引号' },
  { chars: ['』'], words: '双直角引号' },
  { chars: ['【'], words: '实心方括号 黑色方括号' },
  { chars: ['】'], words: '实心方括号' },
  { chars: ['〔'], words: '方括号' },
  { chars: ['〕'], words: '方括号' },
  { chars: ['（'], words: '左圆括号' },
  { chars: ['）'], words: '右圆括号' },
  { chars: ['()'], words: '圆括号' },
  { chars: ['[', ']'], words: '方括号' },
  { chars: ['{', '}'], words: '花括号 大括号' },
  { chars: ['"'], words: '双引号' },
  { chars: ['“'], words: '左双引号' },
  { chars: ['”'], words: '右双引号' },
  { chars: ["'"], words: '单引号' },
  { chars: ['‘'], words: '左单引号' },
  { chars: ['’'], words: '右单引号' },
  { chars: ['%'], words: '百分号' },
  { chars: ['&'], words: '与号 和号' },
  { chars: ['#'], words: '井号 号码' },
  { chars: ['@'], words: '艾特 商业符号' },
  { chars: ['+'], words: '加号' },
  { chars: ['−'], words: '减号' },
  { chars: ['×'], words: '乘号' },
  { chars: ['÷'], words: '除号' },
  { chars: ['='], words: '等号' },
  { chars: ['≠'], words: '不等于' },
  { chars: ['≈'], words: '约等于' },
  { chars: ['≡'], words: '恒等于 三个等号' },
  { chars: ['≤'], words: '小于等于' },
  { chars: ['≥'], words: '大于等于' },
  { chars: ['<'], words: '小于' },
  { chars: ['>'], words: '大于' },
  { chars: ['∞'], words: '无穷大' },
  { chars: ['∑'], words: '求和 西格玛' },
  { chars: ['∏'], words: '连乘 积' },
  { chars: ['∫'], words: '积分' },
  { chars: ['√'], words: '根号 开方' },
  { chars: ['∂'], words: '偏导数' },
  { chars: ['π'], words: '派 圆周率' },
  { chars: ['∆'], words: '增量 三角' },
  { chars: ['°'], words: '度 角度' },
  { chars: ['℃'], words: '摄氏度' },
  { chars: ['℉'], words: '华氏度' },
  { chars: ['¥'], words: '人民币 日元 英镑 货币' },
  { chars: ['$'], words: '美元 货币' },
  { chars: ['€'], words: '欧元 货币' },
  { chars: ['£'], words: '英镑 货币' },
  { chars: ['¢'], words: '美分 货币' },
  { chars: ['₩'], words: '韩元 货币' },
  { chars: ['₽'], words: '卢布 货币' },
  { chars: ['₹'], words: '印度卢比 货币' },
  { chars: ['₩'], words: '韩元 货币' },
  { chars: ['←'], words: '左箭头 向左' },
  { chars: ['→'], words: '右箭头 向右' },
  { chars: ['↑'], words: '上箭头 向上' },
  { chars: ['↓'], words: '下箭头 向下' },
  { chars: ['↔'], words: '双向箭头 左右' },
  { chars: ['↕'], words: '上下箭头' },
  { chars: ['⇒'], words: '推出 双箭头' },
  { chars: ['⇐'], words: '推出' },
  { chars: ['©'], words: '版权 注册商标' },
  { chars: ['®'], words: '注册商标' },
  { chars: ['™'], words: '商标' },
  { chars: ['℗'], words: '录音版权' },
  { chars: ['§'], words: '章节 条款' },
  { chars: ['¶'], words: '段落 pilcrow' },
  { chars: ['†'], words: '匕首脚注' },
  { chars: ['‡'], words: '双匕首脚注' },
  { chars: ['α'], words: '阿尔法 alpha' },
  { chars: ['β'], words: '贝塔 beta' },
  { chars: ['γ'], words: '伽马 gamma' },
  { chars: ['δ'], words: '德尔塔 delta' },
  { chars: ['ε'], words: '艾普西隆 epsilon' },
  { chars: ['θ'], words: '西塔 theta' },
  { chars: ['λ'], words: '拉姆达 lambda' },
  { chars: ['μ'], words: '缪 mu' },
  { chars: ['σ'], words: '西格马 sigma' },
  { chars: ['φ'], words: '斐 phi' },
  { chars: ['ω'], words: '欧米伽 omega' },
  { chars: ['①'], words: '带圈数字 一' },
  { chars: ['②'], words: '带圈数字 二' },
  { chars: ['③'], words: '带圈数字 三' },
  { chars: ['⑴'], words: '括号数字' },
  { chars: ['Ⅰ'], words: '罗马数字 一' },
  { chars: ['Ⅱ'], words: '罗马数字 二' },
  { chars: ['Ⅲ'], words: '罗马数字 三' },
  { chars: ['ⅰ'], words: '小写罗马数字 一' },
  { chars: ['Ａ'], words: '全角字母 A' },
  { chars: ['ａ'], words: '全角小写字母 a' },
  { chars: ['！'], words: '全角感叹号' },
  { chars: ['＃'], words: '全角井号' },
  { chars: ['＆'], words: '全角与号' },
  { chars: ['－'], words: '全角减号' },
  { chars: ['｜'], words: '全角竖线' },
  { chars: ['┌'], words: '制表符 左上' },
  { chars: ['┐'], words: '制表符 右上' },
  { chars: ['└'], words: '制表符 左下' },
  { chars: ['┘'], words: '制表符 右下' },
  { chars: ['├'], words: '制表符 左接' },
  { chars: ['┤'], words: '制表符 右接' },
  { chars: ['┬'], words: '制表符 下接' },
  { chars: ['┴'], words: '制表符 上接' },
  { chars: ['┼'], words: '制表符 交叉' },
  { chars: ['═'], words: '制表符 双横线' },
  { chars: ['║'], words: '制表符 双竖线' },
  { chars: ['ā'], words: '拼音 a' },
  { chars: ['á'], words: '拼音 a' },
  { chars: ['ǎ'], words: '拼音 a' },
  { chars: ['à'], words: '拼音 a' },
  { chars: ['ē'], words: '拼音 e' },
  { chars: ['é'], words: '拼音 e' },
  { chars: ['ě'], words: '拼音 e' },
  { chars: ['è'], words: '拼音 e' },
  { chars: ['ī'], words: '拼音 i' },
  { chars: ['í'], words: '拼音 i' },
  { chars: ['ǐ'], words: '拼音 i' },
  { chars: ['ì'], words: '拼音 i' },
  { chars: ['ō'], words: '拼音 o' },
  { chars: ['ó'], words: '拼音 o' },
  { chars: ['ǒ'], words: '拼音 o' },
  { chars: ['ò'], words: '拼音 o' },
  { chars: ['ū'], words: '拼音 u' },
  { chars: ['ú'], words: '拼音 u' },
  { chars: ['ǔ'], words: '拼音 u' },
  { chars: ['ù'], words: '拼音 u' },
  { chars: ['ǖ'], words: '拼音 ü' },
  { chars: ['ǘ'], words: '拼音 ü' },
  { chars: ['ǚ'], words: '拼音 ü' },
  { chars: ['ǜ'], words: '拼音 ü' },
  { chars: ['ü'], words: '拼音 ü' },
]

/** 字符 → 关键词串（导出供测试校验别名字符都在面板内）。 */
export const ALIAS_BY_CHAR = new Map<string, string>()
for (const group of ALIAS_GROUPS) {
  for (const char of group.chars) {
    const prev = ALIAS_BY_CHAR.get(char)
    ALIAS_BY_CHAR.set(char, prev ? `${prev} ${group.words}` : group.words)
  }
}

/** 字符 → 分类名（取第一个出现的分类）。 */
const CATEGORY_BY_CHAR = new Map<string, string>()
for (const category of RTE_SPECIAL_CHAR_CATEGORIES as RteSpecialCharCategory[]) {
  for (const char of category.chars) {
    if (!CATEGORY_BY_CHAR.has(char)) CATEGORY_BY_CHAR.set(char, category.label)
  }
}

/** 面板里所有字符（去重后）。 */
const ALL_CHARS: string[] = Array.from(
  new Set(RTE_SPECIAL_CHAR_CATEGORIES.flatMap((category) => category.chars)),
)

export interface SpecialCharSearchHit {
  char: string
  label: string
  category: string
}

/** 展示名称：别名第一个词 > 分类名 > 字符本身。 */
function labelOf(char: string): string {
  const alias = ALIAS_BY_CHAR.get(char)
  if (alias) return alias.split(' ')[0]
  return CATEGORY_BY_CHAR.get(char) ?? char
}

/**
 * 全库搜索（跨分类）。
 *
 * @param query 关键词；支持中文别名、分类名，或直接粘贴字符
 */
export function searchSpecialChar(query: string, limit = 160): SpecialCharSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SpecialCharSearchHit[] = []
  for (const char of ALL_CHARS) {
    if (char !== query && char.toLowerCase() !== q) {
      const alias = ALIAS_BY_CHAR.get(char)
      const category = CATEGORY_BY_CHAR.get(char)
      const aliasHit = !!alias && alias.toLowerCase().includes(q)
      const categoryHit = !!category && category.toLowerCase().includes(q)
      if (!aliasHit && !categoryHit) continue
    }
    hits.push({ char, label: labelOf(char), category: CATEGORY_BY_CHAR.get(char) ?? '' })
    if (hits.length >= limit) break
  }
  return hits
}

/** 分类是否被关键词命中（用于「跳到分类」）。 */
export function matchSpecialCharCategory(category: { label: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !!q && category.label.toLowerCase().includes(q)
}

/** 给字符取一个可读名称（给 title 用）。 */
export function specialCharLabel(char: string): string {
  return labelOf(char)
}

