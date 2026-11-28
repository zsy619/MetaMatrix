/**
 * 拖动节点时的智能参考线。
 *
 * 纯计算：给一组被拖动的矩形和其他节点，返回需要吸附的位移与要画的参考线。
 */
import type { GraphNode } from '../../../types/nodeGraph'

export type Guide = {
  orientation: 'v' | 'h'
  /** 世界坐标：竖线是 x，横线是 y。 */
  at: number
  /** 线段的起止（世界坐标），让参考线只覆盖相关节点。 */
  from: number
  to: number
}

export type GuideResult = {
  guides: Guide[]
  /** 需要额外施加的吸附位移，没有就是 0。 */
  dx: number
  dy: number
}

type Rect = { x: number; y: number; width: number; height: number }

function xEdges(rect: Rect): number[] {
  return [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
}

function yEdges(rect: Rect): number[] {
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height]
}

/**
 * 找最近的边/中线对齐。
 *
 * threshold 是屏幕像素，调用方先除以 zoom 换成世界坐标，缩小时手感才一致。
 */
export function computeGuides(moving: Rect[], others: GraphNode[], threshold = 6): GuideResult {
  if (!moving.length || !others.length) return { guides: [], dx: 0, dy: 0 }
  let bestX: { delta: number; at: number; other: GraphNode } | null = null
  let bestY: { delta: number; at: number; other: GraphNode } | null = null
  for (const rect of moving) {
    for (const edgeX of xEdges(rect)) {
      for (const other of others) {
        for (const targetX of xEdges(other)) {
          const delta = targetX - edgeX
          if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
            bestX = { delta, at: targetX, other }
          }
        }
      }
    }
    for (const edgeY of yEdges(rect)) {
      for (const other of others) {
        for (const targetY of yEdges(other)) {
          const delta = targetY - edgeY
          if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
            bestY = { delta, at: targetY, other }
          }
        }
      }
    }
  }
  const guides: Guide[] = []
  if (bestX) {
    const ys = [bestX.other.y + bestX.other.height / 2, ...moving.map((r) => r.y + r.height / 2)]
    guides.push({ orientation: 'v', at: bestX.at, from: Math.min(...ys) - 40, to: Math.max(...ys) + 40 })
  }
  if (bestY) {
    const xs = [bestY.other.x + bestY.other.width / 2, ...moving.map((r) => r.x + r.width / 2)]
    guides.push({ orientation: 'h', at: bestY.at, from: Math.min(...xs) - 40, to: Math.max(...xs) + 40 })
  }
  return { guides, dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0 }
}

/** 网格吸附。 */
export function snapToGrid(value: number, gridSize: number): number {
  if (!gridSize || gridSize < 2) return value
  return Math.round(value / gridSize) * gridSize
}
