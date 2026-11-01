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

/**
 * 其他画布按格 / 按列取色。前 6 色与人类×AI 双三角六格一致
 * （青绿、金、铜、蓝、绿、玫红）；五步法列色走上面的 fiveStepPalette(columnId)，
 * 顺序不同（需求为金、解决方案为青绿），不要用下标互相当列 id。
 */
export interface TableTone {
  header: string
  body: string
  topic: string
}

export const CANVAS_TABLE_TONES: readonly TableTone[] = [
  { header: '#0E8A84', body: '#E5F6F5', topic: '#0B6B66' },
  { header: '#A67C00', body: '#FBF6E4', topic: '#7A5C00' },
  { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  { header: '#2A649F', body: '#E8F1FA', topic: '#1C4C7C' },
  { header: '#187A4E', body: '#E7F6EF', topic: '#125C3B' },
  { header: '#A84562', body: '#FBEFF2', topic: '#84344C' },
  FIVE_STEP_PALETTE.hypothesis,
  { header: '#6A7818', body: '#F4F6E6', topic: '#4E5A10' },
  { header: '#7A3E86', body: '#F6EEF8', topic: '#5C2C66' },
  { header: '#1A7088', body: '#E6F3F6', topic: '#125468' },
  { header: '#8A5A2A', body: '#F8F1E8', topic: '#684218' },
  { header: '#3E5A78', body: '#EEF2F6', topic: '#2C4258' },
]

export function toneAt(index: number): TableTone {
  const len = CANVAS_TABLE_TONES.length
  const n = ((index % len) + len) % len
  return CANVAS_TABLE_TONES[n]!
}

/** 写到格子或列上，供抬头 / 内容区 CSS 变量使用。 */
export function toneVars(index: number): Record<string, string> {
  const tone = toneAt(index)
  return {
    '--tbl-header': tone.header,
    '--tbl-body': tone.body,
    '--tbl-topic': tone.topic,
  }
}
