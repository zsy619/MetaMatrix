/** 选区文字整理：全半角、中英文空格、按行排序 / 去重 / 编号。 */

export type TextTidyMode =
  | 'half'
  | 'full'
  | 'pangu'
  | 'squeeze'
  | 'sortLines'
  | 'uniqueLines'
  | 'numberLines'

export type TextMenuItem = {
  id: string
  label: string
  sep?: boolean
}

/** 大小写菜单里一并放整理、揭晓和首字下沉，避免工具栏再加按钮。 */
export const TEXT_MENU_ITEMS: readonly TextMenuItem[] = [
  { id: 'upper', label: '全大写' },
  { id: 'lower', label: '全小写' },
  { id: 'title', label: '词首大写' },
  { id: 'sep-width', label: '', sep: true },
  { id: 'half', label: '转为半角' },
  { id: 'full', label: '转为全角' },
  { id: 'pangu', label: '中英文加空格' },
  { id: 'squeeze', label: '去掉多余空格' },
  { id: 'sep-lines', label: '', sep: true },
  { id: 'sortLines', label: '按行排序' },
  { id: 'uniqueLines', label: '去掉重复行' },
  { id: 'numberLines', label: '给每行编号' },
  { id: 'sep-play', label: '', sep: true },
  { id: 'spoiler', label: '揭晓文字' },
  { id: 'dropCap', label: '首字下沉' },
]

const CHAR_MODES = new Set<TextTidyMode>(['half', 'full', 'pangu', 'squeeze'])

export function isCharTidyMode(mode: TextTidyMode): boolean {
  return CHAR_MODES.has(mode)
}

/** 全角 ASCII（！到～）和全角空格转成半角。 */
export function toHalfWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E\u3000]/g, (ch) => {
    if (ch === '\u3000') return ' '
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  })
}

/** 半角可打印字符和空格转成全角。 */
export function toFullWidth(text: string): string {
  return text.replace(/[!-~ ]/g, (ch) => {
    if (ch === ' ') return '\u3000'
    return String.fromCharCode(ch.charCodeAt(0) + 0xfee0)
  })
}

/** 汉字和英文/数字贴在一起时补一个空格，已有空格不叠加。 */
export function panguSpace(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
}

/** 连续空格、制表符、全角空格收成一个半角空格。 */
export function squeezeSpaces(text: string): string {
  return text.replace(/[ \t\u3000]{2,}/g, ' ')
}

export function sortLines(text: string): string {
  return text
    .split('\n')
    .sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
    .join('\n')
}

/** 去掉完全相同的行，保留第一次出现的顺序。 */
export function uniqueLines(text: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out.join('\n')
}

/** 非空行前面加上 1. 2. 3.，已经有编号的先去掉再重排。 */
export function numberLines(text: string): string {
  let n = 1
  return text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line
      const body = line.replace(/^\d+\.\s+/, '')
      const next = `${n}. ${body}`
      n += 1
      return next
    })
    .join('\n')
}

export function tidyText(text: string, mode: TextTidyMode): string {
  if (mode === 'half') return toHalfWidth(text)
  if (mode === 'full') return toFullWidth(text)
  if (mode === 'pangu') return panguSpace(text)
  if (mode === 'squeeze') return squeezeSpaces(text)
  if (mode === 'sortLines') return sortLines(text)
  if (mode === 'uniqueLines') return uniqueLines(text)
  return numberLines(text)
}
