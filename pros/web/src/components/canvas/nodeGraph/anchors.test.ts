import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../../types/nodeGraph'
import { anchorForPoint, anchorPair, anchorPoint, anchorSideForPoint } from './anchors'

const source: GraphNode = { id: 'a', type: 'richtext', x: 0, y: 0, width: 200, height: 100, title: 'A' }
const target: GraphNode = { id: 'b', type: 'richtext', x: 400, y: 300, width: 200, height: 100, title: 'B' }

describe('节点连线锚点', () => {
  it('取侧边中点', () => {
    expect(anchorPoint(source, 'top')).toEqual({ x: 100, y: 0 })
    expect(anchorPoint(source, 'bottom')).toEqual({ x: 100, y: 100 })
    expect(anchorPoint(source, 'left')).toEqual({ x: 0, y: 50 })
    expect(anchorPoint(source, 'right')).toEqual({ x: 200, y: 50 })
  })

  it('默认按相对方向换边', () => {
    const diagonal = anchorPair(source, target)
    expect(diagonal.from).toEqual({ x: 200, y: 50 })
    expect(diagonal.to).toEqual({ x: 400, y: 350 })
    const vertical = anchorPair(
      source,
      { ...target, x: 0, y: 300 },
    )
    expect(vertical.from).toEqual({ x: 100, y: 100 })
    expect(vertical.to).toEqual({ x: 100, y: 300 })
  })

  it('保存的锚点优先于方向推断', () => {
    const pair = anchorPair(source, target, 'bottom', 'top')
    expect(pair.from).toEqual({ x: 100, y: 100 })
    expect(pair.to).toEqual({ x: 500, y: 300 })
  })

  it('指针落点映射到最近侧边', () => {
    expect(anchorSideForPoint(source, { x: 10, y: 40 })).toBe('left')
    expect(anchorSideForPoint(source, { x: 190, y: 20 })).toBe('right')
  })

  it('侧边位置支持任意比例', () => {
    expect(anchorPoint(source, 'top', 0.25)).toEqual({ x: 50, y: 0 })
    expect(anchorPoint(source, 'left', 0)).toEqual({ x: 0, y: 0 })
    expect(anchorPoint(source, 'bottom', 1)).toEqual({ x: 200, y: 100 })
  })

  it('指针位置吸附到边框任意像素', () => {
    expect(anchorForPoint(source, { x: 150, y: 3 })).toEqual({ side: 'top', offset: 0.75 })
    expect(anchorForPoint(source, { x: -4, y: 80 })).toEqual({ side: 'left', offset: 0.8 })
  })

  it('保存了偏移的锚点优先于方向推断', () => {
    const pair = anchorPair(source, target, { side: 'right', offset: 0.2 }, { side: 'left', offset: 0.9 })
    expect(pair.from).toEqual({ x: 200, y: 20 })
    expect(pair.to).toEqual({ x: 400, y: 390 })
  })
})
