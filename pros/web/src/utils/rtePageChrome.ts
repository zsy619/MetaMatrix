/** 页眉、页脚、页码。旧文档没有这个字段时视为空，不改变版心。 */

export const PAGE_NUMBER_STYLES = ['none', 'n', 'page-n', 'page-n-of-m', 'dash'] as const

export type PageNumberStyle = (typeof PAGE_NUMBER_STYLES)[number]

export type PanelPageChrome = {
  header: string
  footer: string
  pageNumber: PageNumberStyle
}

export const EMPTY_PAGE_CHROME: PanelPageChrome = {
  header: '',
  footer: '',
  pageNumber: 'none',
}

export const PAGE_NUMBER_OPTIONS: ReadonlyArray<{ id: PageNumberStyle; label: string }> = [
  { id: 'none', label: '无' },
  { id: 'n', label: '1' },
  { id: 'page-n', label: '第 1 页' },
  { id: 'page-n-of-m', label: '第 1 页 共 n 页' },
  { id: 'dash', label: '- 1 -' },
]

/** 页眉或页脚占用的最小边带。已有边距更大时不额外加高。 */
export const CHROME_BAND_MM = 10

const TEXT_MAX = 80

export type PresentUnit = 'block' | 'screen'

export type SlideSource = {
  html: string
  text: string
  heading: boolean
}

function chromeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, TEXT_MAX)
}

export function normalizePageChrome(raw: unknown): PanelPageChrome {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PAGE_CHROME }
  const row = raw as Record<string, unknown>
  const pageNumber = PAGE_NUMBER_STYLES.includes(row.pageNumber as PageNumberStyle)
    ? (row.pageNumber as PageNumberStyle)
    : 'none'
  return {
    header: chromeText(row.header),
    footer: chromeText(row.footer),
    pageNumber,
  }
}

export function pageChromeIsEmpty(chrome: PanelPageChrome): boolean {
  return !chrome.header && !chrome.footer && chrome.pageNumber === 'none'
}

export function readPageChrome(
  map: Record<string, unknown> | null | undefined,
  panelId: string | null | undefined,
): PanelPageChrome {
  if (!map || !panelId) return { ...EMPTY_PAGE_CHROME }
  return normalizePageChrome(map[panelId])
}

export function writePageChrome(
  map: Record<string, { header?: string; footer?: string; pageNumber?: string }> | null | undefined,
  panelId: string,
  chrome: PanelPageChrome,
): Record<string, PanelPageChrome> | undefined {
  const next: Record<string, PanelPageChrome> = {}
  if (map) {
    for (const [id, value] of Object.entries(map)) next[id] = normalizePageChrome(value)
  }
  if (!panelId) return Object.keys(next).length ? next : undefined
  const normalized = normalizePageChrome(chrome)
  if (pageChromeIsEmpty(normalized)) delete next[panelId]
  else next[panelId] = normalized
  return Object.keys(next).length ? next : undefined
}

export function chromeBand(chrome: PanelPageChrome): { top: number; bottom: number } {
  return {
    top: chrome.header.trim() ? CHROME_BAND_MM : 0,
    bottom: chrome.footer.trim() || chrome.pageNumber !== 'none' ? CHROME_BAND_MM : 0,
  }
}

export function applyChromeReserve<T extends { top: number; bottom: number }>(box: T, chrome: PanelPageChrome): T {
  const band = chromeBand(chrome)
  return {
    ...box,
    top: Math.max(box.top, band.top),
    bottom: Math.max(box.bottom, band.bottom),
  }
}

export function formatPageNumber(style: PageNumberStyle, page: number, total: number): string {
  const n = Math.max(1, Math.floor(page) || 1)
  const m = Math.max(n, Math.floor(total) || 1)
  switch (style) {
    case 'n':
      return String(n)
    case 'page-n':
      return `第 ${n} 页`
    case 'page-n-of-m':
      return `第 ${n} 页 共 ${m} 页`
    case 'dash':
      return `- ${n} -`
    default:
      return ''
  }
}

export function estimatePageCount(contentPx: number, pageInnerPx: number): number {
  if (!Number.isFinite(contentPx) || contentPx <= 0) return 1
  if (!Number.isFinite(pageInnerPx) || pageInnerPx <= 0) return 1
  return Math.max(1, Math.ceil(contentPx / pageInnerPx))
}

/** 按块：每个可见块一屏。按屏：标题另起一屏，过长时再按字数切开。 */
export function groupSlides(blocks: readonly SlideSource[], unit: PresentUnit, screenChars = 480): string[] {
  const usable = blocks.filter((block) => block.html.trim())
  if (!usable.length) return ['<p class="rte-present-empty">空白文档</p>']
  if (unit === 'block') return usable.map((block) => block.html)
  const slides: string[][] = []
  let bucket: string[] = []
  let chars = 0
  const flush = () => {
    if (!bucket.length) return
    slides.push(bucket)
    bucket = []
    chars = 0
  }
  for (const block of usable) {
    const weight = block.text.trim().length || 160
    const headingBreak = block.heading && bucket.length > 0
    const overflow = chars > 0 && chars + weight > screenChars
    if (headingBreak || overflow) flush()
    bucket.push(block.html)
    chars += weight
  }
  flush()
  return slides.map((parts) => parts.join(''))
}
