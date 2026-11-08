/**
 * 标题自动编号的导出副本。
 * 规则与编辑器 CSS 计数器一致（h1 为「1. 」，更深为「1.1 」这种，不带末尾点）。
 * 只改返回的 HTML，不改调用方传入的字符串，也不写回编辑器正文。
 * Word 导出把这段文字放进 OOXML 段落，不是 Word 自动编号域。
 */

const LEVELS = 6

function prefix(counters: number[], level: number): string {
  const parts: string[] = []
  for (let i = 0; i < level; i += 1) parts.push(String(counters[i] ?? 0))
  if (level <= 1) return `${parts[0] ?? 0}. `
  return `${parts.join('.')} `
}

/** 按文档顺序给 h1–h6 加上与屏幕相同的编号。开关关闭时不要调用。 */
export function withHeadingNumbers(html: string): string {
  if (typeof document === 'undefined') return html
  const root = document.createElement('div')
  root.innerHTML = html || ''
  const counters = Array.from({ length: LEVELS }, () => 0)
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const level = Number(node.tagName[1])
    if (!Number.isInteger(level) || level < 1 || level > LEVELS) return
    if (level < LEVELS) counters[level] = 0
    counters[level - 1] = (counters[level - 1] ?? 0) + 1
    node.insertBefore(document.createTextNode(prefix(counters, level)), node.firstChild)
  })
  return root.innerHTML
}
