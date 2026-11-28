/**
 * 节点连线锚点。
 *
 * 每条连线记录「从哪一侧、侧边什么位置出发」：位置是 0–1 的比例，
 * 所以缩放、改节点宽高后连线仍然钉在同一个相对像素上，而不是滑回中点。
 * 旧数据只有侧边字符串（等价 offset 0.5），这里一并兼容。
 */
import type { AnchorSide, GraphEdge, GraphEdgeAnchor, GraphNode } from '../../../types/nodeGraph'
import { normalizeEdgeAnchor } from '../../../types/nodeGraph'

export type { AnchorSide, GraphEdgeAnchor }

type AnchorLike = AnchorSide | GraphEdgeAnchor | undefined

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** 侧边上的点：offset 0 = 起点（顶/右），1 = 终点（下/左）。 */
export function anchorPoint(node: GraphNode, side: AnchorSide, offset = 0.5): { x: number; y: number } {
  const t = clamp01(offset)
  if (side === 'top') return { x: node.x + node.width * t, y: node.y }
  if (side === 'bottom') return { x: node.x + node.width * t, y: node.y + node.height }
  if (side === 'left') return { x: node.x, y: node.y + node.height * t }
  return { x: node.x + node.width, y: node.y + node.height * t }
}

/** 把字符串或对象锚点统一成 `{ side, offset }`。 */
export function resolveAnchor(anchor: AnchorLike): { side: AnchorSide; offset: number } | null {
  const normalized = normalizeEdgeAnchor(anchor)
  if (!normalized) return null
  return typeof normalized === 'string' ? { side: normalized, offset: 0.5 } : normalized
}

/** 两个矩形之间的连线：取源、目标各自朝向对方的侧边。 */
export function anchorPair(
  source: GraphNode,
  target: GraphNode,
  sourceAnchor?: AnchorLike,
  targetAnchor?: AnchorLike,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  const from = resolveAnchor(sourceAnchor)
  const to = resolveAnchor(targetAnchor)
  if (from && to) {
    return { from: anchorPoint(source, from.side, from.offset), to: anchorPoint(target, to.side, to.offset) }
  }
  const fromSide: AnchorSide =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
  const toSide: AnchorSide = fromSide === 'top' ? 'bottom' : fromSide === 'bottom' ? 'top' : fromSide === 'left' ? 'right' : 'left'
  return { from: anchorPoint(source, fromSide), to: anchorPoint(target, toSide) }
}

/** 指针落在节点矩形附近时，取最接近的侧边。 */
export function anchorSideForPoint(node: GraphNode, point: { x: number; y: number }): AnchorSide {
  const distances: [AnchorSide, number][] = [
    ['top', Math.abs(point.y - node.y)],
    ['bottom', Math.abs(point.y - (node.y + node.height))],
    ['left', Math.abs(point.x - node.x)],
    ['right', Math.abs(point.x - (node.x + node.width))],
  ]
  return distances.reduce((best, item) => (item[1] < best[1] ? item : best), distances[0])[0]
}

/**
 * 把任意指针位置投影到节点边框上：连线端点因此能吸到边框任意像素，
 * 而不是只能吸四个中点。
 */
export function anchorForPoint(node: GraphNode, point: { x: number; y: number }): GraphEdgeAnchor {
  const side = anchorSideForPoint(node, point)
  const offset =
    side === 'top' || side === 'bottom'
      ? clamp01((point.x - node.x) / (node.width || 1))
      : clamp01((point.y - node.y) / (node.height || 1))
  return { side, offset: Math.round(offset * 1000) / 1000 }
}

/**
 * 连线的两个端点。
 *
 * 两端都绑节点时按朝向自动换边；任意一端是悬空点时直接用它，
 * 这样标注线、图例这类「一端不连节点」的连线也能画。
 */
export function edgeEndpoints(
  edge: GraphEdge,
  nodes: Map<string, GraphNode>,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const source = edge.source ? nodes.get(edge.source) : undefined
  const target = edge.target ? nodes.get(edge.target) : undefined
  if (source && target) return anchorPair(source, target, edge.sourceAnchor, edge.targetAnchor)
  const sourceAnchor = resolveAnchor(edge.sourceAnchor)
  const targetAnchor = resolveAnchor(edge.targetAnchor)
  const from =
    edge.sourcePoint ||
    (source ? anchorPoint(source, sourceAnchor?.side || 'right', sourceAnchor?.offset ?? 0.5) : null)
  const to =
    edge.targetPoint ||
    (target ? anchorPoint(target, targetAnchor?.side || 'left', targetAnchor?.offset ?? 0.5) : null)
  if (!from || !to) return null
  return { from, to }
}
