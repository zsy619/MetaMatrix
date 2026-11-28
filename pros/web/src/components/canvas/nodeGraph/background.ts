/**
 * 画布背景模板：同一份设置既渲染到画布上，也渲染到导出的图片里。
 *
 * 画布用 CSS 渐变（跟着缩放平移），导出用 SVG pattern（一次性画进图片）。
 */
import type { NodeGraphBackground, NodeGraphBackgroundPattern } from '../../../types/nodeGraph'

export const BACKGROUND_PATTERNS: { id: NodeGraphBackgroundPattern; label: string }[] = [
  { id: 'dots', label: '点阵' },
  { id: 'grid', label: '网格' },
  { id: 'cross', label: '十字' },
  { id: 'lines', label: '横线' },
  { id: 'diagonal', label: '斜线' },
  { id: 'checker', label: '棋盘' },
  { id: 'blueprint', label: '蓝图' },
  { id: 'solid', label: '纯色' },
  { id: 'dotgrid', label: '点网' },
  { id: 'dash', label: '短划' },
  { id: 'brick', label: '砖墙' },
  { id: 'hex', label: '蜂窝' },
  { id: 'tri', label: '三角' },
  { id: 'wave', label: '波浪' },
  { id: 'diamond', label: '菱形' },
  { id: 'circuit', label: '电路' },
  { id: 'star', label: '星点' },
  { id: 'rings', label: '圆环' },
  // 空白单独占满一行，排在 18 个图案之后。
  { id: 'none', label: '空白' },
]

/** 图案色与底色的预设（同 excalidraw 的画布风格）。 */
export const BACKGROUND_COLORS = [
  { color: '#dbe3ec', label: '浅灰' },
  { color: '#c7d2fe', label: '靛蓝' },
  { color: '#bbf7d0', label: '薄荷' },
  { color: '#fed7aa', label: '暖橙' },
  { color: '#fecaca', label: '浅红' },
  { color: '#cbd5e1', label: '石墨' },
  { color: '#a5f3fc', label: '天青' },
  { color: '#ddd6fe', label: '紫罗兰' },
  { color: '#fde68a', label: '暖沙' },
  { color: '#94a3b8', label: '深灰' },
]

export const BACKGROUND_BACKGROUNDS = [
  { background: '#ffffff', label: '白' },
  { background: '#f8fafc', label: '纸白' },
  { background: '#f1f5f9', label: '浅灰' },
  { background: '#eef2ff', label: '淡蓝' },
  { background: '#fdf6e3', label: '米黄' },
  { background: '#202124', label: '墨黑' },
  { background: '#f0fdf4', label: '雾绿' },
  { background: '#fdf2f8', label: '藕粉' },
  { background: '#e2e8f0', label: '石墨' },
  { background: '#0f172a', label: '深蓝' },
]

/** 一键套用的背景模板。 */
export const BACKGROUND_PRESETS: { label: string; value: NodeGraphBackground }[] = [
  { label: '默认点阵', value: { pattern: 'dots', color: '#dbe3ec', background: '#f8fafc', size: 24 } },
  { label: '工程蓝图', value: { pattern: 'blueprint', color: '#93c5fd', background: '#eff6ff', size: 24 } },
  { label: '方格纸', value: { pattern: 'grid', color: '#dbe3ec', background: '#ffffff', size: 24 } },
  { label: '笔记本', value: { pattern: 'lines', color: '#dbe3ec', background: '#fffdf7', size: 32 } },
  { label: '工作台', value: { pattern: 'cross', color: '#cbd5e1', background: '#f1f5f9', size: 32 } },
  { label: '夜间黑板', value: { pattern: 'dots', color: '#4b5563', background: '#202124', size: 28 } },
  { label: '深蓝蓝图', value: { pattern: 'blueprint', color: '#1e3a8a', background: '#0b1220', size: 24 } },
  { label: '暖沙纸', value: { pattern: 'wave', color: '#e7cfa8', background: '#fdf6e3', size: 28 } },
  { label: '雾绿方格', value: { pattern: 'grid', color: '#bbf7d0', background: '#f0fdf4', size: 24 } },
  { label: '紫夜蜂窝', value: { pattern: 'hex', color: '#4c1d95', background: '#1e1b4b', size: 28 } },
  { label: '墨色方格', value: { pattern: 'grid', color: '#3f3f46', background: '#18181b', size: 26 } },
  { label: '波点奶油', value: { pattern: 'dots', color: '#d6b98c', background: '#fff8ec', size: 30 } },
]

type PatternTile = { width: number; height: number; body: string }

/**
 * 新图案的 SVG 瓦片。
 *
 * 画布（data URI）与导出图（<pattern>）用同一份瓦片，
 * 避免两套渲染逻辑越改越不一致。
 */
export function patternTile(
  pattern: NodeGraphBackgroundPattern,
  size: number,
  color: string,
): PatternTile | null {
  const s = Math.max(8, size)
  const cx = s / 2
  const cy = s / 2
  switch (pattern) {
    case 'dotgrid':
      return {
        width: s,
        height: s,
        body:
          `<circle cx="${cx}" cy="${cy}" r="1.3" fill="${color}"/>` +
          `<path d="M0 0H${s}M0 0V${s}" stroke="${color}" stroke-width="1"/>`,
      }
    case 'dash':
      return {
        width: s,
        height: s,
        body: `<path d="M0 ${cy}H${s * 0.45}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`,
      }
    case 'brick':
      return {
        width: s * 2,
        height: s,
        body:
          `<path d="M0 0H${s * 2}M0 ${s}H${s * 2}` +
          `M0 ${cy}V${s}M${s} 0V${cy}M${s * 2} ${cy}V${s}" stroke="${color}" stroke-width="1"/>`,
      }
    case 'hex': {
      const r = s * 0.22
      const h = r * 0.866
      const points = [
        `${cx + r},${cy}`,
        `${cx + r / 2},${cy + h}`,
        `${cx - r / 2},${cy + h}`,
        `${cx - r},${cy}`,
        `${cx - r / 2},${cy - h}`,
        `${cx + r / 2},${cy - h}`,
      ].join(' ')
      return { width: s, height: s, body: `<polygon points="${points}" fill="${color}"/>` }
    }
    case 'tri':
      return {
        width: s,
        height: s,
        body: `<path d="M0 ${s}L${cx} 0L${s} ${s}" fill="none" stroke="${color}" stroke-width="1"/>`,
      }
    case 'wave':
      return {
        width: s,
        height: s,
        body: `<path d="M0 ${cy}Q${s / 4} 0 ${cx} ${cy}T${s} ${cy}" fill="none" stroke="${color}" stroke-width="1"/>`,
      }
    case 'diamond':
      return {
        width: s,
        height: s,
        body: `<path d="M${cx} 0L${s} ${cy}L${cx} ${s}L0 ${cy}Z" fill="none" stroke="${color}" stroke-width="1"/>`,
      }
    case 'circuit':
      return {
        width: s,
        height: s,
        body:
          `<path d="M0 ${cy}H${cx}V0M${cx} ${cy}V${s}M${cx} ${cy}H${s}" fill="none" stroke="${color}" stroke-width="1"/>` +
          `<circle cx="${cx}" cy="${cy}" r="1.8" fill="${color}"/>` +
          `<circle cx="0" cy="${cy}" r="1.8" fill="${color}"/>` +
          `<circle cx="${s}" cy="${cy}" r="1.8" fill="${color}"/>`,
      }
    case 'star': {
      const R = s * 0.32
      const r = s * 0.09
      const points = [
        `${cx},${cy - R}`,
        `${cx + r},${cy - r}`,
        `${cx + R},${cy}`,
        `${cx + r},${cy + r}`,
        `${cx},${cy + R}`,
        `${cx - r},${cy + r}`,
        `${cx - R},${cy}`,
        `${cx - r},${cy - r}`,
      ].join(' ')
      return { width: s, height: s, body: `<polygon points="${points}" fill="${color}"/>` }
    }
    case 'rings':
      // 四个角各画一个圆：被瓦片裁掉的部分由相邻瓦片补齐，拼成完整圆环。
      return {
        width: s,
        height: s,
        body:
          `<circle cx="0" cy="0" r="${s * 0.16}" fill="none" stroke="${color}" stroke-width="1"/>` +
          `<circle cx="${s}" cy="0" r="${s * 0.16}" fill="none" stroke="${color}" stroke-width="1"/>` +
          `<circle cx="0" cy="${s}" r="${s * 0.16}" fill="none" stroke="${color}" stroke-width="1"/>` +
          `<circle cx="${s}" cy="${s}" r="${s * 0.16}" fill="none" stroke="${color}" stroke-width="1"/>`,
      }
    default:
      return null
  }
}

/** 画布用的 data URI：同一块瓦片缩放到当前缩放级别。 */
function tileDataUri(tile: PatternTile): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.width}" height="${tile.height}" ` +
    `viewBox="0 0 ${tile.width} ${tile.height}">${tile.body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** 画布背景的 CSS（背景色 + 图案层）。 */
export function backgroundStyle(
  bg: NodeGraphBackground,
  viewport?: { x: number; y: number; zoom: number },
): Record<string, string> {
  const size = Math.max(8, bg.size) * (viewport?.zoom || 1)
  const offsetX = viewport?.x || 0
  const offsetY = viewport?.y || 0
  const style: Record<string, string> = {
    backgroundColor: bg.pattern === 'none' ? bg.background : bg.background,
    backgroundImage: 'none',
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  }
  if (bg.pattern === 'dots') {
    style.backgroundImage = `radial-gradient(circle, ${bg.color} 1px, transparent 1px)`
    style.backgroundSize = `${size}px ${size}px`
  } else if (bg.pattern === 'grid') {
    style.backgroundImage = `linear-gradient(${bg.color} 1px, transparent 1px), linear-gradient(90deg, ${bg.color} 1px, transparent 1px)`
    style.backgroundSize = `${size}px ${size}px`
  } else if (bg.pattern === 'cross') {
    style.backgroundImage = `linear-gradient(${bg.color} 1px, transparent 1px), linear-gradient(90deg, ${bg.color} 1px, transparent 1px)`
    style.backgroundSize = `${size}px ${size}px`
    // 十字：两层细线相交，格子中间再留白
    style.backgroundImage =
      `linear-gradient(${bg.color} 1px, transparent 1px), linear-gradient(90deg, ${bg.color} 1px, transparent 1px)`
  } else if (bg.pattern === 'lines') {
    style.backgroundImage = `linear-gradient(${bg.color} 1px, transparent 1px)`
    style.backgroundSize = `100% ${size}px`
  } else if (bg.pattern === 'diagonal') {
    style.backgroundImage = `repeating-linear-gradient(45deg, ${bg.color} 0 1px, transparent 1px ${size}px)`
  } else if (bg.pattern === 'checker') {
    style.backgroundImage = `conic-gradient(${bg.color} 90deg, transparent 90deg 180deg, ${bg.color} 180deg 270deg, transparent 270deg)`
    style.backgroundSize = `${size * 2}px ${size * 2}px`
  } else if (bg.pattern === 'blueprint') {
    const major = size * 5
    style.backgroundImage =
      `linear-gradient(${bg.color} 1.4px, transparent 1.4px), linear-gradient(90deg, ${bg.color} 1.4px, transparent 1.4px), ` +
      `linear-gradient(${bg.color} 1px, transparent 1px), linear-gradient(90deg, ${bg.color} 1px, transparent 1px)`
    style.backgroundSize = `${major}px ${major}px, ${major}px ${major}px, ${size}px ${size}px, ${size}px ${size}px`
  }
  const tile = patternTile(bg.pattern, bg.size, bg.color)
  if (tile) {
    style.backgroundImage = tileDataUri(tile)
    style.backgroundSize = `${tile.width * (viewport?.zoom || 1)}px ${tile.height * (viewport?.zoom || 1)}px`
  }
  return style
}

/** 导出图片用的背景：底色矩形 + 图案层。 */
export function backgroundSvg(bg: NodeGraphBackground, width: number, height: number): string {
  const size = Math.max(8, bg.size)
  const rect = `<rect width="${width}" height="${height}" fill="${bg.background}"/>`
  if (bg.pattern === 'none' || bg.pattern === 'solid') return rect
  const tile = patternTile(bg.pattern, size, bg.color)
  if (tile) {
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${tile.width}" height="${tile.height}" patternUnits="userSpaceOnUse">` +
      tile.body +
      `</pattern></defs><rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  if (bg.pattern === 'dots') {
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${size}" height="${size}" patternUnits="userSpaceOnUse">` +
      `<circle cx="1" cy="1" r="1" fill="${bg.color}"/></pattern></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  if (bg.pattern === 'lines') {
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${size}" height="${size}" patternUnits="userSpaceOnUse">` +
      `<path d="M 0 0 L ${size} 0" stroke="${bg.color}" stroke-width="1"/></pattern></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  if (bg.pattern === 'diagonal') {
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${size}" height="${size}" patternUnits="userSpaceOnUse">` +
      `<path d="M 0 ${size} L ${size} 0" stroke="${bg.color}" stroke-width="1"/></pattern></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  if (bg.pattern === 'checker') {
    const half = size / 2
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse">` +
      `<rect width="${half}" height="${half}" fill="${bg.color}"/>` +
      `<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="${bg.color}"/>` +
      `</pattern></defs><rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  if (bg.pattern === 'blueprint') {
    const major = size * 5
    const minor = Array.from({ length: 5 }, (_, index) => index * size)
      .map((offset) => `M ${offset} 0 L ${offset} ${major} M 0 ${offset} L ${major} ${offset}`)
      .join(' ')
    return (
      rect +
      `<defs><pattern id="ng-bg" width="${major}" height="${major}" patternUnits="userSpaceOnUse">` +
      `<path d="${minor}" stroke="${bg.color}" stroke-width="1"/>` +
      `<path d="M ${major} 0 L 0 0 0 ${major}" stroke="${bg.color}" stroke-width="1.4"/></pattern></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
    )
  }
  // grid / cross：网格线；十字在格子中心加一个小十字
  const grid =
    `<defs><pattern id="ng-bg" width="${size}" height="${size}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="${bg.color}" stroke-width="1"/>` +
    (bg.pattern === 'cross'
      ? `<path d="M ${size / 2} ${size / 2 - 3} L ${size / 2} ${size / 2 + 3} M ${size / 2 - 3} ${size / 2} L ${size / 2 + 3} ${size / 2}" stroke="${bg.color}" stroke-width="1"/>`
      : '') +
    `</pattern></defs>`
  return rect + grid + `<rect width="${width}" height="${height}" fill="url(#ng-bg)"/>`
}
