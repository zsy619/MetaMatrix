/**
 * 图片裁剪的几何模型。
 *
 * 裁剪由三部分组成：比例（aspect）、焦点（focusX/focusY）、缩放（zoom）。
 * 图片替换时保留裁剪参数，所以裁剪和替换可以分开做。
 */

export type ImageCrop = {
  /** 裁剪比例，如 1/1、16/9；null 表示不裁剪 */
  aspect?: string | null
  /** 焦点位置，0-1 的相对坐标 */
  focusX?: number
  focusY?: number
  /** 缩放倍数，1 表示不放大 */
  zoom?: number
}

/** 解析 '16/9' 这样的比例为数值比。非法返回 null。 */
export function parseAspectRatio(text: string | null | undefined): number | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const m = /^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/.exec(raw)
  if (!m) {
    const single = Number(raw)
    return Number.isFinite(single) && single > 0 ? single : null
  }
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return w / h
}

/** 归一化：焦点夹在 0-1，缩放夹在 1-4，比例必须能解析为正数比。 */
export function normalizeImageCrop(crop: ImageCrop | null | undefined): Required<ImageCrop> {
  const raw = crop || {}
  const focusX = Number(raw.focusX)
  const focusY = Number(raw.focusY)
  const zoom = Number(raw.zoom)
  const aspect = parseAspectRatio(raw.aspect)
  return {
    aspect: aspect == null ? null : String(raw.aspect).trim(),
    focusX: Number.isFinite(focusX) ? Math.min(1, Math.max(0, focusX)) : 0.5,
    focusY: Number.isFinite(focusY) ? Math.min(1, Math.max(0, focusY)) : 0.5,
    zoom: Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1,
  }
}

/**
 * 计算裁剪框在显示盒内的矩形。
 * 显示盒是 displayWidth x displayHeight；比例决定可见矩形的大小，
 * 焦点决定保留原图的哪一块，zoom 越大可见范围越小。
 */
export function cropRect(
  crop: ImageCrop | null | undefined,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number; width: number; height: number } {
  const boxW = Math.max(0, displayWidth)
  const boxH = Math.max(0, displayHeight)
  const c = normalizeImageCrop(crop)
  const ratio = parseAspectRatio(c.aspect)
  if (ratio == null) {
    return { x: 0, y: 0, width: boxW, height: boxH }
  }
  // 先按比例算出在盒内的可见矩形（contain）
  let rectW = boxW
  let rectH = rectW / ratio
  if (rectH > boxH) {
    rectH = boxH
    rectW = rectH * ratio
  }
  // 缩放：可见范围按 zoom 缩小
  rectW = rectW / c.zoom
  rectH = rectH / c.zoom
  // 焦点决定位置，夹在盒内
  const x = (boxW - rectW) * c.focusX
  const y = (boxH - rectH) * c.focusY
  return {
    x: Math.min(Math.max(0, x), Math.max(0, boxW - rectW)),
    y: Math.min(Math.max(0, y), Math.max(0, boxH - rectH)),
    width: rectW,
    height: rectH,
  }
}

/** 生成用于 <img> 的样式。没有任何裁剪时返回空对象。 */
export function cropStyle(crop: ImageCrop | null | undefined): Record<string, string> {
  const c = normalizeImageCrop(crop)
  const hasAspect = parseAspectRatio(c.aspect) != null
  if (!hasAspect && c.zoom === 1) return {}
  const style: Record<string, string> = { 'object-fit': 'cover' }
  if (hasAspect) {
    style['object-position'] = `${Math.round(c.focusX * 100)}% ${Math.round(c.focusY * 100)}%`
    style['aspect-ratio'] = String(c.aspect).trim().replace(/\s*[/:]+\s*/, ' / ')
  }
  if (c.zoom > 1) {
    style.transform = `scale(${c.zoom})`
  }
  return style
}

/** 图片替换时保留裁剪参数。 */
export function keepCropOnReplace(
  oldAttrs: Record<string, unknown>,
  nextSrc: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(oldAttrs || {}) }
  next.src = nextSrc
  const aspect = (oldAttrs || {}).cropAspect
  const focusX = (oldAttrs || {}).cropFocusX
  const focusY = (oldAttrs || {}).cropFocusY
  const zoom = (oldAttrs || {}).cropZoom
  if (aspect != null) next.cropAspect = aspect
  if (focusX != null) next.cropFocusX = focusX
  if (focusY != null) next.cropFocusY = focusY
  if (zoom != null) next.cropZoom = zoom
  return next
}
