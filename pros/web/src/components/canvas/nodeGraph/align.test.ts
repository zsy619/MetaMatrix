/** 多选对齐与分布的几何计算。 */
import { describe, expect, it } from 'vitest'
import { alignNodes, distributeNodes, selectionBounds, type NodeRect } from './align'

function n(id: string, x: number, y: number, width = 100, height = 50): NodeRect {
  return { id, x, y, width, height }
}

describe('多选对齐', () => {
  it('包围盒覆盖全部选中节点', () => {
    const box = selectionBounds([n('a', 10, 20), n('b', 110, 60, 40, 30)])
    expect(box).toEqual({ minX: 10, minY: 20, maxX: 150, maxY: 90, width: 140, height: 70 })
  })

  it('左对齐：所有节点贴选区左缘', () => {
    const out = alignNodes([n('a', 10, 0), n('b', 200, 40)], 'left')
    expect(out.a).toBeUndefined()
    expect(out.b).toEqual({ x: 10, y: 40 })
  })

  it('右对齐：所有节点贴选区右缘', () => {
    const out = alignNodes([n('a', 10, 0, 100, 50), n('b', 200, 40, 40, 30)], 'right')
    // b 的右缘本来就在选区右缘，不该动
    expect(out.a).toEqual({ x: 140, y: 0 })
    expect(out.b).toBeUndefined()
  })

  it('水平居中：节点中心对齐到选区中心', () => {
    const out = alignNodes([n('a', 0, 0, 100, 50), n('b', 200, 0, 40, 50)], 'center')
    // 选区宽 240，中心 120：a 宽 100 → x=70；b 宽 40 → x=100
    expect(out.a).toEqual({ x: 70, y: 0 })
    expect(out.b).toEqual({ x: 100, y: 0 })
  })

  it('顶对齐与垂直居中', () => {
    const up = alignNodes([n('a', 0, 100, 50, 20), n('b', 60, 0, 50, 20)], 'top')
    expect(up.a).toEqual({ x: 0, y: 0 })
    // 选区高 120：垂直居中 = 0 + (120-20)/2 = 50
    const mid = alignNodes([n('a', 0, 100, 50, 20), n('b', 60, 0, 50, 20)], 'middle')
    expect(mid.a?.y).toBe(50)
    expect(mid.b?.y).toBe(50)
  })

  it('只有一个节点时不动', () => {
    expect(alignNodes([n('a', 10, 10)], 'left')).toEqual({})
  })
})

describe('多选分布', () => {
  it('水平分布：中间节点等间距，首尾不动', () => {
    const out = distributeNodes([n('a', 0, 0, 100, 50), n('b', 130, 0, 100, 50), n('c', 400, 0, 100, 50)], 'horizontal')
    // 可用空间 300，减去中间节点自身宽度 100，缺口 200 分成两段 = 100
    expect(out.b).toEqual({ x: 200, y: 0 })
    expect(out.a).toBeUndefined()
    expect(out.c).toBeUndefined()
  })

  it('少于三个节点不分布', () => {
    expect(distributeNodes([n('a', 0, 0), n('b', 100, 0)], 'horizontal')).toEqual({})
  })
})
