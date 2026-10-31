/** 选区大小写转换（按文本节点改写） */
export type CaseMode = 'upper' | 'lower' | 'title'

function toTitle(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function transformCaseText(text: string, mode: CaseMode): string {
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'lower') return text.toLowerCase()
  return toTitle(text)
}
