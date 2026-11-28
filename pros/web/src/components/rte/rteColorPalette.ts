/** 主题色列名，对应 Word 主题色从左到右的 10 列。 */
export const THEME_COLUMN_NAMES = ['白', '黑', '浅灰', '蓝灰', '冰蓝', '橙', '灰', '金', '蓝', '绿']

/** 主题色网格按行展开后，第 index 格的名称。第 0 行是基色。 */
export function themeColorLabel(index: number): string {
  const col = index % THEME_COLUMN_NAMES.length
  const row = Math.floor(index / THEME_COLUMN_NAMES.length)
  const name = THEME_COLUMN_NAMES[col] || '主题色'
  if (row <= 0) return name
  return `${name} · ${row}`
}

/** 最近使用的颜色：新的放最前，忽略空值和重复，最多保留 limit 个。 */
export function pushRecentColor(list: string[], color: string, limit = 8): string[] {
  const next = color.trim().toLowerCase()
  if (!next) return list
  return [next, ...list.filter((item) => item.toLowerCase() !== next)].slice(0, limit)
}

/**
 * 颜色板数据（文字颜色 / 高亮底色）。
 *
 * 原先这些表只写在 RichTextEditor.vue 里，别的编辑器（类飞书编辑器）没法复用，
 * 于是各自维护一份小色表，颜色名、明暗判定、名称提示都对不齐。
 * 现在统一放在这里：富文本编辑器与类飞书编辑器共用同一份数据与同一套文案。
 */

/** Word 风格主题色：10 列 × 6 行（第 0 行基色，其后明暗变体）。 */
export const WORD_THEME_COLORS: string[][] = [
  ['#FFFFFF', '#F2F2F2', '#D8D8D8', '#BFBFBF', '#A5A5A5', '#7F7F7F'],
  ['#000000', '#7F7F7F', '#595959', '#3F3F3F', '#262626', '#0C0C0C'],
  ['#E7E6E6', '#D0CECE', '#AEABAB', '#757070', '#3A3838', '#171616'],
  ['#44546A', '#D6DCE4', '#ADB9CA', '#8496B0', '#323F4F', '#222A35'],
  ['#5B9BD5', '#DEEBF6', '#BDD7EE', '#9CC2E5', '#2E75B5', '#1F4E79'],
  ['#ED7D31', '#FBE4D5', '#F7CAAC', '#F4B183', '#C55A11', '#833C0B'],
  ['#A5A5A5', '#EDEDED', '#DBDBDB', '#C9C9C9', '#7B7B7B', '#525252'],
  ['#FFC000', '#FFF2CC', '#FFE699', '#FFD966', '#BF9000', '#7F6000'],
  ['#4472C4', '#D6DCE4', '#B4C6E7', '#8EA9DB', '#2F5496', '#1F3864'],
  ['#70AD47', '#E2EFD9', '#C5E0B3', '#A8D08D', '#548235', '#375623'],
]

/** 主题色按行展开（第 0 行为基色），供 CSS grid 按行渲染。 */
export const WORD_THEME_ROWS: string[][] = (() => {
  const rows: string[][] = []
  const cols = WORD_THEME_COLORS.length
  const depth = WORD_THEME_COLORS[0]?.length ?? 0
  for (let r = 0; r < depth; r++) {
    rows.push(Array.from({ length: cols }, (_, c) => WORD_THEME_COLORS[c][r]))
  }
  return rows
})()

/** 主题色按行展平后的一维列表（10 列 × 6 行）。 */
export const WORD_THEME_FLAT: string[] = WORD_THEME_ROWS.flat()

/** 标准颜色一行（Office 常用）。 */
export const WORD_STANDARD_COLOR_ITEMS = [
  { color: '#C00000', label: '深红' },
  { color: '#FF0000', label: '红色' },
  { color: '#FFC000', label: '橙色' },
  { color: '#FFFF00', label: '黄色' },
  { color: '#92D050', label: '浅绿' },
  { color: '#00B050', label: '绿色' },
  { color: '#00B0F0', label: '青绿' },
  { color: '#0070C0', label: '蓝色' },
  { color: '#002060', label: '深蓝' },
  { color: '#7030A0', label: '紫色' },
]

/** 常用底色（柔和，适合正文标注）。 */
export const WORD_HIGHLIGHT_SOFT = [
  { color: '#FFF3BF', label: '淡黄' },
  { color: '#D8F5A2', label: '浅绿' },
  { color: '#A5D8FF', label: '浅蓝' },
  { color: '#FFC9C9', label: '浅粉' },
  { color: '#E5DBFF', label: '浅紫' },
  { color: '#FFE8CC', label: '浅橙' },
  { color: '#C3FAE8', label: '薄荷绿' },
  { color: '#D0EBFF', label: '天空蓝' },
  { color: '#FFDEEB', label: '玫瑰粉' },
  { color: '#E9ECEF', label: '浅灰' },
]

/** 荧光笔（高饱和）。 */
export const WORD_HIGHLIGHT_VIVID = [
  { color: '#FFFF00', label: '荧光黄' },
  { color: '#00FF00', label: '荧光绿' },
  { color: '#00FFFF', label: '青绿' },
  { color: '#FF00FF', label: '品红' },
  { color: '#FF6B6B', label: '珊瑚红' },
  { color: '#74C0FC', label: '亮蓝' },
  { color: '#B197FC', label: '亮紫' },
  { color: '#FFD43B', label: '金黄' },
  { color: '#69DB7C', label: '草绿' },
  { color: '#ADB5BD', label: '中灰' },
]

/** 合并列表（兼容旧引用）。 */
export const WORD_HIGHLIGHT_COLORS = [...WORD_HIGHLIGHT_SOFT, ...WORD_HIGHLIGHT_VIVID]

/** 高亮色的中文名称。 */
export function highlightColorLabel(color: string): string {
  const c = (color || '').toLowerCase()
  if (!c) return '无'
  if (c === '__default__') return '默认高亮'
  const hit = WORD_HIGHLIGHT_COLORS.find((h) => h.color.toLowerCase() === c)
  return hit?.label || color
}

/** 是否是浅色底（浅色要配深色文字）。 */
export function isLightHighlight(color: string): boolean {
  const c = (color || '').toLowerCase()
  if (!c || c === '__default__') return true
  const hex = c.startsWith('#') ? c.slice(1) : c
  if (hex.length !== 3 && hex.length !== 6) return false
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // 相对亮度
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

/** 文字颜色的中文名称（标准色 → 主题色 → 原样）。 */
export function textColorLabel(color: string): string {
  const c = (color || '').toLowerCase()
  if (!c) return '自动'
  const standard = WORD_STANDARD_COLOR_ITEMS.find((item) => item.color.toLowerCase() === c)
  if (standard) return standard.label
  const index = WORD_THEME_FLAT.findIndex((item) => item.toLowerCase() === c)
  if (index >= 0) return themeColorLabel(index)
  return color
}

/** 两个颜色是否同一个（忽略大小写与 # 前缀差异）。 */
export function colorsEqual(a: string, b: string): boolean {
  const x = (a || '').trim().toLowerCase()
  const y = (b || '').trim().toLowerCase()
  if (!x || !y) return false
  return x === y
}
