import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * 将编辑器 DOM 栅格化后写入多页 A4 PDF。
 */
export async function buildPdfFromElement(
  el: HTMLElement,
  opts?: { title?: string },
): Promise<Blob> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
  })
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
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
  const imgW = usableW
  const imgH = (canvas.height * imgW) / canvas.width

  let heightLeft = imgH
  let position = margin
  pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH)
  heightLeft -= usableH

  while (heightLeft > 2) {
    position = margin - (imgH - heightLeft)
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH)
    heightLeft -= usableH
  }

  return pdf.output('blob')
}
