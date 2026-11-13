/** 图片排版：对齐、环绕、拖放落点和宽度限制。旧文档没有这些属性时居中独占一行。 */
import { parseAspectRatio } from './rteImageCrop'

export type RteImageAlign = 'left' | 'center' | 'right'
export type RteImageLayout = 'block' | 'wrap-left' | 'wrap-right'
export type RteImageDropKind = 'before' | 'after' | 'left' | 'right' | 'center'

export type RteImagePlacement = {
  align: RteImageAlign
  layout: RteImageLayout
}

export const IMAGE_PLACEMENTS: Array<RteImagePlacement & { id: string; label: string }> = [
  { id: 'center', label: '居中', align: 'center', layout: 'block' },
  { id: 'left', label: '居左', align: 'left', layout: 'block' },
  { id: 'right', label: '居右', align: 'right', layout: 'block' },
  { id: 'wrap-left', label: '左环绕', align: 'left', layout: 'wrap-left' },
  { id: 'wrap-right', label: '右环绕', align: 'right', layout: 'wrap-right' },
]

const CONTAINERS = new Set(['doc', 'column', 'callout', 'toggleBlock', 'blockquote'])

export function normalizeImageAlign(value: unknown): RteImageAlign {
  if (value === 'left' || value === 'right' || value === 'center') return value
  return 'center'
}

export function normalizeImageLayout(value: unknown, floatStyle?: string | null): RteImageLayout {
  if (value === 'block' || value === 'wrap-left' || value === 'wrap-right') return value
  const fl = (floatStyle || '').toLowerCase()
  if (fl === 'left') return 'wrap-left'
  if (fl === 'right') return 'wrap-right'
  return 'block'
}

export function placementActive(
  align: unknown,
  layout: unknown,
  option: { align: RteImageAlign; layout: RteImageLayout },
): boolean {
  return normalizeImageAlign(align) === option.align && normalizeImageLayout(layout) === option.layout
}

/** 上下各 36% 是叠放，左右缘并排，图片正中不落成下沿。 */
export function imageDropKind(xRatio: number, yRatio: number, overImage: boolean): RteImageDropKind {
  const x = Number.isFinite(xRatio) ? Math.min(1, Math.max(0, xRatio)) : 0.5
  const y = Number.isFinite(yRatio) ? Math.min(1, Math.max(0, yRatio)) : 0.5
  if (overImage && y <= 0.36) return 'before'
  if (overImage && y >= 0.64) return 'after'
  if (overImage && x <= 0.35) return 'left'
  if (overImage && x >= 0.65) return 'right'
  if (overImage) return 'center'
  return y < 0.5 ? 'before' : 'after'
}

/** 选宽度预设。百分比和「原始」都清掉拖出来的像素宽高，避免和预设抢尺寸。 */
export function imageDisplayWidthPatch(value: string): { displayWidth: string | null; width: null; height: null } {
  const next = String(value ?? '').trim()
  return { displayWidth: next || null, width: null, height: null }
}

/** 拖出来的像素优先；否则用百分比；都没有就回到图片本身的大小。有裁剪比例时高度交给比例，避免旧像素高度把裁剪框压扁。 */
export function imageSizeStyle(attrs: {
  width?: unknown
  height?: unknown
  displayWidth?: unknown
  cropAspect?: unknown
}): { width: string; height: string } {
  const width = Number(attrs.width)
  const height = Number(attrs.height)
  const hasWidth = Number.isFinite(width) && width > 0
  const hasHeight = Number.isFinite(height) && height > 0
  const cropped = parseAspectRatio(typeof attrs.cropAspect === 'string' ? attrs.cropAspect : null) != null
  if (hasWidth || hasHeight) {
    if (cropped) {
      return hasWidth ? { width: `${width}px`, height: 'auto' } : { width: 'auto', height: `${height}px` }
    }
    return {
      width: hasWidth ? `${width}px` : '',
      height: hasHeight ? `${height}px` : 'auto',
    }
  }
  const display = String(attrs.displayWidth || '').trim()
  if (display) return { width: display, height: 'auto' }
  return { width: '', height: '' }
}

export function clampImageWidth(width: number, maxWidth: number, minWidth = 48): number {
  const max = Number.isFinite(maxWidth) && maxWidth > minWidth ? maxWidth : minWidth
  const next = Number.isFinite(width) ? width : minWidth
  return Math.round(Math.min(max, Math.max(minWidth, next)))
}

/**
 * 删掉 from..from+size 之后，插入点应落到的位置。
 * 落在被删区间内时贴到缺口起点，避免插回自己或重复。
 */
export function insertPosAfterDelete(from: number, size: number, insertAt: number): number {
  const end = from + Math.max(0, size)
  if (insertAt >= end) return insertAt - Math.max(0, size)
  if (insertAt > from) return from
  return insertAt
}

export function sameImageDrop(from: number, insertAt: number, size: number): boolean {
  return insertAt >= from && insertAt <= from + size
}

/** 父容器子节点起点。dir=-1 插到前一个块之前，dir=1 插到后一个块之后。到边缘时返回 null，调用方再抬出容器。 */
export function siblingInsertPos(childStarts: number[], childSizes: number[], index: number, dir: -1 | 1): number | null {
  if (index < 0 || index >= childStarts.length) return null
  if (dir < 0) {
    if (index === 0) return null
    return childStarts[index - 1]!
  }
  if (index >= childStarts.length - 1) return null
  return childStarts[index + 1]! + childSizes[index + 1]!
}

export function containerCanHoldImage(typeName: string): boolean {
  return CONTAINERS.has(typeName)
}
