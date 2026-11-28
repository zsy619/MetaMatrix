/**
 * 连线落点命中测试。
 *
 * 松手位置经常落在卡片外几像素，只按矩形命中会生成悬空连线，
 * 看起来像「连不上」，所以精确命中之外再给一圈屏幕像素容差。
 */
import type { GraphNode } from '../../../types/nodeGraph'

/** 点在哪个节点矩形内（按绘制顺序取最上层）。 */
export function nodeAtPoint(nodes: GraphNode[], x: number, y: number): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]
    if (x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height) {
      return node
    }
  }
  return null
}

/** 容差内离该点最近的节点；都不在范围内返回 null。 */
export function nearestNodeWithin(
  nodes: GraphNode[],
  x: number,
  y: number,
  tolerance: number,
): GraphNode | null {
  let best: GraphNode | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const node of nodes) {
    const dx = Math.max(node.x - x, 0, x - (node.x + node.width))
    const dy = Math.max(node.y - y, 0, y - (node.y + node.height))
    const dist = Math.hypot(dx, dy)
    if (dist <= tolerance && dist < bestDist) {
      best = node
      bestDist = dist
    }
  }
  return best
}

/** 连线落点：先精确命中，再按容差吸附。 */
export function connectTargetAt(
  nodes: GraphNode[],
  x: number,
  y: number,
  tolerance: number,
): GraphNode | null {
  return nodeAtPoint(nodes, x, y) ?? nearestNodeWithin(nodes, x, y, tolerance)
}
