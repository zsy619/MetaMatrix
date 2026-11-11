import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { footerForPage, formatPageNumber, headerForPage, pageChromeIsEmpty, type PanelPageChrome } from './rtePageChrome'
import { pdfPageFormat, type RtePageSizeId } from './rtePageSize'

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
async function rasterLine(text: string, widthPx: number): Promise<HTMLCanvasElement | null> {
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
    return await html2canvas(host, { backgroundColor: '#ffffff', scale: 2, logging: false })
  } catch {
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
async function useCjkFont(pdf: jsPDF): Promise<void> {
  try {
    if (!cachedCjkFont) {
      const url = `${import.meta.env.BASE_URL}fonts/DroidSansFallback.ttf`
      const response = await fetch(url)
      if (!response.ok) return
      cachedCjkFont = bytesToBase64(new Uint8Array(await response.arrayBuffer()))
    }
    pdf.addFileToVFS('DroidSansFallback.ttf', cachedCjkFont)
    pdf.addFont('DroidSansFallback.ttf', 'DroidSansFallback', 'normal', 'Identity-H')
    pdf.setFont('DroidSansFallback', 'normal')
  } catch {
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
  },
): Promise<Blob> {
  const scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.5))
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  })
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: pdfPageFormat(opts?.pageSize || 'a4'),
  })
  if (opts?.title) {
    try {
      pdf.setProperties({ title: opts.title })
    } catch {
      /* ignore */
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
  // canvas px corresponding to one PDF page height
  const pagePx = Math.max(1, Math.floor((usableH * canvas.width) / imgWmm))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const marks = canvasPageMarks(el, canvas.height)
  const slices: number[] = []
  let y = 0
  while (y < canvas.height - 2 && slices.length < 200) {
    let sliceH = Math.min(pagePx, canvas.height - y)
    const forced = marks.breaks.find((at) => at > y + 40 && at < y + sliceH)
    if (forced) sliceH = forced - y
    else if (ctx && sliceH >= pagePx && y + sliceH < canvas.height) {
      const soft = findSoftBreakY(ctx, canvas.width, y, y + sliceH, y + sliceH)
      sliceH = Math.max(40, soft - y)
    }
    slices.push(sliceH)
    y += sliceH
  }

  const chrome = opts?.chrome && !pageChromeIsEmpty(opts.chrome) ? opts.chrome : null
  const total = Math.max(1, slices.length)
  await useCjkFont(pdf)
  const cjkReady = Boolean(cachedCjkFont)
  const headerImgs: Array<HTMLCanvasElement | null> = []
  const footerImgs: Array<HTMLCanvasElement | null> = []
  if (chrome && !cjkReady) {
    for (let i = 0; i < total; i += 1) {
      const header = headerForPage(chrome, i + 1)
      headerImgs.push(header ? await rasterLine(header, canvas.width / scale) : null)
      const footer = footerForPage(chrome, i + 1)
      if (footer || chrome.pageNumber !== 'none') {
        const line = [footer, formatPageNumber(chrome.pageNumber, i + 1, total)].filter(Boolean).join('    ')
        footerImgs.push(line ? await rasterLine(line, canvas.width / scale) : null)
      } else {
        footerImgs.push(null)
      }
    }
  }

  if (!slices.length) {
    pdf.text(opts?.title || '', marginLeft, marginTop + 6)
    if (cjkReady && chrome) paintChromeText(pdf, headerForPage(chrome, 1), marginLeft, 6)
    else drawStrip(pdf, headerImgs[0] || null, marginLeft, 2, usableW)
    return pdf.output('blob')
  }

  let offset = 0
  slices.forEach((sliceH, pageIndex) => {
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceH
    const pctx = pageCanvas.getContext('2d')
    if (!pctx) return
    pctx.fillStyle = '#ffffff'
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
    stampContinuedTableHead(pctx, canvas, marks.headers, offset)
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.93)
    const sliceHmm = (sliceH * imgWmm) / canvas.width
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWmm, sliceHmm)
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
  })

  addSelectableLayer(pdf, el, canvas, slices, marginLeft, marginTop, imgWmm)
  return pdf.output('blob')
}

/** 在截图之上铺一层可选中的正文，并把外链做成可点击区域。 */
function addSelectableLayer(
  pdf: jsPDF,
  el: HTMLElement,
  canvas: HTMLCanvasElement,
  slices: number[],
  marginLeft: number,
  marginTop: number,
  imgWmm: number,
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
  el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const text = (node.innerText || '').replace(/\s+/g, ' ').trim()
    if (!text) return
    const rect = node.getBoundingClientRect()
    const yPx = (rect.top - root.top) * scaleY
    const found = pageOf(yPx)
    if (!found) return
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
  })
  el.querySelectorAll('a[href]').forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) return
    const href = node.href
    if (!/^https?:|^mailto:|^tel:/i.test(href)) return
    const rect = node.getBoundingClientRect()
    const yPx = (rect.top - root.top) * scaleY
    const found = pageOf(yPx)
    if (!found) return
    pdf.setPage(found.page + 1)
    pdf.link(
      marginLeft + toMm((rect.left - root.left) * scaleX),
      marginTop + toMm(found.y),
      Math.max(4, toMm(rect.width * scaleX)),
      Math.max(3, toMm(rect.height * scaleY)),
      { url: href },
    )
  })
}
