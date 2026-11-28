import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type GraphNode } from '../../../types/nodeGraph'
import { findFreeSpot } from './placeNode'

function node(x: number, y: number): GraphNode {
  return {
    id: 'n' + x + '-' + y,
    type: 'richtext',
    x,
    y,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    title: '',
  }
}

describe('新节点落点', () => {
  it('空画布落在基准点', () => {
    expect(findFreeSpot([], 320, 211)).toEqual({ x: 320, y: 211 })
  })

  it('基准点被占用时挪到旁边，且两次添加不重叠', () => {
    const first = findFreeSpot([node(320, 211)], 320, 211)
    expect(first).not.toEqual({ x: 320, y: 211 })
    const second = findFreeSpot([node(320, 211), node(first.x, first.y)], 320, 211)
    expect(second).not.toEqual(first)
  })

  it('落点不会压在已有节点上', () => {
    const nodes = [node(320, 211), node(600, 382)]
    const spot = findFreeSpot(nodes, 320, 211)
    for (const n of nodes) {
      const hit =
        spot.x < n.x + n.width + 12 &&
        spot.x + DEFAULT_NODE_WIDTH + 12 > n.x &&
        spot.y < n.y + n.height + 12 &&
        spot.y + DEFAULT_NODE_HEIGHT + 12 > n.y
      expect(hit).toBe(false)
    }
  })
})
