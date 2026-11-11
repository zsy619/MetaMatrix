import QRCode from 'qrcode'

export type QrModuleStyle =
  | 'rounded'
  | 'dot'
  | 'square'
  | 'diamond'
  | 'liquid'
  | 'bar'
  | 'column'
  | 'triangle'
  | 'cross'
  | 'star'

export const QR_STYLES: readonly { id: QrModuleStyle; label: string }[] = [
  { id: 'rounded', label: '圆角' },
  { id: 'dot', label: '圆点' },
  { id: 'square', label: '方块' },
  { id: 'diamond', label: '菱形' },
  { id: 'liquid', label: '液态' },
  { id: 'bar', label: '横条' },
  { id: 'column', label: '竖条' },
  { id: 'triangle', label: '三角' },
  { id: 'cross', label: '十字' },
  { id: 'star', label: '星形' },
]

export type QrPreset = {
  id: string
  label: string
  color: string
  background: string
}

/** 配色按常见扫码场景分开，深色画在浅底上，保证还能扫。第一行是原有配色，第二行是新增配色。 */
export const QR_PRESET_ROWS: readonly (readonly QrPreset[])[] = [
  [
    { id: 'classic', label: '经典黑', color: '#1d2129', background: '#ffffff' },
    { id: 'clover', label: '草料蓝', color: '#1664ff', background: '#ffffff' },
    { id: 'wechat', label: '微信绿', color: '#059447', background: '#ffffff' },
    { id: 'alipay', label: '支付宝蓝', color: '#1677ff', background: '#f4f8ff' },
    { id: 'red', label: '中国红', color: '#e11d48', background: '#fff7f8' },
    { id: 'violet', label: '暮紫', color: '#6d28d9', background: '#f6f3ff' },
    { id: 'orange', label: '暖橙', color: '#c2410c', background: '#fff7ed' },
    { id: 'teal', label: '墨绿', color: '#0f766e', background: '#f0fdfa' },
  ],
  [
    { id: 'indigo', label: '靛蓝', color: '#1e40af', background: '#eff6ff' },
    { id: 'rose', label: '玫红', color: '#be185d', background: '#fdf2f8' },
    { id: 'coffee', label: '咖啡', color: '#92400e', background: '#fffbeb' },
    { id: 'cyan', label: '深青', color: '#0e7490', background: '#ecfeff' },
    { id: 'pine', label: '松绿', color: '#166534', background: '#f0fdf4' },
    { id: 'wine', label: '酒红', color: '#9f1239', background: '#fff1f2' },
    { id: 'slate', label: '炭灰', color: '#334155', background: '#f8fafc' },
    { id: 'magenta', label: '品红', color: '#a21caf', background: '#fdf4ff' },
  ],
]

export const QR_PRESETS: readonly QrPreset[] = QR_PRESET_ROWS.flat()

export type QrArtworkOptions = {
  color?: string
  background?: string
  style?: QrModuleStyle
  caption?: boolean
  /** 底部说明。勾选底部文字时，有描述就画描述，否则画二维码内容。 */
  description?: string
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  /** 四周留白，按码点个数。只接受 2、4、6。 */
  quiet?: number
}

type QrBits = {
  size: number
  dark: (row: number, col: number) => boolean
  reserved: (row: number, col: number) => boolean
}

export function qrBits(text: string, level: 'L' | 'M' | 'Q' | 'H' = 'H'): QrBits {
  const created = QRCode.create(text, { errorCorrectionLevel: level }) as {
    modules: {
      size: number
      get: (row: number, col: number) => number
      isReserved: (row: number, col: number) => number
    }
  }
  const modules = created.modules
  return {
    size: modules.size,
    dark: (row, col) => modules.get(row, col) === 1,
    reserved: (row, col) => modules.isReserved(row, col) === 1,
  }
}

function finderOrigin(size: number, row: number, col: number): { row: number; col: number } | null {
  if (row < 7 && col < 7) return { row: 0, col: 0 }
  if (row < 7 && col >= size - 7) return { row: 0, col: size - 7 }
  if (row >= size - 7 && col < 7) return { row: size - 7, col: 0 }
  return null
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function drawFinder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  moduleSize: number,
  color: string,
  background: string,
  style: QrModuleStyle,
) {
  const outer = moduleSize * 7
  const radius = style === 'square' ? moduleSize * 0.4 : moduleSize * 1.6
  ctx.fillStyle = color
  roundRect(ctx, x, y, outer, outer, radius)
  ctx.fill()
  ctx.fillStyle = background
  roundRect(ctx, x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5, radius * 0.72)
  ctx.fill()
  ctx.fillStyle = color
  roundRect(
    ctx,
    x + moduleSize * 2,
    y + moduleSize * 2,
    moduleSize * 3,
    moduleSize * 3,
    style === 'square' ? moduleSize * 0.3 : moduleSize * 0.9,
  )
  ctx.fill()
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  moduleSize: number,
  style: QrModuleStyle,
) {
  if (style === 'dot') {
    ctx.beginPath()
    ctx.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize * 0.42, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (style === 'diamond') {
    ctx.beginPath()
    ctx.moveTo(x + moduleSize / 2, y + moduleSize * 0.06)
    ctx.lineTo(x + moduleSize * 0.94, y + moduleSize / 2)
    ctx.lineTo(x + moduleSize / 2, y + moduleSize * 0.94)
    ctx.lineTo(x + moduleSize * 0.06, y + moduleSize / 2)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (style === 'bar') {
    const insetY = moduleSize * 0.22
    roundRect(ctx, x + moduleSize * 0.04, y + insetY, moduleSize * 0.92, moduleSize - insetY * 2, moduleSize * 0.28)
    ctx.fill()
    return
  }
  if (style === 'column') {
    const insetX = moduleSize * 0.26
    roundRect(ctx, x + insetX, y + moduleSize * 0.04, moduleSize - insetX * 2, moduleSize * 0.92, moduleSize * 0.22)
    ctx.fill()
    return
  }
  if (style === 'triangle') {
    ctx.beginPath()
    ctx.moveTo(x + moduleSize / 2, y + moduleSize * 0.04)
    ctx.lineTo(x + moduleSize * 0.96, y + moduleSize * 0.96)
    ctx.lineTo(x + moduleSize * 0.04, y + moduleSize * 0.96)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (style === 'cross') {
    const arm = moduleSize * 0.42
    const pad = (moduleSize - arm) / 2
    roundRect(ctx, x + moduleSize * 0.06, y + pad, moduleSize * 0.88, arm, arm * 0.35)
    ctx.fill()
    roundRect(ctx, x + pad, y + moduleSize * 0.06, arm, moduleSize * 0.88, arm * 0.35)
    ctx.fill()
    return
  }
  if (style === 'star') {
    const cx = x + moduleSize / 2
    const cy = y + moduleSize / 2
    const outer = moduleSize * 0.48
    const inner = moduleSize * 0.22
    ctx.beginPath()
    for (let i = 0; i < 8; i += 1) {
      const radius = i % 2 === 0 ? outer : inner
      const angle = -Math.PI / 2 + (i * Math.PI) / 4
      const px = cx + Math.cos(angle) * radius
      const py = cy + Math.sin(angle) * radius
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    return
  }
  const inset = moduleSize * 0.08
  const radius = style === 'square' ? moduleSize * 0.12 : moduleSize * 0.34
  roundRect(ctx, x + inset, y + inset, moduleSize - inset * 2, moduleSize - inset * 2, radius)
  ctx.fill()
}

function isDataDark(bits: QrBits, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= bits.size || col >= bits.size) return false
  if (finderOrigin(bits.size, row, col)) return false
  if (bits.reserved(row, col)) return false
  return bits.dark(row, col)
}

function drawLiquid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  moduleSize: number,
  row: number,
  col: number,
  bits: QrBits,
) {
  const pad = moduleSize * 0.16
  roundRect(ctx, x + pad, y + pad, moduleSize - pad * 2, moduleSize - pad * 2, moduleSize * 0.34)
  ctx.fill()
  if (isDataDark(bits, row, col + 1)) {
    ctx.fillRect(x + moduleSize / 2, y + moduleSize * 0.22, moduleSize / 2, moduleSize * 0.56)
  }
  if (isDataDark(bits, row + 1, col)) {
    ctx.fillRect(x + moduleSize * 0.22, y + moduleSize / 2, moduleSize * 0.56, moduleSize / 2)
  }
}

function moduleStyleFor(style: QrModuleStyle, reserved: boolean): QrModuleStyle {
  if (!reserved || style === 'rounded' || style === 'square') return style
  return 'square'
}

function markText(text: string): string {
  try {
    const host = new URL(text).hostname.replace(/^www\./, '')
    return (host[0] || '码').toUpperCase()
  } catch {
    const char = text.trim()[0]
    return char || '码'
  }
}

export function qrQuietModules(value: unknown): 2 | 4 | 6 {
  return value === 2 || value === 6 ? value : 4
}

export function qrPixelSize(
  text: string,
  options: QrArtworkOptions = {},
): { width: number; height: number; quiet: 2 | 4 | 6; moduleSize: number } {
  const bits = qrBits(text, options.errorCorrectionLevel || 'H')
  const quiet = qrQuietModules(options.quiet)
  const moduleSize = 12
  const qrSide = (bits.size + quiet * 2) * moduleSize
  const note = (options.description || '').trim()
  const captionText = options.caption ? note || text.trim() : ''
  return { width: qrSide, height: qrSide + (captionText ? 56 : 0), quiet, moduleSize }
}

export function paintQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: QrArtworkOptions = {},
) {
  const color = options.color || QR_PRESETS[1]!.color
  const background = options.background || '#ffffff'
  const style = options.style || 'rounded'
  const bits = qrBits(text, options.errorCorrectionLevel || 'H')
  const sized = qrPixelSize(text, options)
  const quiet = sized.quiet
  const moduleSize = sized.moduleSize
  const width = sized.width
  const height = sized.height
  ctx.canvas.width = width
  ctx.canvas.height = height
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  const drawnFinders = new Set<string>()
  ctx.fillStyle = color
  for (let row = 0; row < bits.size; row += 1) {
    for (let col = 0; col < bits.size; col += 1) {
      const origin = finderOrigin(bits.size, row, col)
      if (origin) {
        const key = `${origin.row}:${origin.col}`
        if (!drawnFinders.has(key)) {
          drawnFinders.add(key)
          drawFinder(
            ctx,
            (origin.col + quiet) * moduleSize,
            (origin.row + quiet) * moduleSize,
            moduleSize,
            color,
            background,
            style,
          )
        }
        continue
      }
      if (!bits.dark(row, col)) continue
      const x = (col + quiet) * moduleSize
      const y = (row + quiet) * moduleSize
      if (style === 'liquid' && !bits.reserved(row, col)) {
        drawLiquid(ctx, x, y, moduleSize, row, col, bits)
        continue
      }
      drawModule(ctx, x, y, moduleSize, moduleStyleFor(style, bits.reserved(row, col)))
    }
  }
  const plate = Math.floor(bits.size * 0.18) * moduleSize
  const plateX = (width - plate) / 2
  const plateY = (qrSide - plate) / 2
  ctx.fillStyle = background
  roundRect(ctx, plateX, plateY, plate, plate, plate * 0.22)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  roundRect(ctx, plateX + 3, plateY + 3, plate - 6, plate - 6, plate * 0.18)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `700 ${Math.floor(plate * 0.42)}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(markText(text), width / 2, qrSide / 2)
  if (captionText) {
    ctx.fillStyle = '#4e5969'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = captionText.length > 32 ? `${captionText.slice(0, 32)}…` : captionText
    let fontSize = 22
    ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
    while (fontSize > 14 && ctx.measureText(label).width > width - 48) {
      fontSize -= 1
      ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
    }
    ctx.fillText(label, width / 2, qrSide + captionHeight / 2)
  }
}

export async function makeQrArtwork(text: string, options: QrArtworkOptions = {}): Promise<string> {
  const value = text.trim()
  if (!value) throw new Error('二维码内容是空的')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前环境不能绘制二维码')
  paintQr(ctx, value, options)
  return canvas.toDataURL('image/png')
}
