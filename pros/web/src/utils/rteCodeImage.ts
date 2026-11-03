/**
 * 导出「代码美化图片」：把着色后的代码渲染成圆角卡片 PNG 并下载。
 *
 * 复用仓库已有的 html2canvas；逐行渲染（行号 + 代码）保证长代码完整导出不截断，
 * 超长行在卡片内换行也不会撑爆画布；缩放比例按画布尺寸上限做保护。
 */

export type CodeImageOptions = {
  /** 逐行着色后的代码 HTML（由 CodeMirror 语法树生成）。 */
  lines: string[]
  /** 标题栏文字。 */
  title?: string
  /** 下载文件名。 */
  fileName?: string
  /** 卡片宽度（px）。 */
  width?: number
}

/** 画布安全上限（Chrome 单边约 32767，这里留足余量）。 */
const MAX_CANVAS_EDGE = 16000

const CODE_FONT_SIZE = 12.5
const CODE_LINE_HEIGHT = 1.6

function buildCard(opts: CodeImageOptions): HTMLDivElement {
  const width = opts.width ?? 880

  const card = document.createElement('div')
  card.className = 'rte-code-card'
  card.setAttribute('aria-hidden', 'true')
  card.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'z-index:-9999',
    'pointer-events:none',
    `width:${width}px`,
    'box-sizing:border-box',
    'border-radius:14px',
    'overflow:hidden',
    'background:#1e1e1e',
    'border:1px solid #3c3c3c',
    'box-shadow:0 18px 48px rgba(0,0,0,.38)',
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace",
  ].join(';')

  const head = document.createElement('div')
  head.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'height:40px',
    'padding:0 14px',
    'background:#252526',
    'border-bottom:1px solid #3c3c3c',
  ].join(';')
  for (const color of ['#ff5f56', '#ffbd2e', '#27c93f']) {
    const dot = document.createElement('span')
    dot.style.cssText = `width:11px;height:11px;border-radius:50%;background:${color};display:inline-block`
    head.appendChild(dot)
  }
  const title = document.createElement('span')
  title.textContent = opts.title || 'index.html'
  title.style.cssText = 'margin-left:6px;font-size:12px;color:#c8c8c8;letter-spacing:.3px'
  head.appendChild(title)
  card.appendChild(head)

  const body = document.createElement('div')
  body.style.cssText = 'padding:16px 18px;display:flex;flex-direction:column'

  const lines = opts.lines.length ? opts.lines : ['']
  lines.forEach((line, index) => {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:flex-start'

    const num = document.createElement('span')
    num.textContent = String(index + 1)
    num.style.cssText = [
      'flex:0 0 46px',
      'text-align:right',
      'padding-right:14px',
      'color:#6a737d',
      'user-select:none',
      `font-size:${CODE_FONT_SIZE}px`,
      `line-height:${CODE_LINE_HEIGHT}`,
    ].join(';')

    const code = document.createElement('span')
    code.innerHTML = line
    code.style.cssText = [
      'flex:1',
      'min-width:0',
      'color:#d4d4d4',
      'white-space:pre-wrap',
      'overflow-wrap:anywhere',
      'tab-size:2',
      `font-size:${CODE_FONT_SIZE}px`,
      `line-height:${CODE_LINE_HEIGHT}`,
    ].join(';')

    row.appendChild(num)
    row.appendChild(code)
    body.appendChild(row)
  })

  card.appendChild(body)
  return card
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 生成并下载代码美化图片。 */
export async function exportCodeImage(opts: CodeImageOptions): Promise<string> {
  const { default: html2canvas } = await import('html2canvas')
  const card = buildCard(opts)
  document.body.appendChild(card)
  try {
    const width = card.scrollWidth
    const height = card.scrollHeight
    const scale = Math.max(0.5, Math.min(2, MAX_CANVAS_EDGE / Math.max(width, height)))
    const canvas = await html2canvas(card, {
      backgroundColor: '#1e1e1e',
      scale,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      logging: false,
      useCORS: true,
    })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('画布导出失败')
    const fileName = opts.fileName || `code-${Date.now()}.png`
    triggerDownload(blob, fileName)
    return fileName
  } finally {
    card.remove()
  }
}

export default exportCodeImage
