import { describe, expect, it } from 'vitest'
import { connectTargetAt, nearestNodeWithin, nodeAtPoint } from './hitTest'
import type { GraphNode } from '../../../types/nodeGraph'

function node(id: string, x: number, y: number, width = 200, height = 100): GraphNode {
  return { id, type: 'richtext', title: id, x, y, width, height } as GraphNode
}

const nodes = [node('a', 0, 0), node('b', 300, 0)]

describe('nodeAtPoint', () => {
  it('命中矩形内部', () => {
    expect(nodeAtPoint(nodes, 10, 10)?.id).toBe('a')
  })
  it('矩形外返回 null', () => {
    expect(nodeAtPoint(nodes, 260, 10)).toBeNull()
  })
  it('重叠时取最后绘制的节点', () => {
    expect(nodeAtPoint([node('a', 0, 0), node('b', 50, 0)], 60, 10)?.id).toBe('b')
  })
})

describe('nearestNodeWithin', () => {
  it('卡片外 12px 也能吸附到最近节点', () => {
    expect(nearestNodeWithin(nodes, 212, 10, 24)?.id).toBe('a')
  })
  it('超出容差不吸附', () => {
    expect(nearestNodeWithin(nodes, 260, 10, 24)).toBeNull()
  })
})

describe('connectTargetAt', () => {
  it('内部精确命中优先于容差', () => {
    expect(connectTargetAt(nodes, 305, 10, 24)?.id).toBe('b')
  })
  it('落在缝隙里按最近节点吸附', () => {
    expect(connectTargetAt(nodes, 215, 50, 24)?.id).toBe('a')
  })
})
