import { describe, expect, it } from 'vitest'
import { computeGuides, snapToGrid } from './guides'
import type { GraphNode } from '../../../types/nodeGraph'

const node = (id: string, x: number, y: number): GraphNode => ({
  id,
  type: 'richtext',
  x,
  y,
  width: 100,
  height: 40,
  title: id,
})

describe('智能参考线与网格吸附', () => {
  it('拖动节点靠近另一节点的左边会自动吸附并给出竖线', () => {
    const result = computeGuides([{ x: 103, y: 200, width: 100, height: 40 }], [node('a', 100, 0)], 6)
    expect(result.dx).toBe(-3)
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0]).toMatchObject({ orientation: 'v', at: 100 })
  })

  it('超出阈值就不吸附', () => {
    const result = computeGuides([{ x: 130, y: 200, width: 100, height: 40 }], [node('a', 100, 0)], 6)
    expect(result.dx).toBe(0)
    expect(result.guides).toHaveLength(0)
  })

  it('网格吸附按最近格子取整', () => {
    expect(snapToGrid(13, 8)).toBe(16)
    expect(snapToGrid(11, 8)).toBe(8)
    expect(snapToGrid(11, 0)).toBe(11)
  })
})
