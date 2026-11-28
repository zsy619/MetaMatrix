/**
 * 导出用 HTML 的「图表已嵌图」处理。
 *
 * 编辑器里的图表是 NodeView（canvas / SVG 实时渲染），`editor.getHTML()` 拿到的
 * 只是 `div[data-type="echarts-block"]` 占位块 —— 直接导出 Markdown / Word / HTML
 * 就会把图表降级成「[图表]」一类占位文案。
 *
 * 这里复用 echartsBlock 已有的白底快照机制（RTE_BEFORE_EXPORT_EVENT）：
 * 导出前让每个图表块生成一张白底静态图，再把占位块换成
 * `<figure><img src="data:image/png;base64,..."></figure>`，
 * 导出结束后（AFTER 事件）还原实时图表。
 */
import { RTE_AFTER_EXPORT_EVENT, RTE_BEFORE_EXPORT_EVENT } from '../extensions/echartsBlock'

/** 图表块默认宽高（兜底用：面板折叠时量不到真实宽度）。 */
export const DEFAULT_CHART_WIDTH = 640
export const DEFAULT_CHART_HEIGHT = 400

/** 一张图表的白底快照。 */
export type ChartSnapshot = {
  /** 图表块 id（chartId），用于把快照对回文档里的图表块。 */
  id: string
  /** 白底快照地址（PNG / SVG data URL）。 */
  src: string
  /** 展示宽度（px）。 */
  width: number
  /** 展示高度（px）。 */
  height: number
  /** 替代文本（无障碍 + Markdown alt）。 */
  alt: string
}

function isSvgDataUrl(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(src)
}

/**
 * 从编辑器 DOM 里收集图表块的白底快照。
 *
 * 快照由 echartsBlock 的 NodeView 在 BEFORE_EXPORT 事件里生成，
 * 元素是 `.rte-echarts-snapshot-img`。
 */
export function collectChartSnapshots(root: HTMLElement | null | undefined): ChartSnapshot[] {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  const out: ChartSnapshot[] = []
  const blocks = Array.from(root.querySelectorAll('[data-type="echarts-block"]'))
  for (const block of blocks) {
    const img = block.querySelector('.rte-echarts-snapshot-img')
    if (!img) continue
    const src = img.getAttribute('src') || ''
    if (!src) continue
    const preview = block.querySelector('.rte-echarts-preview') as HTMLElement | null
    const width = Math.round(preview?.clientWidth || 0) || DEFAULT_CHART_WIDTH
    const height = Math.round(preview?.clientHeight || 0) || DEFAULT_CHART_HEIGHT
    out.push({
      id: block.getAttribute('data-chart-id') || '',
      src,
      width,
      height,
      alt: img.getAttribute('alt') || '图表',
    })
  }
  return out
}

/**
 * 把 HTML 里的图表占位块换成真实快照图。
 *
 * 匹配优先用 chartId；老文档没有 chartId 时按出现顺序（DOM 与文档顺序一致）兜底。
 */
export function embedChartSnapshots(html: string, snapshots: ChartSnapshot[]): string {
  if (!html || !snapshots.length) return html
  if (typeof document === 'undefined') return html
  const container = document.createElement('div')
  container.innerHTML = html
  const blocks = Array.from(container.querySelectorAll('[data-type="echarts-block"]'))
  blocks.forEach((block, index) => {
    const id = block.getAttribute('data-chart-id') || ''
    const snapshot = (id ? snapshots.find((item) => item.id === id) : undefined) || snapshots[index]
    if (!snapshot) return
    const figure = document.createElement('figure')
    figure.className = 'rte-export-chart'
    const img = document.createElement('img')
    img.setAttribute('src', snapshot.src)
    img.setAttribute('alt', snapshot.alt)
    // 尺寸同时写进 data-*：Word 那边要按真实宽高算 EMU，HTML 预览要能自适应。
    img.setAttribute('data-width', String(snapshot.width))
    img.setAttribute('data-height', String(snapshot.height))
    img.setAttribute('style', `width:${snapshot.width}px;max-width:100%;height:auto;`)
    figure.appendChild(img)
    const parent = block.parentNode
    if (parent) parent.replaceChild(figure, block)
  })
  return container.innerHTML
}

/** SVG 快照转 PNG（Word / Markdown 对 SVG 支持差，统一转成白底 PNG）。 */
async function svgDataUrlToPng(src: string, width: number, height: number): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg snapshot decode failed'))
      img.src = src
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // 白底：图表快照本身透明，导出到 Word / PDF 时不该是黑块。
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** 把 SVG 快照尽量统一成 PNG（失败则保留原 SVG）。 */
export async function normalizeChartSnapshot(snapshot: ChartSnapshot): Promise<ChartSnapshot> {
  if (!isSvgDataUrl(snapshot.src)) return snapshot
  const png = await svgDataUrlToPng(snapshot.src, snapshot.width, snapshot.height)
  return png ? { ...snapshot, src: png } : snapshot
}

/**
 * 生成「图表已嵌图」的导出 HTML。
 *
 * 内部会派发 RTE_BEFORE_EXPORT_EVENT 让图表块生成白底快照，
 * 采集完立刻派发 RTE_AFTER_EXPORT_EVENT 还原（快照地址已经拿到手，不依赖 DOM 存活）。
 */
export async function buildExportHtmlWithCharts(opts: {
  /** 编辑器正文 HTML（通常是 editor.getHTML()）。 */
  editorHtml: string
  /** 编辑器根元素（用来找图表块 DOM）。 */
  root: HTMLElement | null | undefined
}): Promise<string> {
  const { editorHtml, root } = opts
  if (typeof window === 'undefined') return editorHtml
  let snapshots: ChartSnapshot[] = []
  window.dispatchEvent(new CustomEvent(RTE_BEFORE_EXPORT_EVENT))
  try {
    snapshots = collectChartSnapshots(root)
  } catch {
    snapshots = []
  } finally {
    window.dispatchEvent(new CustomEvent(RTE_AFTER_EXPORT_EVENT))
  }
  if (!snapshots.length) return editorHtml
  const normalized = await Promise.all(snapshots.map((item) => normalizeChartSnapshot(item)))
  return embedChartSnapshots(editorHtml, normalized)
}
