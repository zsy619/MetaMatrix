/**
 * 导出物图片的像素统计（纯 Node）。
 *
 * 判定规则（写死在这里，脚本与报告共用同一套数字）：
 * - 非空白：非背景像素比例 nonBackgroundRatio ∈ (0.01, 0.95)
 * - 背景非透明：透明像素比例（alpha < 250）≤ 0.02
 * - 背景非黑：边缘/角点背景色均值各通道 ≥ 200（≈白），
 *            且近黑像素比例（alpha ≥ 128 且 max(r,g,b) < 40）≤ 0.40
 * - 尺寸合理：宽 ≥ 200px 且高 ≥ 200px
 */
import { decodePng } from './pngDecode.mjs'

/** 判定阈值（报告里也会原样引用）。 */
export const THRESHOLDS = {
  minWidth: 200,
  minHeight: 200,
  minNonBackgroundRatio: 0.01,
  maxNonBackgroundRatio: 0.95,
  maxTransparentRatio: 0.02,
  minBackgroundChannel: 200,
  maxNearBlackRatio: 0.4,
  /** 背景色与「非背景像素」的通道差阈值。 */
  backgroundTolerance: 16,
}

function mean(values) {
  if (!values.length) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * 统计一张 RGBA 图的像素特征。
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @param {{rect?: {x:number,y:number,width:number,height:number}}} opts
 */
export function analyzeImage(image, opts = {}) {
  const rect = opts.rect || { x: 0, y: 0, width: image.width, height: image.height }
  const { data } = image
  const px = (x, y) => {
    const i = (y * image.width + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }

  let transparent = 0
  let transparentStrict = 0
  let nearBlack = 0
  let colored = 0
  const edgeR = []
  const edgeG = []
  const edgeB = []
  const edgeA = []
  let count = 0

  const frame = Math.max(1, Math.min(3, Math.floor(Math.min(rect.width, rect.height) / 20)))

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const [r, g, b, a] = px(x, y)
      const isEdge =
        x - rect.x < frame ||
        y - rect.y < frame ||
        rect.x + rect.width - 1 - x < frame ||
        rect.y + rect.height - 1 - y < frame
      count += 1
      if (a < 250) transparent += 1
      if (a < 128) transparentStrict += 1
      if (a >= 128 && Math.max(r, g, b) < 40) nearBlack += 1
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      if (a >= 128 && chroma > 30) colored += 1
      if (isEdge) {
        edgeR.push(r)
        edgeG.push(g)
        edgeB.push(b)
        edgeA.push(a)
      }
    }
  }

  // 四角 8×8 块均值，作为「背景色」的参考值。
  const corner = { r: [], g: [], b: [], a: [] }
  const cornerSize = Math.max(1, Math.min(8, Math.floor(Math.min(rect.width, rect.height) / 4)))
  for (const [cx, cy] of [
    [rect.x, rect.y],
    [rect.x + rect.width - cornerSize, rect.y],
    [rect.x, rect.y + rect.height - cornerSize],
    [rect.x + rect.width - cornerSize, rect.y + rect.height - cornerSize],
  ]) {
    for (let y = cy; y < cy + cornerSize; y += 1) {
      for (let x = cx; x < cx + cornerSize; x += 1) {
        const [r, g, b, a] = px(x, y)
        corner.r.push(r)
        corner.g.push(g)
        corner.b.push(b)
        corner.a.push(a)
      }
    }
  }

  const bg = {
    r: Math.round(mean(corner.r)),
    g: Math.round(mean(corner.g)),
    b: Math.round(mean(corner.b)),
  }

  // 非背景像素：与角点背景色的通道差超过阈值即算「有内容」。
  let nonBackground = 0
  const tol = THRESHOLDS.backgroundTolerance
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const [r, g, b] = px(x, y)
      if (
        Math.abs(r - bg.r) > tol ||
        Math.abs(g - bg.g) > tol ||
        Math.abs(b - bg.b) > tol
      ) {
        nonBackground += 1
      }
    }
  }

  const edgeMean = {
    r: Math.round(mean(edgeR)),
    g: Math.round(mean(edgeG)),
    b: Math.round(mean(edgeB)),
    a: Math.round(mean(edgeA)),
  }

  return {
    width: image.width,
    height: image.height,
    region: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    pixelCount: count,
    transparentRatio: round(count ? transparent / count : 0),
    transparentRatioStrict: round(count ? transparentStrict / count : 0),
    nearBlackRatio: round(count ? nearBlack / count : 0),
    coloredPixelRatio: round(count ? colored / count : 0),
    nonBackgroundRatio: round(count ? nonBackground / count : 0),
    backgroundCornerMean: bg,
    backgroundEdgeMean: edgeMean,
  }
}

function round(value) {
  return Math.round(value * 10000) / 10000
}

/**
 * 找页面级图片里的「彩色区域」（图表本体）：ECharts 图表有明显彩色像素，
 * 而正文文字是灰黑色。按彩色像素的包围盒裁出图表区域。
 */
export function findColoredRegion(image) {
  const { data, width, height } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let colored = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 128) continue
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 30) continue
      colored += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (!colored || maxX < 0) return null
  // 彩色像素的包围盒会紧贴图表内容，边界上全是柱/线本身。
  // 外扩一圈留出白底，裁出来的区域才能反映「图表快照是白底真图」。
  const raw = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  if (raw.width < 100 || raw.height < 60) return null
  const marginX = Math.max(8, Math.round(raw.width * 0.08))
  const marginY = Math.max(8, Math.round(raw.height * 0.08))
  const x = Math.max(0, raw.x - marginX)
  const y = Math.max(0, raw.y - marginY)
  return {
    x,
    y,
    width: Math.min(width - x, raw.width + marginX * 2),
    height: Math.min(height - y, raw.height + marginY * 2),
  }
}

/** 按判定规则给出通过 / 失败结论。 */
export function judge(stats) {
  const reasons = []
  if (stats.width < THRESHOLDS.minWidth || stats.height < THRESHOLDS.minHeight) {
    reasons.push(
      `尺寸不足（${stats.width}×${stats.height} < ${THRESHOLDS.minWidth}×${THRESHOLDS.minHeight}）`,
    )
  }
  if (stats.transparentRatio > THRESHOLDS.maxTransparentRatio) {
    reasons.push(`透明像素过多（${stats.transparentRatio} > ${THRESHOLDS.maxTransparentRatio}）`)
  }
  const bg = stats.backgroundEdgeMean
  if (bg.r < THRESHOLDS.minBackgroundChannel || bg.g < THRESHOLDS.minBackgroundChannel || bg.b < THRESHOLDS.minBackgroundChannel) {
    reasons.push(`背景不是白底（边缘均值 rgb(${bg.r},${bg.g},${bg.b})）`)
  }
  if (stats.nonBackgroundRatio <= THRESHOLDS.minNonBackgroundRatio) {
    reasons.push(`图像接近空白（非背景像素 ${stats.nonBackgroundRatio}）`)
  }
  if (stats.nonBackgroundRatio >= THRESHOLDS.maxNonBackgroundRatio) {
    reasons.push(`图像几乎全是内容（非背景像素 ${stats.nonBackgroundRatio}）`)
  }
  if (stats.nearBlackRatio > THRESHOLDS.maxNearBlackRatio) {
    reasons.push(`近黑像素过多（${stats.nearBlackRatio}）`)
  }
  return { pass: reasons.length === 0, reasons }
}

/** 解 PNG 并统计（一步到位）。 */
export function analyzePngBuffer(buffer) {
  const image = decodePng(buffer)
  const stats = analyzeImage(image)
  return { ...stats, ...judge(stats) }
}
