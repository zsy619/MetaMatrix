import type { MethodFooterNote } from '../../types/canvas'

/** 五步法列配色：抬头深色 + 浅色内容区 + 主题词色。与双三角六格同一套区分度。 */
export interface FiveStepPalette {
  header: string
  body: string
  topic: string
}

export const FIVE_STEP_PALETTE = {
  demand: { header: '#A67C00', body: '#FBF6E4', topic: '#7A5C00' },
  solution: { header: '#0E8A84', body: '#E5F6F5', topic: '#0B6B66' },
  business: { header: '#2A649F', body: '#E8F1FA', topic: '#1C4C7C' },
  growth: { header: '#187A4E', body: '#E7F6EF', topic: '#125C3B' },
  moat: { header: '#A84562', body: '#FBEFF2', topic: '#84344C' },
  hypothesis: { header: '#6B4C9A', body: '#F3EEF8', topic: '#4E3574' },
} as const satisfies Record<string, FiveStepPalette>

/** 提高 / 进阶版「非*」：红色抬头 */
export const FIVE_STEP_NEGATE: FiveStepPalette = {
  header: '#C5221F',
  body: '#FDECEA',
  topic: '#9B1C1C',
}

/** 挑战版「非*」：橙色抬头，和紫色方法名分开 */
export const FIVE_STEP_NEGATE_WARM: FiveStepPalette = {
  header: '#C45C26',
  body: '#FFF4EC',
  topic: '#8A3E12',
}

export const DIVISION_RAIL = {
  qualitative: { background: '#F6EBD4', color: '#3C3424' },
  quantitative: { background: '#E5EEF3', color: '#24343C' },
  team: { background: '#E7F6EF', color: '#143C28' },
} as const

export function fiveStepPalette(columnId: string): FiveStepPalette {
  return (
    FIVE_STEP_PALETTE[columnId as keyof typeof FIVE_STEP_PALETTE] ??
    FIVE_STEP_PALETTE.demand
  )
}

export function sectionPalette(
  columnId: string,
  tone: 'normal' | 'negate' | string,
  negate: 'red' | 'warm' = 'red',
): FiveStepPalette {
  if (tone === 'negate') {
    return negate === 'warm' ? FIVE_STEP_NEGATE_WARM : FIVE_STEP_NEGATE
  }
  return fiveStepPalette(columnId)
}

export function resolveMethodFooter(
  footer: MethodFooterNote | undefined,
  fallback: MethodFooterNote | undefined,
): { lead: string; reminders: string[] } {
  const lead = footer?.lead?.trim() || fallback?.lead?.trim() || ''
  const own = (footer?.reminders ?? []).map((line) => line.trim()).filter(Boolean)
  const backup = (fallback?.reminders ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
  return { lead, reminders: own.length > 0 ? own : backup }
}
