/**
 * 多选节点的对齐与分布。
 *
 * 参照 excalidraw：选中多个节点后，对齐以「选区包围盒」为基准，
 * 而不是以某一个节点为基准，这样整组会一起挪动。
 */
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical'

export type NodeRect = { id: string; x: number; y: number; width: number; height: number }

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }

/** 选区包围盒。没有节点时返回 null。 */
export function selectionBounds(nodes: NodeRect[]): Bounds | null {
  if (!nodes.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * 对齐后的新坐标：id → {x, y}。
 * 只返回真正移动过的节点，没动的就不在结果里。
 */
export function alignNodes(
  nodes: NodeRect[],
  mode: AlignMode,
): Record<string, { x: number; y: number }> {
  const box = selectionBounds(nodes)
  if (!box || nodes.length < 2) return {}
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    let x = n.x
    let y = n.y
    if (mode === 'left') x = box.minX
    else if (mode === 'center') x = box.minX + (box.width - n.width) / 2
    else if (mode === 'right') x = box.maxX - n.width
    else if (mode === 'top') y = box.minY
    else if (mode === 'middle') y = box.minY + (box.height - n.height) / 2
    else if (mode === 'bottom') y = box.maxY - n.height
    if (x !== n.x || y !== n.y) out[n.id] = { x: Math.round(x), y: Math.round(y) }
  }
  return out
}

/**
 * 分布：首尾不动，中间几个等间距排开（间距按边算）。
 * 少于 3 个节点没有可分布的中间项，返回空。
 */
export function distributeNodes(
  nodes: NodeRect[],
  mode: DistributeMode,
): Record<string, { x: number; y: number }> {
  if (nodes.length < 3) return {}
  const horizontal = mode === 'horizontal'
  const sorted = [...nodes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const firstEnd = horizontal ? first.x + first.width : first.y + first.height
  const lastStart = horizontal ? last.x : last.y
  const middle = sorted.slice(1, -1)
  const middleSize = middle.reduce((sum, n) => sum + (horizontal ? n.width : n.height), 0)
  // 首尾固定，中间几个按「边到边」的间距均分。
  const gap = (lastStart - firstEnd - middleSize) / (sorted.length - 1)
  const out: Record<string, { x: number; y: number }> = {}
  let cursor = firstEnd
  for (const n of middle) {
    const size = horizontal ? n.width : n.height
    cursor += gap
    const pos = horizontal ? n.x : n.y
    if (pos !== cursor) {
      out[n.id] = horizontal
        ? { x: Math.round(cursor), y: n.y }
        : { x: n.x, y: Math.round(cursor) }
    }
    cursor += size
  }
  return out
}
