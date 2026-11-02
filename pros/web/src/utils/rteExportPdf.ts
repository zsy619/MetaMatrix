import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { formatPageNumber, pageChromeIsEmpty, type PanelPageChrome } from './rtePageChrome'
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
  const slices: number[] = []
  let y = 0
  while (y < canvas.height - 2 && slices.length < 200) {
    let sliceH = Math.min(pagePx, canvas.height - y)
    if (ctx && sliceH >= pagePx && y + sliceH < canvas.height) {
      const soft = findSoftBreakY(ctx, canvas.width, y, y + sliceH, y + sliceH)
      sliceH = Math.max(40, soft - y)
    }
    slices.push(sliceH)
    y += sliceH
  }

  const chrome = opts?.chrome && !pageChromeIsEmpty(opts.chrome) ? opts.chrome : null
  const total = Math.max(1, slices.length)
  const headerImg = chrome?.header ? await rasterLine(chrome.header, canvas.width / scale) : null
  const footerImgs: Array<HTMLCanvasElement | null> = []
  if (chrome && (chrome.footer || chrome.pageNumber !== 'none')) {
    for (let i = 0; i < total; i += 1) {
      const line = [chrome.footer, formatPageNumber(chrome.pageNumber, i + 1, total)].filter(Boolean).join('    ')
      footerImgs.push(await rasterLine(line, canvas.width / scale))
    }
  }

  if (!slices.length) {
    pdf.text(opts?.title || '', marginLeft, marginTop + 6)
    drawStrip(pdf, headerImg, marginLeft, 2, usableW)
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
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.93)
    const sliceHmm = (sliceH * imgWmm) / canvas.width
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWmm, sliceHmm)
    drawStrip(pdf, headerImg, marginLeft, Math.max(1, (marginTop - 6) / 2), usableW)
    const footer = footerImgs[pageIndex]
    if (footer) {
      const footerHmm = (footer.height / footer.width) * usableW
      drawStrip(pdf, footer, marginLeft, pageHeight - marginBottom + Math.max(1, (marginBottom - footerHmm) / 2), usableW)
    }
    offset += sliceH
  })

  return pdf.output('blob')
}
