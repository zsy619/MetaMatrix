/** 页眉、页脚、页码。旧文档没有这个字段时视为空，不改变版心。 */
import { cssPageMargin, type PageMarginBox } from './rtePageMargin'

export const PAGE_NUMBER_STYLES = ['none', 'n', 'page-n', 'page-n-of-m', 'dash', 'roman', 'upper-roman'] as const

export type PageNumberStyle = (typeof PAGE_NUMBER_STYLES)[number]

export type PanelPageChrome = {
  header: string
  headerEven: string
  footer: string
  footerEven: string
  pageNumber: PageNumberStyle
  /** 装订线，单位毫米。屏幕上加在左边，打印时奇数页在左、偶数页在右。 */
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
  { id: 'roman', label: 'i, ii, iii' },
  { id: 'upper-roman', label: 'I, II, III' },
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

function pageOrdinal(page: number): number {
  const n = Math.floor(page)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** 奇数页用页眉，偶数页有单独页眉时用偶数页眉。页码从 1 起算。 */
export function headerForPage(chrome: PanelPageChrome, page: number): string {
  const even = pageOrdinal(page) % 2 === 0
  if (even && chrome.headerEven.trim()) return chrome.headerEven
  return chrome.header
}

function cssQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 页码写成 @page 的 content，才能在隐藏正文页脚后仍印出来。 */
function pageNumberCss(style: PageNumberStyle): string {
  switch (style) {
    case 'n':
      return 'counter(page)'
    case 'page-n':
      return '"第 " counter(page) " 页"'
    case 'page-n-of-m':
      return '"第 " counter(page) " 页 共 " counter(pages) " 页"'
    case 'dash':
      return '"- " counter(page) " -"'
    case 'roman':
      return 'counter(page, lower-roman)'
    case 'upper-roman':
      return 'counter(page, upper-roman)'
    default:
      return ''
  }
}

function pageSideRule(selector: string, header: string, footer: string, pageNumber: PageNumberStyle): string {
  const text = 'font-size: 10pt; color: #4e5969;'
  const lines = [`@top-center { content: "${cssQuote(header)}"; ${text} }`]
  const number = pageNumberCss(pageNumber)
  if (footer && number) {
    lines.push(`@bottom-left { content: "${cssQuote(footer)}"; ${text} }`)
    lines.push(`@bottom-right { content: ${number}; ${text} }`)
  } else if (footer) {
    lines.push(`@bottom-center { content: "${cssQuote(footer)}"; ${text} }`)
  } else if (number) {
    lines.push(`@bottom-center { content: ${number}; ${text} }`)
  } else {
    lines.push(`@bottom-center { content: ""; ${text} }`)
  }
  return `@page ${selector} {\n${lines.join('\n')}\n}`
}

/** 打印用的纸张和页边距。有装订线时，奇数页加在左边，偶数页加在右边。 */
export function printSheetCss(size: string, box: PageMarginBox, gutter = 0): string {
  const safeSize = String(size || 'A4').replace(/[^a-z0-9.\s-]/gi, '') || 'A4'
  const g = Number.isFinite(gutter) ? Math.min(40, Math.max(0, Math.round(gutter * 10) / 10)) : 0
  if (!g) return `@media print { @page { size: ${safeSize}; margin: ${cssPageMargin(box)}; } }`
  const odd = cssPageMargin({ ...box, left: box.left + g })
  const even = cssPageMargin({ ...box, right: box.right + g })
  return `@media print { @page { size: ${safeSize}; margin: ${odd}; } @page :left { margin: ${even}; } }`
}

/** 浏览器打印时，奇数页和偶数页各用自己的页眉页脚，页码留在页边。 */
export function printPageSideCss(chrome: PanelPageChrome): string {
  if (!chrome.headerEven.trim() && !chrome.footerEven.trim()) return ''
  const odd = pageSideRule(':right', headerForPage(chrome, 1), footerForPage(chrome, 1), chrome.pageNumber)
  const even = pageSideRule(':left', headerForPage(chrome, 2), footerForPage(chrome, 2), chrome.pageNumber)
  return `@media print {
    ${odd}
    ${even}
    .rte-root.rte-printing .rte-running-header,
    .rte-root.rte-printing .rte-running-footer { visibility: hidden !important; }
  }`
}

export function footerForPage(chrome: PanelPageChrome, page: number): string {
  const even = pageOrdinal(page) % 2 === 0
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

/** 屏幕边距把装订线加在左边。偶数页预览时改加到右边。 */
export function shiftGutterSide<T extends { top: number; right: number; bottom: number; left: number }>(
  box: T,
  gutter: number,
  page: number,
): T {
  const g = Number.isFinite(gutter) ? Math.min(40, Math.max(0, gutter)) : 0
  if (g <= 0 || pageOrdinal(page) % 2 === 1) return box
  return { ...box, left: Math.max(0, box.left - g), right: box.right + g }
}

export function applyChromeReserve<T extends { top: number; bottom: number }>(box: T, chrome: PanelPageChrome): T {
  const band = chromeBand(chrome)
  return {
    ...box,
    top: Math.max(box.top, band.top),
    bottom: Math.max(box.bottom, band.bottom),
  }
}

function toLowerRoman(page: number): string {
  const parts: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ]
  let left = Math.max(1, Math.min(3999, Math.floor(page)))
  let out = ''
  for (const [value, glyph] of parts) {
    while (left >= value) {
      out += glyph
      left -= value
    }
  }
  return out
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
    case 'roman':
      return toLowerRoman(n)
    case 'upper-roman':
      return toLowerRoman(n).toUpperCase()
    default:
      return ''
  }
}

export function estimatePageCount(contentPx: number, pageInnerPx: number): number {
  if (!Number.isFinite(contentPx) || contentPx <= 0) return 1
  if (!Number.isFinite(pageInnerPx) || pageInnerPx <= 0) return 1
  if (contentPx <= pageInnerPx + 0.5) return 1
  return Math.max(1, Math.ceil((contentPx - 0.5) / pageInnerPx))
}

/** 分页符把正文切成几段。落在开头或结尾的符不单独占一段。 */
export function segmentHeights(breakOffsets: readonly number[], contentHeight: number): number[] {
  const end = Number.isFinite(contentHeight) ? Math.max(0, contentHeight) : 0
  const seen = new Set<number>()
  const marks = breakOffsets
    .filter((offset) => Number.isFinite(offset) && offset > 0 && offset < end)
    .filter((offset) => {
      if (seen.has(offset)) return false
      seen.add(offset)
      return true
    })
    .sort((a, b) => a - b)
  const points = [0, ...marks, end]
  const heights: number[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    heights.push(Math.max(0, points[index + 1]! - points[index]!))
  }
  return heights.length ? heights : [end]
}

/**
 * 分页符后面的内容接到下一页开头。
 * 贴顶的分页符不留空白页。标记本身已经跨过页边时不再多空一页。
 */
export function pageBreakGap(offsetPx: number, blockPx: number, pageInnerPx: number): number {
  if (!Number.isFinite(pageInnerPx) || pageInnerPx <= 0) return 0
  if (!Number.isFinite(offsetPx) || offsetPx <= 1) return 0
  const size = Number.isFinite(blockPx) ? Math.max(0, blockPx) : 0
  const pageEnd = Math.ceil(offsetPx / pageInnerPx) * pageInnerPx
  const gap = pageEnd - offsetPx - size
  return gap > 0 ? Math.round(gap) : 0
}

/** 量高度时去掉已经加上的页间空白，避免空白被再算成一页。 */
export function unwrapPageBreaks(
  tops: readonly number[],
  heights: readonly number[],
  gaps: readonly number[],
  content: number,
): { offsets: number[]; heights: number[]; content: number } {
  let removed = 0
  const offsets: number[] = []
  const rawHeights: number[] = []
  for (let index = 0; index < tops.length; index += 1) {
    const gap = Math.max(0, Number(gaps[index]) || 0)
    offsets.push((tops[index] ?? 0) - removed)
    rawHeights.push(Math.max(0, (heights[index] ?? 0) - gap))
    removed += gap
  }
  return {
    offsets,
    heights: rawHeights,
    content: Math.max(0, (Number.isFinite(content) ? content : 0) - removed),
  }
}

const PREVIEW_PAGE_BREAK =
  /<(?:div\b[^>]*\bdata-page-break=(?:"true"|'true')[^>]*>[\s\S]*?<\/div>|hr\b[^>]*\bdata-page-break=(?:"true"|'true')[^>]*\/?>)/gi

/** 打印预览按分页符拆成多张纸。贴顶的分页符不单占一张空白页。 */
export function splitPreviewPages(html: string): string[] {
  const source = String(html ?? '')
  const parts = source.split(PREVIEW_PAGE_BREAK).map((part) => part.trim())
  if (parts.length <= 1) return [source]
  if (!parts[0]) parts.shift()
  const kept = parts.filter((part) => part.length > 0)
  return kept.length ? kept : ['']
}

/** 每段至少一页。开头的空段是贴顶的分页符，不额外加空白页。 */
export function pagesWithBreaks(segmentHeightsPx: readonly number[], pageInnerPx: number): number {
  const parts = segmentHeightsPx.length ? segmentHeightsPx : [0]
  let total = 0
  parts.forEach((height, index) => {
    if (index === 0 && height <= 0 && parts.length > 1) return
    total += estimatePageCount(height, pageInnerPx)
  })
  return Math.max(1, total)
}

/** 滚动位置落在哪一页。分段规则与 pagesWithBreaks 相同。 */
export function pageIndexAt(segmentHeightsPx: readonly number[], pageInnerPx: number, offsetPx: number): number {
  const parts = segmentHeightsPx.length ? segmentHeightsPx : [0]
  const inner = Number.isFinite(pageInnerPx) && pageInnerPx > 0 ? pageInnerPx : 1
  const offset = Number.isFinite(offsetPx) ? Math.max(0, offsetPx) : 0
  let cursor = 0
  let page = 1
  for (let index = 0; index < parts.length; index += 1) {
    const height = Math.max(0, parts[index] ?? 0)
    if (index === 0 && height <= 0 && parts.length > 1) continue
    const pages = estimatePageCount(height, inner)
    const last = index === parts.length - 1
    if (!last && offset >= cursor + height) {
      cursor += height
      page += pages
      continue
    }
    const into = Math.max(0, offset - cursor)
    const local = Math.min(pages, Math.floor(into / inner) + 1)
    return page + local - 1
  }
  return page
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
