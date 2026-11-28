/** 画布统计：节点数 / 连线数 / 类型分布 / 平均进度。纯计算，面板只负责展示。 */
import type { GraphEdge, GraphNode } from '../../../types/nodeGraph'
import { nodeTypeSpec } from './nodeTypes'

export type CanvasStats = {
  nodes: number
  edges: number
  byType: Record<string, number>
  /** 设置过进度的节点平均进度，没设置过就是 null。 */
  avgProgress: number | null
  completed: number
  progressSet: number
}

export function computeStats(nodes: GraphNode[], edges: GraphEdge[]): CanvasStats {
  const byType: Record<string, number> = {}
  let progressSum = 0
  let progressSet = 0
  let completed = 0
  for (const node of nodes) {
    const label = nodeTypeSpec(node.type).label
    byType[label] = (byType[label] || 0) + 1
    if (typeof node.progress === 'number' && Number.isFinite(node.progress)) {
      const value = Math.max(0, Math.min(100, node.progress))
      progressSum += value
      progressSet += 1
      if (value >= 100) completed += 1
    }
  }
  return {
    nodes: nodes.length,
    edges: edges.length,
    byType,
    avgProgress: progressSet ? Math.round(progressSum / progressSet) : null,
    completed,
    progressSet,
  }
}
