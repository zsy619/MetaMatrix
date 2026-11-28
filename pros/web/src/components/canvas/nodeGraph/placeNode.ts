import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type GraphNode } from '../../../types/nodeGraph'

/** 相邻落点之间的间距。 */
const STEP = 28
/** 两个节点之间留的空隙。 */
const GAP = 12

function overlaps(x: number, y: number, node: GraphNode): boolean {
  return (
    x < node.x + node.width + GAP &&
    x + DEFAULT_NODE_WIDTH + GAP > node.x &&
    y < node.y + node.height + GAP &&
    y + DEFAULT_NODE_HEIGHT + GAP > node.y
  )
}

/**
 * 新节点的落点。
 *
 * 新节点都落在同一个点会严丝合缝地叠在一起，压在下面的那个根本点不到。
 * 从基准点开始按网格往外找第一个不与已有节点重叠的位置。
 */
export function findFreeSpot(
  nodes: GraphNode[],
  baseX: number,
  baseY: number,
): { x: number; y: number } {
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const x = baseX + col * STEP
      const y = baseY + row * STEP
      if (!nodes.some((node) => overlaps(x, y, node))) return { x, y }
    }
  }
  // 画布挤满了：退回基准点，至少坐标是确定的。
  return { x: baseX, y: baseY }
}
