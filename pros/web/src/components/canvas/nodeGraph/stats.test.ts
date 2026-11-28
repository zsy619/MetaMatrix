import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../../types/nodeGraph'
import { computeStats } from './stats'

const node = (patch: Partial<GraphNode>): GraphNode => ({
  id: Math.random().toString(36),
  type: 'richtext',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  title: '',
  ...patch,
})

describe('画布统计', () => {
  it('统计节点、连线、类型与平均进度', () => {
    const stats = computeStats(
      [
        node({ type: 'richtext', progress: 100 }),
        node({ type: 'canvasRef', progress: 50 }),
        node({ type: 'richtext' }),
      ],
      [{ id: 'e1', source: 'x', target: 'y', label: '' }],
    )
    expect(stats.nodes).toBe(3)
    expect(stats.edges).toBe(1)
    expect(stats.byType).toEqual({ 富文本: 2, 画布: 1 })
    expect(stats.avgProgress).toBe(75)
    expect(stats.completed).toBe(1)
    expect(stats.progressSet).toBe(2)
  })

  it('没有进度时返回 null', () => {
    expect(computeStats([node({})], []).avgProgress).toBeNull()
  })
})
