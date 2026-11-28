import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../../../types/nodeGraph'
import { computeLayout, LAYOUT_GROUPS, LAYOUT_LABELS, layoutForce, layoutGrid, layoutTree, type LayoutMode } from './layout'

const node = (id: string, x = 0, y = 0): GraphNode => ({
  id,
  type: 'richtext',
  x,
  y,
  width: 200,
  height: 100,
  title: id,
})

const nodes = [node('a'), node('b'), node('c'), node('d')]
const edges: GraphEdge[] = [
  { id: 'e1', source: 'a', target: 'b', label: '' },
  { id: 'e2', source: 'a', target: 'c', label: '' },
  { id: 'e3', source: 'b', target: 'd', label: '' },
]

describe('自动布局', () => {
  it('网格排列互不重叠', () => {
    const out = layoutGrid(nodes)
    const points = Object.values(out)
    expect(points).toHaveLength(4)
    expect(new Set(points.map((p) => p.x + ',' + p.y)).size).toBe(4)
  })

  it('树形按层级从左到右', () => {
    const out = layoutTree(nodes, edges)
    expect(out.a.x).toBeLessThan(out.b.x)
    expect(out.b.x).toBeLessThan(out.d.x)
    expect(out.b.x).toBe(out.c.x)
  })

  it('力导向给每个节点一个位置', () => {
    const out = layoutForce(nodes, edges, 20)
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c', 'd'])
    for (const point of Object.values(out)) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('分层排列自上而下，和树形不是同一种', () => {
    const out = computeLayout(nodes, edges, 'layered')
    expect(out.a.y).toBeLessThan(out.b.y)
    expect(out.b.y).toBeLessThan(out.d.y)
    expect(out.b.y).toBe(out.c.y)
    expect(out).not.toEqual(layoutTree(nodes, edges))
  })

  it('连线成环时树形排列也能结束', () => {
    const loop: GraphEdge[] = [
      { id: 'l1', source: 'a', target: 'b', label: '' },
      { id: 'l2', source: 'b', target: 'a', label: '' },
      // 环要能从根节点走到，否则分层时根本碰不到它。
      { id: 'l3', source: 'c', target: 'a', label: '' },
    ]
    expect(Object.keys(layoutTree(nodes, loop))).toHaveLength(4)
  })

  const MODES = Object.keys(LAYOUT_LABELS) as LayoutMode[]
  const many = 'abcdefgh'.split('').map((id) => node(id))
  const chain: GraphEdge[] = [
    ...edges,
    { id: 'e4', source: 'c', target: 'e', label: '' },
    { id: 'e5', source: 'd', target: 'f', label: '' },
    { id: 'e6', source: 'a', target: 'g', label: '' },
  ]

  // 分类排列看节点属性：标题、进度、类型、编组、颜色各给一套不同的次序，才分得出彼此。
  const varied: GraphNode[] = many.map((item, i) => ({
    ...item,
    title: 'hgfedcba'[i],
    progress: [50, 10, 90, 30, 70, 0, 100, 20][i],
    type: i % 2 ? 'canvasRef' : 'richtext',
    groupId: i < 3 ? 'g1' : i < 5 ? 'g2' : undefined,
    color: ['#2563eb', '#7c3aed', '#059669', '#d97706'][i % 4],
  }))

  it('菜单分组不重不漏地覆盖全部排列', () => {
    expect(LAYOUT_GROUPS.flatMap((group) => group.modes).sort()).toEqual([...MODES].sort())
  })

  it('六个没有属性差别的节点上，不看属性的排列也两两不同', () => {
    // 小画布最常见：宽幅不能退化成横排，同心不能退化成环形。分类排列看属性，属性全一样时本来就和网格相同。
    const six = many.slice(0, 6)
    const seen = new Map<string, string>()
    for (const mode of MODES.filter((item) => !item.startsWith('by'))) {
      const key = JSON.stringify(computeLayout(six, edges, mode))
      expect(seen.get(key), mode + ' 与 ' + seen.get(key) + ' 结果相同').toBeUndefined()
      seen.set(key, mode)
    }
  })

  it('四十多种排列两两结果不同', () => {
    expect(MODES.length).toBeGreaterThanOrEqual(40)
    const seen = new Map<string, string>()
    for (const mode of MODES) {
      const key = JSON.stringify(computeLayout(varied, chain, mode))
      expect(seen.get(key), mode + ' 与 ' + seen.get(key) + ' 结果相同').toBeUndefined()
      seen.set(key, mode)
    }
  })

  // 40 个节点、带分叉和一个环：小样本看不出的重叠（螺旋外圈、辐射的窄扇区）在这里暴露。
  const big = Array.from({ length: 40 }, (_, i) => node('n' + i))
  const bigEdges: GraphEdge[] = [
    ...big.slice(1, 30).map((item, i) => ({ id: 'b' + i, source: 'n' + Math.floor(i / 3), target: item.id, label: '' })),
    { id: 'loop', source: 'n29', target: 'n0', label: '' },
  ]

  it.each(MODES)('%s 在 40 个节点的图上也互不重叠', (mode) => {
    const out = computeLayout(big, bigEdges, mode)
    expect(Object.keys(out)).toHaveLength(big.length)
    for (let i = 0; i < big.length; i += 1) {
      for (let j = i + 1; j < big.length; j += 1) {
        const a = out[big[i].id]
        const b = out[big[j].id]
        const apart = Math.abs(a.x - b.x) >= 200 || Math.abs(a.y - b.y) >= 100
        expect(apart, big[i].id + ' 与 ' + big[j].id + ' 重叠').toBe(true)
      }
    }
  })

  // 环上的间距靠公式保证，节点多了才看得出公式错没错。
  it.each(['concentric', 'star', 'sunflower', 'ellipse'] as LayoutMode[])('%s 在 200 个节点时也互不重叠', (mode) => {
    const crowd = Array.from({ length: 200 }, (_, i) => node('n' + i))
    const points = Object.values(computeLayout(crowd, [], mode))
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const apart = Math.abs(points[i].x - points[j].x) >= 200 || Math.abs(points[i].y - points[j].y) >= 100
        expect(apart, i + ' 与 ' + j + ' 重叠').toBe(true)
      }
    }
  })

  it.each(MODES)('%s 排列后左上角留在原内容的左上角', (mode) => {
    const moved = many.map((item) => ({ ...item, x: item.x + 300, y: item.y + 200 }))
    const points = Object.values(computeLayout(moved, chain, mode))
    expect(Math.min(...points.map((p) => p.x))).toBeGreaterThanOrEqual(300)
    expect(Math.min(...points.map((p) => p.y))).toBeGreaterThanOrEqual(200)
  })

  it('反向树形把根放到最右，倒置分层把根放到最下', () => {
    const tree = computeLayout(nodes, edges, 'treeReverse')
    expect(tree.a.x).toBeGreaterThan(tree.b.x)
    expect(tree.b.x).toBeGreaterThan(tree.d.x)
    const layered = computeLayout(nodes, edges, 'layeredReverse')
    expect(layered.a.y).toBeGreaterThan(layered.b.y)
    expect(layered.b.y).toBeGreaterThan(layered.d.y)
  })

  it('脑图把根放中间，子节点分到左右两侧，后代跟着父节点那一侧', () => {
    const out = computeLayout(nodes, edges, 'mindmap')
    // a → b、c；b → d：b 在右、c 在左、d 在 b 的更右边。
    expect(out.c.x).toBeLessThan(out.a.x)
    expect(out.a.x).toBeLessThan(out.b.x)
    expect(out.b.x).toBeLessThan(out.d.x)
  })

  it('辐射排列离根越远的层半径越大', () => {
    const out = computeLayout(nodes, edges, 'radial')
    const dist = (id: string) => Math.hypot(out[id].x - out.a.x, out[id].y - out.a.y)
    expect(dist('b')).toBeGreaterThan(0)
    expect(dist('d')).toBeGreaterThan(dist('b'))
  })

  it('辐射排列把子节点放在父节点的方向上，不会排成一条线', () => {
    // 两个根、每层两个节点：每圈都从正上方起摆的话会上下对齐成一列。
    const six = 'abcdef'.split('').map((id) => node(id))
    const out = computeLayout(six, [
      { id: 'r1', source: 'a', target: 'c', label: '' },
      { id: 'r2', source: 'a', target: 'd', label: '' },
      { id: 'r3', source: 'c', target: 'e', label: '' },
      { id: 'r4', source: 'c', target: 'f', label: '' },
    ], 'radial')
    expect(new Set(Object.values(out).map((p) => p.x)).size).toBeGreaterThan(3)
    expect(new Set(Object.values(out).map((p) => p.y)).size).toBeGreaterThan(3)
    // 单链 a → b → d：d 在 b 的正外侧，三点共线。
    const line = computeLayout(nodes, edges, 'radial')
    const cross = (line.b.x - line.a.x) * (line.d.y - line.a.y) - (line.b.y - line.a.y) * (line.d.x - line.a.x)
    expect(Math.abs(cross)).toBeLessThan(400)
  })

  it('蛇形排列第二行从右往左接上第一行的末尾', () => {
    const out = computeLayout(many, [], 'snake')
    // 8 个节点 3 列：c 是第一行最后一个，d 紧接在它正下方。
    expect(out.d.x).toBe(out.c.x)
    expect(out.d.y).toBeGreaterThan(out.c.y)
    expect(out.e.x).toBeLessThan(out.d.x)
  })

  it.each(MODES)('%s 对空画布和单个节点都有结果', (mode) => {
    expect(computeLayout([], [], mode)).toEqual({})
    expect(computeLayout([node('a', 30, 40)], [], mode)).toEqual({ a: { x: 30, y: 40 } })
  })

  it('组织架构把父节点居中放在子节点上方，大纲一行一个并按层缩进', () => {
    // a → b、c；b → d
    const org = computeLayout(nodes, edges, 'org')
    expect(org.a.y).toBeLessThan(org.b.y)
    expect(org.b.y).toBe(org.c.y)
    expect(org.a.x).toBe((org.b.x + org.c.x) / 2)
    expect(org.d.x).toBe(org.b.x)
    const outline = computeLayout(nodes, edges, 'outline')
    expect(['a', 'b', 'd', 'c'].map((id) => outline[id].y)).toEqual([...Object.values(outline).map((p) => p.y)].sort((x, y) => x - y))
    expect(outline.a.x).toBeLessThan(outline.b.x)
    expect(outline.b.x).toBeLessThan(outline.d.x)
    expect(outline.c.x).toBe(outline.b.x)
  })

  it('泳道排列把不相连的节点分到不同泳道', () => {
    const out = computeLayout(many, chain, 'lanes')
    // a…g 连成一组，h 独自一组，排在所有人下面。
    for (const id of 'abcdefg') expect(out.h.y).toBeGreaterThan(out[id].y)
  })

  it('分类排列按属性排序或分行', () => {
    const title = computeLayout(varied, [], 'byTitle')
    // 标题是倒着给的：最后一个节点标题最小，排到最前。
    expect(title.h).toEqual({ x: 0, y: 0 })
    const progress = computeLayout(varied, [], 'byProgress')
    expect(progress.f).toEqual({ x: 0, y: 0 })
    const group = computeLayout(varied, [], 'byGroup')
    expect(new Set(['a', 'b', 'c'].map((id) => group[id].y)).size).toBe(1)
    expect(group.d.y).toBeGreaterThan(group.a.y)
    // 没编组的排最后。
    expect(group.f.y).toBeGreaterThan(group.d.y)
  })

  it('瀑布排列把节点放进最矮的一列', () => {
    const tallFirst = [{ ...node('a'), height: 300 }, node('b'), node('c'), node('d')]
    const out = computeLayout(tallFirst, [], 'masonry')
    // 两列：a 很高，c 接在 b 下面而不是 a 下面。
    expect(out.c.x).toBe(out.b.x)
    expect(out.c.y).toBeGreaterThan(out.b.y)
    expect(out.d.x).toBe(out.b.x)
  })

  it('力导向没有连线时也不会散得很开', () => {
    const points = Object.values(layoutForce(many, []))
    const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))
    // 8 个 200 宽的节点：排成一行是 1848，收拢后应明显小于它。
    expect(spanX).toBeLessThan(1200)
  })

  it.each(MODES)('%s 排列后节点互不重叠', (mode) => {
    const out = computeLayout(many, chain, mode)
    expect(Object.keys(out)).toHaveLength(many.length)
    for (let i = 0; i < many.length; i += 1) {
      for (let j = i + 1; j < many.length; j += 1) {
        const a = out[many[i].id]
        const b = out[many[j].id]
        const apart = Math.abs(a.x - b.x) >= many[i].width || Math.abs(a.y - b.y) >= many[i].height
        expect(apart, many[i].id + ' 与 ' + many[j].id + ' 重叠').toBe(true)
      }
    }
  })
})
