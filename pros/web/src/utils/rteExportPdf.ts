import type html2canvasType from 'html2canvas'
import { jsPDF } from 'jspdf'
import { footerForPage, formatPageNumber, headerForPage, pageChromeIsEmpty, type PanelPageChrome } from './rtePageChrome'
import { pdfPageFormat, type RtePageSizeId } from './rtePageSize'

/**
 * 单个正文 Canvas 的像素预算。
 *
 * 64M 像素的一份 RGBA 像素数据约占用 256MB 内存；PDF 分页时还会短暂存在一页副本。
 * 预算的目的不是限制文档页数，而是在浏览器分配巨型位图之前明确失败，避免标签页崩溃。
 */
export const DEFAULT_EXPORT_PIXEL_BUDGET = 64_000_000

export type ExportProgressPhase = 'prepare' | 'rasterize' | 'paginate' | 'render' | 'finalize'

export type ExportProgress = {
  /** 当前阶段，调用方可据此显示「栅格化 / 分页 / 渲染」等真实状态。 */
  phase: ExportProgressPhase
  /** 当前阶段内已完成的数量；没有可拆分任务时为 0 或 1。 */
  completed: number
  /** 当前阶段总任务数；没有可拆分任务时为 1。 */
  total: number
  /** 整次导出的估算百分比，只根据已经完成的阶段推进，不伪造计时进度。 */
  percent: number
}

export type RasterizeExportOptions = {
  /** Canvas 相对 DOM 像素的缩放比例。 */
  scale?: number
  /** 正文 Canvas 允许的最大像素数，默认使用浏览器安全预算。 */
  maxPixels?: number
  /** 调用方取消信号；取消后绝不会返回可下载的成功结果。 */
  signal?: AbortSignal
  /** 阶段推进回调。 */
  onProgress?: (progress: ExportProgress) => void
  /** 兼容 html2canvas 的文档渲染尺寸，PDF 会传入正文完整尺寸。 */
  windowWidth?: number
  windowHeight?: number
}

/** 像素预算错误必须与普通导出失败区分，且文案明确说明没有生成不完整文件。 */
export class ExportPixelBudgetError extends Error {
  readonly requiredPixels: number
  readonly maxPixels: number

  constructor(requiredPixels: number, maxPixels: number) {
    super(
      `导出内容约需 ${Math.ceil(requiredPixels)} 像素，超过 ${maxPixels} 像素的安全预算；` +
        '为避免浏览器崩溃已停止导出，未生成不完整文件',
    )
    this.name = 'ExportPixelBudgetError'
    this.requiredPixels = requiredPixels
    this.maxPixels = maxPixels
  }
}

/** 统一的取消错误；使用标准 name，调用方无需依赖某个错误类实现。 */
export function createExportAbortError(): Error {
  const error = new Error('导出已取消，未生成文件')
  error.name = 'AbortError'
  return error
}

export function throwIfExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createExportAbortError()
}

/**
 * 在创建 Canvas 前核算位图像素，Canvas 创建后再按真实尺寸复核。
 * 后一次复核可覆盖浏览器布局在栅格化期间发生变化的情况，不能靠静默缩放绕过预算。
 */
export function assertRasterPixelBudget(
  width: number,
  height: number,
  scale = 1,
  maxPixels = DEFAULT_EXPORT_PIXEL_BUDGET,
): void {
  const safeScale = Math.max(0.01, scale)
  const requiredPixels = Math.ceil(width * safeScale) * Math.ceil(height * safeScale)
  if (!Number.isFinite(requiredPixels) || requiredPixels > maxPixels) {
    throw new ExportPixelBudgetError(requiredPixels, maxPixels)
  }
}

/** 把分页、文字层等长循环切成宏任务，让取消点击和进度绘制有机会进入主线程。 */
export async function yieldToExportMainThread(signal?: AbortSignal): Promise<void> {
  throwIfExportAborted(signal)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  throwIfExportAborted(signal)
}

/**
 * 纯分页规划：不再设置 200 页硬上限，循环唯一的正常结束条件是正文高度全部消费完。
 * softBreak 仍可向上寻找空白行，因此保留现有软分页与表格续页所依赖的切片结构。
 */
export function planPdfSlices(options: {
  canvasHeight: number
  pagePx: number
  forcedBreaks?: number[]
  softBreak?: (startY: number, preferredEndY: number) => number
}): number[] {
  const canvasHeight = Math.max(0, Math.floor(options.canvasHeight))
  const pagePx = Math.max(1, Math.floor(options.pagePx))
  const forcedBreaks = [...(options.forcedBreaks || [])].sort((a, b) => a - b)
  const slices: number[] = []
  let y = 0

  // 与原实现一致，末尾不足 2px 的栅格边缘不单独成页；其余所有高度必须被切片覆盖。
  while (y < canvasHeight - 2) {
    let sliceH = Math.min(pagePx, canvasHeight - y)
    const forced = forcedBreaks.find((at) => at > y + 40 && at < y + sliceH)
    if (forced) {
      sliceH = forced - y
    } else if (options.softBreak && sliceH >= pagePx && y + sliceH < canvasHeight) {
      const softEnd = options.softBreak(y, y + sliceH)
      sliceH = Math.max(40, softEnd - y)
    }

    // 外部软分页回调若返回非法位置，必须中止而不是让循环原地踏步或丢弃后续内容。
    if (!Number.isFinite(sliceH) || sliceH <= 0 || y + sliceH > canvasHeight) {
      throw new Error(`分页位置无效：第 ${slices.length + 1} 页，起始 y=${y}，切片高度=${sliceH}`)
    }
    slices.push(sliceH)
    y += sliceH
  }

  const consumedHeight = slices.reduce((total, height) => total + height, 0)
  if (consumedHeight > canvasHeight || canvasHeight - consumedHeight > 2) {
    throw new Error(`分页不完整：正文高度 ${canvasHeight}，已规划高度 ${consumedHeight}`)
  }
  return slices
}

/**
 * PNG 与 PDF 共用的预栅格化入口。html2canvas 本身不支持 AbortSignal，
 * 因此在调用前后都检查信号；即使底层任务稍后完成，也只会得到取消错误而不会触发下载。
 */
export async function rasterizeElementForExport(
  el: HTMLElement,
  options: RasterizeExportOptions = {},
  rasterizeImpl?: typeof html2canvasType,
): Promise<HTMLCanvasElement> {
  // html2canvas 约 1MB，按需加载：只有真的导出时才拉进来。
  const rasterize = rasterizeImpl ?? (await loadHtml2Canvas())
  const scale = options.scale ?? 2
  const maxPixels = options.maxPixels ?? DEFAULT_EXPORT_PIXEL_BUDGET
  const signal = options.signal
  const report = (phase: ExportProgressPhase, completed: number, percent: number) => {
    options.onProgress?.({ phase, completed, total: 1, percent })
  }

  throwIfExportAborted(signal)
  report('prepare', 0, 0)
  const width = Math.max(1, el.scrollWidth || el.clientWidth || 1)
  const height = Math.max(1, el.scrollHeight || el.clientHeight || 1)
  assertRasterPixelBudget(width, height, scale, maxPixels)

  report('rasterize', 0, 10)
  const canvas = await rasterize(el, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    windowWidth: options.windowWidth,
    windowHeight: options.windowHeight,
  })
  throwIfExportAborted(signal)
  assertRasterPixelBudget(canvas.width, canvas.height, 1, maxPixels)
  report('rasterize', 1, 90)
  return canvas
}

/** 在接近分页处向上寻找「偏白」行，避免切到文字中间 */
function findSoftBreakY(
  ctx: CanvasRenderingContext2D,
  width: number,
  startY: number,
  endY: number,
  preferY: number,
): number {
  const searchFrom = Math.max(startY, preferY - Math.floor((preferY - startY) * 0.12))
  const row = ctx.getImageData(0, 0, width, 1).data
  let best = preferY
  let bestScore = -1
  const step = Math.max(1, Math.floor((preferY - searchFrom) / 80))
  for (let y = preferY; y >= searchFrom; y -= step) {
    const data = ctx.getImageData(0, y, width, 1).data
    let white = 0
    const stride = 4 * 8 // sample every 8px
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 20 || (r > 245 && g > 245 && b > 245)) white += 1
    }
    const samples = Math.ceil(data.length / stride)
    const score = white / Math.max(1, samples)
    if (score >= 0.92 && score >= bestScore) {
      bestScore = score
      best = y
      if (score >= 0.99) break
    }
  }
  void row
  void endY
  return Math.max(startY + 40, best)
}

/**
 * 将编辑器 DOM 栅格化后写入多页 A4 PDF。
 * 按页切片 + 软分页（避开文字行），提升清晰度与翻页观感。
 */
async function rasterLine(text: string, widthPx: number, signal?: AbortSignal): Promise<HTMLCanvasElement | null> {
  throwIfExportAborted(signal)
  const line = text.trim()
  if (!line || widthPx < 8) return null
  const host = document.createElement('div')
  host.textContent = line
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${Math.round(widthPx)}px`,
    'padding:0',
    'margin:0',
    'background:#fff',
    'color:#4e5969',
    'font:12px/1.4 system-ui,-apple-system,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif',
    'text-align:center',
    'white-space:nowrap',
    'overflow:hidden',
  ].join(';')
  document.body.appendChild(host)
  try {
    const rasterize = await loadHtml2Canvas()
    const canvas = await rasterize(host, { backgroundColor: '#ffffff', scale: 2, logging: false })
    throwIfExportAborted(signal)
    return canvas
  } catch (error) {
    // 字体降级可以忽略，但用户取消必须继续向上抛，不能伪装成一次成功导出。
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    return null
  } finally {
    host.remove()
  }
}

let cachedCjkFont = ''

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x2000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return btoa(binary)
}

/** 载入子集中文字体，让 PDF 文字层里的汉字可以选中。失败时仍用默认字体，下次导出再试。 */
async function useCjkFont(pdf: jsPDF, signal?: AbortSignal): Promise<void> {
  try {
    throwIfExportAborted(signal)
    if (!cachedCjkFont) {
      const url = `${import.meta.env.BASE_URL}fonts/DroidSansFallback.ttf`
      const response = await fetch(url, { signal })
      throwIfExportAborted(signal)
      if (!response.ok) return
      cachedCjkFont = bytesToBase64(new Uint8Array(await response.arrayBuffer()))
      throwIfExportAborted(signal)
    }
    pdf.addFileToVFS('DroidSansFallback.ttf', cachedCjkFont)
    pdf.addFont('DroidSansFallback.ttf', 'DroidSansFallback', 'normal', 'Identity-H')
    pdf.setFont('DroidSansFallback', 'normal')
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    cachedCjkFont = ''
  }
}

type TableHeadMark = { top: number; height: number; tableTop: number; tableBottom: number }

function canvasPageMarks(el: HTMLElement, canvasHeight: number): { breaks: number[]; headers: TableHeadMark[] } {
  const root = el.getBoundingClientRect()
  const scaleY = canvasHeight / Math.max(1, el.scrollHeight)
  const breaks: number[] = []
  el.querySelectorAll('.rte-page-break').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const at = (node.getBoundingClientRect().top - root.top) * scaleY
    if (at > 40 && at < canvasHeight - 40) breaks.push(Math.round(at))
  })
  const headers: TableHeadMark[] = []
  el.querySelectorAll('table').forEach((table) => {
    const row = table.querySelector('tr')
    const cells = row ? [...row.children] : []
    if (!row || !cells.length || !cells.every((cell) => cell.tagName === 'TH')) return
    if (cells.some((cell) => (cell as HTMLTableCellElement).rowSpan > 1)) return
    const tableRect = table.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    headers.push({
      top: (rowRect.top - root.top) * scaleY,
      height: Math.max(1, rowRect.height * scaleY),
      tableTop: (tableRect.top - root.top) * scaleY,
      tableBottom: (tableRect.bottom - root.top) * scaleY,
    })
  })
  return { breaks: breaks.sort((a, b) => a - b), headers }
}

function stampContinuedTableHead(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  headers: TableHeadMark[],
  offset: number,
) {
  headers.forEach((header) => {
    const continues = header.tableBottom > offset + 8 && header.top < offset - 4 && header.tableTop < offset
    if (!continues) return
    const height = Math.max(1, Math.round(header.height))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, height)
    ctx.drawImage(canvas, 0, Math.round(header.top), canvas.width, height, 0, 0, canvas.width, height)
  })
}

function paintChromeText(pdf: jsPDF, text: string, x: number, y: number) {
  const line = text.trim()
  if (!line) return
  try {
    pdf.setFont('DroidSansFallback', 'normal')
  } catch {
    /* 字体没载入时用默认字体 */
  }
  pdf.setFontSize(9)
  pdf.setTextColor(78, 89, 105)
  try {
    pdf.text(line, x, y)
  } catch {
    /* 个别字符缺字时不让整份导出失败 */
  }
  pdf.setTextColor(0, 0, 0)
}

function drawStrip(
  pdf: jsPDF,
  img: HTMLCanvasElement | null,
  xMm: number,
  yMm: number,
  wMm: number,
) {
  if (!img || !img.width || !img.height) return
  const hMm = (img.height / img.width) * wMm
  pdf.addImage(img.toDataURL('image/png'), 'PNG', xMm, yMm, wMm, Math.max(3, hMm))
}

export async function buildPdfFromElement(
  el: HTMLElement,
  opts?: {
    title?: string
    pageSize?: RtePageSizeId
    marginMm?: { top: number; right: number; bottom: number; left: number }
    chrome?: PanelPageChrome
    /** 与 PNG 共用同一位图预算，超出时明确失败，不降低分辨率或裁掉后续页面。 */
    maxPixels?: number
    signal?: AbortSignal
    onProgress?: (progress: ExportProgress) => void
  },
): Promise<Blob> {
  const signal = opts?.signal
  const report = (phase: ExportProgressPhase, completed: number, total: number, percent: number) => {
    opts?.onProgress?.({ phase, completed, total, percent })
  }
  const scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.5))
  const canvas = await rasterizeElementForExport(el, {
    scale,
    maxPixels: opts?.maxPixels,
    signal,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
    onProgress: progress => {
      // 正文位图是后续所有页面的源数据，占整个导出流程的前 35%。
      report(progress.phase, progress.completed, progress.total, Math.round(progress.percent * 0.35))
    },
  })
  throwIfExportAborted(signal)

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: pdfPageFormat(opts?.pageSize || 'a4'),
  })
  if (opts?.title) {
    try {
      pdf.setProperties({ title: opts.title })
    } catch {
      /* 标题元数据失败不影响正文导出 */
    }
  }
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const marginTop = opts?.marginMm?.top ?? 10
  const marginRight = opts?.marginMm?.right ?? 10
  const marginBottom = opts?.marginMm?.bottom ?? 10
  const marginLeft = opts?.marginMm?.left ?? 10
  const usableW = pageWidth - marginLeft - marginRight
  const usableH = pageHeight - marginTop - marginBottom

  const imgWmm = usableW
  // 一张 PDF 页面高度对应多少个 Canvas 像素。
  const pagePx = Math.max(1, Math.floor((usableH * canvas.width) / imgWmm))
  report('paginate', 0, 1, 36)
  await yieldToExportMainThread(signal)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const marks = canvasPageMarks(el, canvas.height)
  const slices = planPdfSlices({
    canvasHeight: canvas.height,
    pagePx,
    forcedBreaks: marks.breaks,
    softBreak: ctx
      ? (startY, preferredEndY) => findSoftBreakY(ctx, canvas.width, startY, preferredEndY, preferredEndY)
      : undefined,
  })
  report('paginate', 1, 1, 40)

  const chrome = opts?.chrome && !pageChromeIsEmpty(opts.chrome) ? opts.chrome : null
  const total = Math.max(1, slices.length)
  await useCjkFont(pdf, signal)
  const cjkReady = Boolean(cachedCjkFont)
  const headerImgs: Array<HTMLCanvasElement | null> = []
  const footerImgs: Array<HTMLCanvasElement | null> = []
  if (chrome && !cjkReady) {
    for (let i = 0; i < total; i += 1) {
      // 每页页眉页脚都是独立栅格化任务，必须让出主线程并响应取消。
      await yieldToExportMainThread(signal)
      const header = headerForPage(chrome, i + 1)
      headerImgs.push(header ? await rasterLine(header, canvas.width / scale, signal) : null)
      const footer = footerForPage(chrome, i + 1)
      if (footer || chrome.pageNumber !== 'none') {
        const line = [footer, formatPageNumber(chrome.pageNumber, i + 1, total)].filter(Boolean).join('    ')
        footerImgs.push(line ? await rasterLine(line, canvas.width / scale, signal) : null)
      } else {
        footerImgs.push(null)
      }
      report('render', i + 1, total, 40 + Math.round(((i + 1) / total) * 10))
    }
  }

  if (!slices.length) {
    pdf.text(opts?.title || '', marginLeft, marginTop + 6)
    if (cjkReady && chrome) paintChromeText(pdf, headerForPage(chrome, 1), marginLeft, 6)
    else drawStrip(pdf, headerImgs[0] || null, marginLeft, 2, usableW)
    throwIfExportAborted(signal)
    const blob = pdf.output('blob')
    throwIfExportAborted(signal)
    report('finalize', 1, 1, 100)
    return blob
  }

  let offset = 0
  for (let pageIndex = 0; pageIndex < slices.length; pageIndex += 1) {
    const sliceH = slices[pageIndex]!
    // JPEG 编码与 PDF 写入是同步长任务；逐页让出主线程可避免长文档导出完全卡死 UI。
    await yieldToExportMainThread(signal)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceH
    const pctx = pageCanvas.getContext('2d')
    if (!pctx) throw new Error(`无法创建 PDF 第 ${pageIndex + 1} 页画布，导出已停止`)
    pctx.fillStyle = '#ffffff'
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    stampContinuedTableHead(pctx, canvas, marks.headers, offset)
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.93)
    if (!imgData.startsWith('data:image/jpeg')) {
      throw new Error(`PDF 第 ${pageIndex + 1} 页图像编码失败，未生成不完整文件`)
    }
    const sliceHmm = (sliceH * imgWmm) / canvas.width
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWmm, sliceHmm)
    // 编码数据已交给 jsPDF，立即释放本页位图，避免正文 Canvas 与所有分页 Canvas 同时常驻。
    pageCanvas.width = 1
    pageCanvas.height = 1
    if (cjkReady && chrome) {
      paintChromeText(pdf, headerForPage(chrome, pageIndex + 1), marginLeft, 6)
      const footerLine = [
        footerForPage(chrome, pageIndex + 1),
        formatPageNumber(chrome.pageNumber, pageIndex + 1, total),
      ]
        .filter(Boolean)
        .join('    ')
      paintChromeText(pdf, footerLine, marginLeft, pageHeight - 6)
    } else {
      drawStrip(pdf, headerImgs[pageIndex] || null, marginLeft, Math.max(1, (marginTop - 6) / 2), usableW)
      const footer = footerImgs[pageIndex]
      if (footer) {
        const footerHmm = (footer.height / footer.width) * usableW
        drawStrip(pdf, footer, marginLeft, pageHeight - marginBottom + Math.max(1, (marginBottom - footerHmm) / 2), usableW)
      }
    }
    offset += sliceH
    report('render', pageIndex + 1, total, 50 + Math.round(((pageIndex + 1) / total) * 40))
  }

  // 防御性完整性校验：任何未来的分页改动若留下正文，都不能再静默返回成功。
  if (offset > canvas.height || canvas.height - offset > 2) {
    throw new Error(`PDF 分页不完整：正文高度 ${canvas.height}，已导出高度 ${offset}`)
  }
  await addSelectableLayer(pdf, el, canvas, slices, marginLeft, marginTop, imgWmm, signal)
  report('finalize', 0, 1, 95)
  await yieldToExportMainThread(signal)
  const blob = pdf.output('blob')
  throwIfExportAborted(signal)
  report('finalize', 1, 1, 100)
  return blob
}

/** 在截图之上铺一层可选中的正文，并把外链做成可点击区域。 */
async function addSelectableLayer(
  pdf: jsPDF,
  el: HTMLElement,
  canvas: HTMLCanvasElement,
  slices: number[],
  marginLeft: number,
  marginTop: number,
  imgWmm: number,
  signal?: AbortSignal,
) {
  const root = el.getBoundingClientRect()
  const scaleX = canvas.width / Math.max(1, el.scrollWidth)
  const scaleY = canvas.height / Math.max(1, el.scrollHeight)
  const pageOf = (yPx: number) => {
    let cursor = 0
    for (let page = 0; page < slices.length; page += 1) {
      const height = slices[page]!
      if (yPx < cursor + height) return { page, y: yPx - cursor }
      cursor += height
    }
    return null
  }
  const toMm = (px: number) => (px * imgWmm) / Math.max(1, canvas.width)
  const textNodes = [...el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')]
  for (let index = 0; index < textNodes.length; index += 1) {
    // 大量段落时文字层也可能成为长任务，按小批次让出主线程并检查取消。
    if (index % 20 === 0) await yieldToExportMainThread(signal)
    const node = textNodes[index]!
    if (!(node instanceof HTMLElement)) continue
    const text = (node.innerText || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const rect = node.getBoundingClientRect()
    const yPx = (rect.top - root.top) * scaleY
    const found = pageOf(yPx)
    if (!found) continue
    pdf.setPage(found.page + 1)
    try {
      pdf.setFont('DroidSansFallback', 'normal')
    } catch {
      /* 字体没载入时用默认字体 */
    }
    pdf.setFontSize(Math.max(8, Math.min(16, rect.height * 0.45)))
    pdf.text(text.slice(0, 500), marginLeft + toMm((rect.left - root.left) * scaleX), marginTop + toMm(found.y) + 4, {
      renderingMode: 'invisible',
      maxWidth: Math.max(10, toMm(rect.width * scaleX)),
    })
  }

  const linkNodes = [...el.querySelectorAll('a[href]')]
  for (let index = 0; index < linkNodes.length; index += 1) {
    if (index % 20 === 0) await yieldToExportMainThread(signal)
    const node = linkNodes[index]!
    if (!(node instanceof HTMLAnchorElement)) continue
    const href = node.href
    if (!/^https?:|^mailto:|^tel:/i.test(href)) continue
    const rect = node.getBoundingClientRect()
    const yPx = (rect.top - root.top) * scaleY
    const found = pageOf(yPx)
    if (!found) continue
    pdf.setPage(found.page + 1)
    pdf.link(
      marginLeft + toMm((rect.left - root.left) * scaleX),
      marginTop + toMm(found.y),
      Math.max(4, toMm(rect.width * scaleX)),
      Math.max(3, toMm(rect.height * scaleY)),
      { url: href },
    )
  }
}

/** html2canvas 按需加载，进程内只加载一次。 */
let html2canvasLoader: Promise<typeof html2canvasType> | null = null
function loadHtml2Canvas(): Promise<typeof html2canvasType> {
  html2canvasLoader ??= import('html2canvas').then((mod) => mod.default)
  return html2canvasLoader
}
