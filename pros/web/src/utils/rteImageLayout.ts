/** 图片排版：对齐、环绕、拖放落点和宽度限制。旧文档没有这些属性时居中独占一行。 */

export type RteImageAlign = 'left' | 'center' | 'right'
export type RteImageLayout = 'block' | 'wrap-left' | 'wrap-right'
export type RteImageDropKind = 'before' | 'after' | 'left' | 'right'

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

/** 拖到图片左右缘形成并排，其余按块前/块后插入。 */
export function imageDropKind(xRatio: number, yRatio: number, overImage: boolean): RteImageDropKind {
  const x = Number.isFinite(xRatio) ? Math.min(1, Math.max(0, xRatio)) : 0.5
  const y = Number.isFinite(yRatio) ? Math.min(1, Math.max(0, yRatio)) : 0.5
  if (overImage && x <= 0.35) return 'left'
  if (overImage && x >= 0.65) return 'right'
  return y < 0.5 ? 'before' : 'after'
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
