/** 页眉、页脚、页码。旧文档没有这个字段时视为空，不改变版心。 */

export const PAGE_NUMBER_STYLES = ['none', 'n', 'page-n', 'page-n-of-m', 'dash'] as const

export type PageNumberStyle = (typeof PAGE_NUMBER_STYLES)[number]

export type PanelPageChrome = {
  header: string
  headerEven: string
  footer: string
  footerEven: string
  pageNumber: PageNumberStyle
  /** 装订线，加在左边距上，单位毫米。 */
  gutter: number
}

export const EMPTY_PAGE_CHROME: PanelPageChrome = {
  header: '',
  headerEven: '',
  footer: '',
  footerEven: '',
  pageNumber: 'none',
  gutter: 0,
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
  const gutterRaw = Number(row.gutter)
  const gutter = Number.isFinite(gutterRaw) ? Math.min(40, Math.max(0, Math.round(gutterRaw * 10) / 10)) : 0
  return {
    header: chromeText(row.header),
    headerEven: chromeText(row.headerEven),
    footer: chromeText(row.footer),
    footerEven: chromeText(row.footerEven),
    pageNumber,
    gutter,
  }
}

export function pageChromeIsEmpty(chrome: PanelPageChrome): boolean {
  return !chrome.header && !chrome.headerEven && !chrome.footer && !chrome.footerEven && chrome.pageNumber === 'none' && !chrome.gutter
}

/** 奇数页用页眉，偶数页有单独页眉时用偶数页眉。 */
export function headerForPage(chrome: PanelPageChrome, page: number): string {
  const even = page % 2 === 0
  if (even && chrome.headerEven.trim()) return chrome.headerEven
  return chrome.header
}

function cssQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 浏览器打印时，奇数页和偶数页各用自己的页眉页脚。 */
export function printPageSideCss(chrome: PanelPageChrome): string {
  if (!chrome.headerEven.trim() && !chrome.footerEven.trim()) return ''
  const oddHeader = cssQuote(headerForPage(chrome, 1))
  const evenHeader = cssQuote(headerForPage(chrome, 2))
  const oddFooter = cssQuote(footerForPage(chrome, 1))
  const evenFooter = cssQuote(footerForPage(chrome, 2))
  return `@media print {
    @page :right {
      @top-center { content: "${oddHeader}"; font-size: 10pt; color: #4e5969; }
      @bottom-center { content: "${oddFooter}"; font-size: 10pt; color: #4e5969; }
    }
    @page :left {
      @top-center { content: "${evenHeader}"; font-size: 10pt; color: #4e5969; }
      @bottom-center { content: "${evenFooter}"; font-size: 10pt; color: #4e5969; }
    }
    .rte-root.rte-printing .rte-running-header,
    .rte-root.rte-printing .rte-running-footer { visibility: hidden !important; }
  }`
}

export function footerForPage(chrome: PanelPageChrome, page: number): string {
  const even = page % 2 === 0
  if (even && chrome.footerEven.trim()) return chrome.footerEven
  return chrome.footer
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
    top: chrome.header.trim() || chrome.headerEven.trim() ? CHROME_BAND_MM : 0,
    bottom: chrome.footer.trim() || chrome.footerEven.trim() || chrome.pageNumber !== 'none' ? CHROME_BAND_MM : 0,
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
