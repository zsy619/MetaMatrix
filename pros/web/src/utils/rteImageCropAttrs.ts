/**
 * 图片裁剪属性与编辑器属性之间的读写。
 *
 * 裁剪数据存在 image 节点的属性上：
 * - cropAspect：比例，如 '16/9'。空表示不裁剪。
 * - cropFocusX / cropFocusY：焦点，0-1 的相对坐标。
 * - cropZoom：缩放倍数，1 表示不放大。
 *
 * 属性名与 utils/rteImageCrop.ts 的 keepCropOnReplace 保持一致，
 * 换图时才能把裁剪参数一起带过去。
 */
import { cropStyle, normalizeImageCrop, type ImageCrop } from './rteImageCrop'

/** 裁剪相关的节点属性名。 */
export const CROP_ATTR_NAMES = {
  aspect: 'cropAspect',
  focusX: 'cropFocusX',
  focusY: 'cropFocusY',
  zoom: 'cropZoom',
} as const

/** 常用裁剪比例预设。 */
export type CropPreset = {
  id: string
  /** 中文标签，如「16:9」 */
  label: string
  /** 比例字符串，null 表示不裁剪 */
  aspect: string | null
  focusX: number
  focusY: number
}

export const CROP_PRESETS: readonly CropPreset[] = [
  { id: 'original', label: '原始', aspect: null, focusX: 0.5, focusY: 0.5 },
  { id: '1-1', label: '1:1', aspect: '1/1', focusX: 0.5, focusY: 0.5 },
  { id: '4-3', label: '4:3', aspect: '4/3', focusX: 0.5, focusY: 0.5 },
  { id: '3-4', label: '3:4', aspect: '3/4', focusX: 0.5, focusY: 0.5 },
  { id: '16-9', label: '16:9', aspect: '16/9', focusX: 0.5, focusY: 0.5 },
  { id: '9-16', label: '9:16', aspect: '9/16', focusX: 0.5, focusY: 0.5 },
]

function num(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** 从节点属性读出裁剪状态。属性缺失时返回归一化后的默认值。 */
export function readCropFromAttrs(attrs: Record<string, unknown> | null | undefined): ImageCrop {
  const raw = attrs || {}
  const aspect = raw[CROP_ATTR_NAMES.aspect]
  const focusX = num(raw[CROP_ATTR_NAMES.focusX])
  const focusY = num(raw[CROP_ATTR_NAMES.focusY])
  const zoom = num(raw[CROP_ATTR_NAMES.zoom])
  return normalizeImageCrop({
    aspect: typeof aspect === 'string' && aspect.trim() ? aspect.trim() : null,
    focusX,
    focusY,
    zoom,
  })
}

/**
 * 把裁剪状态写回节点属性。
 * 没有有效裁剪时删掉这些属性，避免正文里留垃圾属性。
 */
export function writeCropToAttrs(
  attrs: Record<string, unknown> | null | undefined,
  crop: ImageCrop | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(attrs || {}) }
  const c = normalizeImageCrop(crop)
  const hasAspect = !!c.aspect && !!String(c.aspect).trim()
  const hasZoom = c.zoom > 1
  if (!hasAspect && !hasZoom) {
    delete next[CROP_ATTR_NAMES.aspect]
    delete next[CROP_ATTR_NAMES.focusX]
    delete next[CROP_ATTR_NAMES.focusY]
    delete next[CROP_ATTR_NAMES.zoom]
    return next
  }
  if (hasAspect) next[CROP_ATTR_NAMES.aspect] = String(c.aspect).trim()
  else delete next[CROP_ATTR_NAMES.aspect]
  next[CROP_ATTR_NAMES.focusX] = c.focusX ?? 0.5
  next[CROP_ATTR_NAMES.focusY] = c.focusY ?? 0.5
  next[CROP_ATTR_NAMES.zoom] = c.zoom ?? 1
  return next
}

/** 当前裁剪是否生效（决定了要不要写 object-fit 样式）。 */
export function cropIsActive(attrs: Record<string, unknown> | null | undefined): boolean {
  const c = readCropFromAttrs(attrs)
  return !!c.aspect || (c.zoom ?? 1) > 1
}

/** 裁剪落到 <img> 的 style。没有裁剪时返回空对象。 */
export function cropAttrsStyle(attrs: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!cropIsActive(attrs)) return {}
  return cropStyle(readCropFromAttrs(attrs))
}

/** 由预设生成裁剪参数。 */
export function cropFromPreset(preset: CropPreset): ImageCrop {
  return normalizeImageCrop({
    aspect: preset.aspect,
    focusX: preset.focusX,
    focusY: preset.focusY,
    zoom: 1,
  })
}
