import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
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
export async function buildPdfFromElement(
  el: HTMLElement,
  opts?: { title?: string; pageSize?: RtePageSizeId },
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
  const margin = 10
  const usableW = pageWidth - margin * 2
  const usableH = pageHeight - margin * 2

  const imgWmm = usableW
  // canvas px corresponding to one PDF page height
  const pagePx = Math.max(1, Math.floor((usableH * canvas.width) / imgWmm))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let y = 0
  let pageIndex = 0
  while (y < canvas.height - 2) {
    let sliceH = Math.min(pagePx, canvas.height - y)
    if (ctx && sliceH >= pagePx && y + sliceH < canvas.height) {
      const soft = findSoftBreakY(ctx, canvas.width, y, y + sliceH, y + sliceH)
      sliceH = Math.max(40, soft - y)
    }
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceH
    const pctx = pageCanvas.getContext('2d')
    if (!pctx) break
    pctx.fillStyle = '#ffffff'
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pctx.drawImage(
      canvas,
      0,
      y,
      canvas.width,
      sliceH,
      0,
      0,
      canvas.width,
      sliceH,
    )
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.93)
    const sliceHmm = (sliceH * imgWmm) / canvas.width
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', margin, margin, imgWmm, sliceHmm)
    y += sliceH
    pageIndex += 1
    // safety
    if (pageIndex > 200) break
  }

  if (pageIndex === 0) {
    // empty doc
    pdf.text(opts?.title || '', margin, margin + 6)
  }

  return pdf.output('blob')
}
