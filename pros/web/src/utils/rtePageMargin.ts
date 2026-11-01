/** 页边距。宽度 100% 和飞书样式缺省几乎无边距；纸张缺省为 Word 常规。 */

export const PAGE_MARGIN_PRESET_IDS = ['none', 'narrow', 'moderate', 'normal', 'wide', 'custom'] as const

export type PageMarginPreset = (typeof PAGE_MARGIN_PRESET_IDS)[number]

export type PageMarginBox = {
  top: number
  right: number
  bottom: number
  left: number
}

export type PageMargin = PageMarginBox & {
  preset: PageMarginPreset
}

export const PAGE_MARGIN_MIN_MM = 0
export const PAGE_MARGIN_MAX_MM = 80

export const PAGE_MARGIN_PRESETS: ReadonlyArray<{
  id: Exclude<PageMarginPreset, 'custom'>
  label: string
  hint: string
  box: PageMarginBox
}> = [
  { id: 'normal', label: '常规', hint: '上下 25.4mm，左右 31.8mm', box: { top: 25.4, right: 31.8, bottom: 25.4, left: 31.8 } },
  { id: 'narrow', label: '窄', hint: '四边 12.7mm', box: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { id: 'moderate', label: '适中', hint: '上下 25.4mm，左右 19.1mm', box: { top: 25.4, right: 19.1, bottom: 25.4, left: 19.1 } },
  { id: 'wide', label: '宽', hint: '上下 25.4mm，左右 50.8mm', box: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 } },
  { id: 'none', label: '无边距', hint: '四边 0', box: { top: 0, right: 0, bottom: 0, left: 0 } },
]

const PRESET_BY_ID = new Map(PAGE_MARGIN_PRESETS.map((item) => [item.id, item]))

export function clampMarginMm(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  const clamped = Math.min(PAGE_MARGIN_MAX_MM, Math.max(PAGE_MARGIN_MIN_MM, n))
  return Math.round(clamped * 10) / 10
}

export function marginBox(preset: Exclude<PageMarginPreset, 'custom'>): PageMarginBox {
  return { ...PRESET_BY_ID.get(preset)!.box }
}

export function normalizePageMargin(raw: unknown): PageMargin | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const preset = PAGE_MARGIN_PRESET_IDS.includes(row.preset as PageMarginPreset)
    ? (row.preset as PageMarginPreset)
    : null
  if (!preset) return null
  if (preset !== 'custom') {
    return { preset, ...marginBox(preset) }
  }
  return {
    preset: 'custom',
    top: clampMarginMm(row.top),
    right: clampMarginMm(row.right),
    bottom: clampMarginMm(row.bottom),
    left: clampMarginMm(row.left),
  }
}

/** 没有保存过时：铺满和飞书样式无边距，纸张用常规。 */
export function defaultPageMargin(pageIsPaper: boolean): PageMargin {
  return pageIsPaper ? { preset: 'normal', ...marginBox('normal') } : { preset: 'none', ...marginBox('none') }
}

export function marginsEqual(a: PageMargin, b: PageMargin): boolean {
  return a.preset === b.preset && a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

export function readPageMargin(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
  pageIsPaper: boolean,
): PageMargin {
  const fallback = defaultPageMargin(pageIsPaper)
  if (!map || !panelId) return fallback
  return normalizePageMargin(map[panelId]) || fallback
}

export function writePageMargin(
  map: Record<string, { preset: string; top: number; right: number; bottom: number; left: number }> | null | undefined,
  panelId: string,
  margin: PageMargin,
  pageIsPaper: boolean,
): Record<string, PageMargin> | undefined {
  const next: Record<string, PageMargin> = { ...(map || {}) } as Record<string, PageMargin>
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizePageMargin(margin) || defaultPageMargin(pageIsPaper)
  if (marginsEqual(normalized, defaultPageMargin(pageIsPaper))) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}

/** 宽度 100% 和飞书样式只把边距用在左右。 */
export function screenMargin(margin: PageMargin, fluid: boolean): PageMarginBox {
  if (!fluid) return { top: margin.top, right: margin.right, bottom: margin.bottom, left: margin.left }
  return { top: 0, right: margin.right, bottom: 0, left: margin.left }
}

export function cssPageMargin(box: PageMarginBox): string {
  return `${clampMarginMm(box.top)}mm ${clampMarginMm(box.right)}mm ${clampMarginMm(box.bottom)}mm ${clampMarginMm(box.left)}mm`
}
