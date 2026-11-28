// @vitest-environment happy-dom
/**
 * 节点画布的复制 / 微调 / 全选（同 excalidraw 的操作习惯）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(async () => ({})),
  listDocuments: vi.fn(async () => []),
}))

import { useNodeGraphStore } from './nodeGraph'

describe('节点画布操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('复制节点会连带复制内部连线，并选中副本', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 10, y: 20, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 20, width: 240, height: 96, title: 'B' },
    ]
    store.edges = [{ id: 'e1', source: 'a', target: 'b', label: '' }]

    store.duplicateNodes(['a', 'b'])

    expect(store.nodes).toHaveLength(4)
    const copyA = store.nodes[2]!
    const copyB = store.nodes[3]!
    expect(copyA.title).toBe('A')
    expect(copyA.id).not.toBe('a')
    // 副本整体偏移一格，原地不动。
    expect(copyA.x).toBe(34)
    expect(copyA.y).toBe(44)
    expect(store.nodes[0]!.x).toBe(10)
    // 两端都被复制的连线一起复制。
    expect(store.edges).toHaveLength(2)
    expect(store.edges[1]!.source).toBe(copyA.id)
    expect(store.edges[1]!.target).toBe(copyB.id)
    // 选中的是副本。
    expect(store.selectedNodeIds).toEqual([copyA.id, copyB.id])
  })

  it('微调只动选中的节点', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 10, y: 20, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 20, width: 240, height: 96, title: 'B' },
    ]
    store.selectedNodeIds = ['a']
    store.nudgeNodes(5, -3)
    expect(store.nodes[0]!.x).toBe(15)
    expect(store.nodes[0]!.y).toBe(17)
    expect(store.nodes[1]!.x).toBe(300)
    expect(store.nodes[1]!.y).toBe(20)
  })

  it('全选选中所有节点并清掉连线选择', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 0, width: 240, height: 96, title: 'B' },
    ]
    store.selectedEdgeIds = ['e1']
    store.selectAll()
    expect(store.selectedNodeIds).toEqual(['a', 'b'])
    expect(store.selectedEdgeIds).toEqual([])
  })

  it('复制到剪贴板再粘贴会重新发 id，并保留内部连线', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 0, width: 240, height: 96, title: 'B' },
    ]
    store.edges = [{ id: 'e1', source: 'a', target: 'b', label: '' }]
    store.selectedNodeIds = ['a', 'b']

    const payload = store.copySelection()
    expect(payload?.nodes).toHaveLength(2)
    store.pasteSubgraph(payload!, { x: 500, y: 300 })

    expect(store.nodes).toHaveLength(4)
    const copies = store.nodes.slice(2)
    expect(copies.map((node) => node.id)).not.toContain('a')
    // 落点对齐到 origin。
    expect(copies[0]!.x).toBe(500)
    expect(copies[0]!.y).toBe(300)
    expect(store.edges).toHaveLength(2)
    expect(store.selectedNodeIds).toHaveLength(2)
  })

  it('自动布局把叠在一起的节点排开', () => {
    const store = useNodeGraphStore()
    store.nodes = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      type: 'richtext' as const,
      x: 0,
      y: 0,
      width: 240,
      height: 96,
      title: id,
    }))
    store.autoLayout('grid')
    const positions = store.nodes.map((node) => node.x + ',' + node.y)
    expect(new Set(positions).size).toBe(4)
  })

  it('自动布局不挪动锁定的节点', () => {
    const store = useNodeGraphStore()
    store.nodes = ['a', 'b', 'c'].map((id) => ({
      id,
      type: 'richtext' as const,
      x: 500,
      y: 500,
      width: 240,
      height: 96,
      title: id,
      locked: id === 'a',
    }))
    store.autoLayout('row')
    expect(store.nodes[0]).toMatchObject({ x: 500, y: 500 })
    expect(store.nodes[1].x).not.toBe(store.nodes[2].x)
  })

  it('拖动连线端点可以改接到别的节点，重复/自连被挡下', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 0, width: 240, height: 96, title: 'B' },
      { id: 'c', type: 'richtext', x: 600, y: 0, width: 240, height: 96, title: 'C' },
    ]
    store.edges = [{ id: 'e1', source: 'a', target: 'b', label: '' }]
    expect(store.reconnectEdge('e1', 'target', 'c', { side: 'left', offset: 0.3 })).toBe(true)
    expect(store.edges[0]!.target).toBe('c')
    expect(store.edges[0]!.targetAnchor).toEqual({ side: 'left', offset: 0.3 })
    // 自己连自己
    expect(store.reconnectEdge('e1', 'source', 'c')).toBe(false)
    // 已有同向连线
    store.edges = [
      { id: 'e1', source: 'a', target: 'c', label: '' },
      { id: 'e2', source: 'b', target: 'c', label: '' },
    ]
    expect(store.reconnectEdge('e2', 'source', 'a')).toBe(false)
  })

  it('连线可以悬空一端，样式可以单独修改', () => {
    const store = useNodeGraphStore()
    store.nodes = [{ id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' }]
    expect(store.addEdge('a', '', '', { side: 'right', offset: 0.5 }, undefined, { targetPoint: { x: 500, y: 120 } })).toBe(true)
    expect(store.edges[0]!.target).toBe('')
    expect(store.edges[0]!.targetPoint).toEqual({ x: 500, y: 120 })

    store.updateEdgeStyle(store.edges[0]!.id, { line: 'dashed', arrow: 'both', width: 2.4 })
    expect(store.edges[0]!.style).toMatchObject({ line: 'dashed', arrow: 'both', width: 2.4 })
    store.undo()
    expect(store.edges[0]!.style?.line).toBeUndefined()
  })

  it('锁定节点不参与选择，删除后可在回收站恢复', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 0, width: 240, height: 96, title: 'B' },
    ]
    store.selectNodes(['a'])
    store.setLocked(['a'], true)
    expect(store.selectedNodeIds).toEqual([])
    expect(store.nodes[0]!.locked).toBe(true)

    store.removeNodes(['a'])
    expect(store.nodes).toHaveLength(1)
    expect(store.deleted[0]!.node.id).toBe('a')
    store.restoreDeleted('a')
    expect(store.nodes.map((node) => node.id)).toContain('a')
    expect(store.deleted).toHaveLength(0)
  })

  it('编组后选中任一成员可拿到整组，整组一起拖动', () => {
    const store = useNodeGraphStore()
    store.nodes = [
      { id: 'a', type: 'richtext', x: 0, y: 0, width: 240, height: 96, title: 'A' },
      { id: 'b', type: 'richtext', x: 300, y: 0, width: 240, height: 96, title: 'B' },
    ]
    store.selectNodes(['a', 'b'])
    store.groupSelection()
    const groupId = store.nodes[0]!.groupId
    expect(groupId).toBeTruthy()
    expect(store.groupMembers('b')).toEqual(['a', 'b'])
    store.beginDrag()
    store.moveNodes({ a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }, 40, 20)
    expect(store.nodes[1]!.x).toBe(340)
    expect(store.nodes[1]!.y).toBe(20)
  })
})
