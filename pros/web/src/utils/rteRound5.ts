/** 第五轮纯逻辑：日期芯片文案、图片拖放替换、查找替换是否可点。 */

export function todayIso(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateChipText(iso: string, kind: string, label = ''): string {
  const day = (iso || '').trim() || '日期'
  const note = label.trim()
  if (kind === 'remind' && note) return `${day} · ${note}`
  return day
}

export function imageReplaceSide(
  beforeName?: string | null,
  afterName?: string | null,
): 'before' | 'after' | null {
  if (afterName === 'image') return 'after'
  if (beforeName === 'image') return 'before'
  return null
}

export function canRunFindReplace(query: string, matchCount: number): boolean {
  return query.trim().length > 0 && matchCount > 0
}
