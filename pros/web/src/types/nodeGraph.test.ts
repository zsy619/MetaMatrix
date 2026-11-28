// @vitest-environment happy-dom
/**
 * 节点文档的归一化：新增的描述与画布目标不能被归一化吃掉。
 */
import { describe, expect, it } from 'vitest'
import {
  isNodeGraphDoc,
  normalizeBackground,
  normalizeNodeGraphDoc,
  NODE_GRAPH_TYPE,
  type GraphNode,
} from './nodeGraph'

function node(over: Partial<GraphNode>): GraphNode {
  return {
    id: 'n1',
    type: 'richtext',
    x: 0,
    y: 0,
    width: 240,
    height: 96,
    title: '节点',
    ...over,
  }
}

describe('节点文档归一化', () => {
  it('背景模板保留新增图案，非法值回退默认点阵', () => {
    expect(normalizeBackground({ pattern: 'blueprint', color: '#123456', background: '#ffffff', size: 48 }).pattern).toBe('blueprint')
    expect(normalizeBackground({ pattern: 'bad-pattern' })).toMatchObject({ pattern: 'dots', size: 24 })
  })

  it('保留描述与画布目标', () => {
    const doc = normalizeNodeGraphDoc({
      id: 'd1',
      type: NODE_GRAPH_TYPE,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        node({ type: 'canvasRef', title: '目标', description: '为什么存在', refTemplateId: 'swot' }),
        node({ id: 'n2', type: 'richtext', description: '说明', content: '<p>正文</p>' }),
      ],
      edges: [],
    })
    expect(doc).not.toBeNull()
    const canvas = doc!.nodes[0]!
    expect(canvas.description).toBe('为什么存在')
    expect(canvas.refTemplateId).toBe('swot')
    expect(doc!.nodes[1]!.description).toBe('说明')
  })

  it('进度保留，越界值夹到 0–100，没进度就不加这个字段', () => {
    const doc = normalizeNodeGraphDoc({
      id: 'd1',
      type: NODE_GRAPH_TYPE,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        node({ id: 'a', progress: 42 }),
        node({ id: 'b', progress: 180 }),
        node({ id: 'c', progress: -20 }),
        node({ id: 'd' }),
      ],
      edges: [],
    })
    expect(doc!.nodes[0]!.progress).toBe(42)
    expect(doc!.nodes[1]!.progress).toBe(100)
    expect(doc!.nodes[2]!.progress).toBe(0)
    expect('progress' in (doc!.nodes[3] as object)).toBe(false)
  })

  it('不是对象时返回 null', () => {
    expect(normalizeNodeGraphDoc(null)).toBeNull()
    expect(normalizeNodeGraphDoc('swot')).toBeNull()
  })

  it('isNodeGraphDoc 只认节点画布', () => {
    expect(isNodeGraphDoc({ type: NODE_GRAPH_TYPE, nodes: [] })).toBe(true)
    expect(isNodeGraphDoc({ type: 'swot', nodes: [] })).toBe(false)
  })

  it('指向不存在节点的连线会被丢弃', () => {
    const doc = normalizeNodeGraphDoc({
      id: 'd1',
      type: NODE_GRAPH_TYPE,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [node({ id: 'a' })],
      edges: [{ id: 'e1', source: 'a', target: 'zzz', label: '' }],
    })
    expect(doc!.edges).toHaveLength(0)
  })

  it('连线锚点兼容旧的侧边字符串与新的侧边偏移对象', () => {
    const doc = normalizeNodeGraphDoc({
      id: 'd1',
      type: NODE_GRAPH_TYPE,
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [node({ id: 'a' }), node({ id: 'b' })],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: '', sourceAnchor: 'bottom', targetAnchor: 'top' },
        { id: 'e2', source: 'a', target: 'b', label: '', sourceAnchor: { side: 'right', offset: 0.3 } },
        { id: 'e3', source: 'a', target: 'b', label: '', sourceAnchor: { side: 'diagonal', offset: 9 } },
      ],
    })
    expect(doc!.edges[0]!.sourceAnchor).toBe('bottom')
    expect(doc!.edges[1]!.sourceAnchor).toEqual({ side: 'right', offset: 0.3 })
    expect('sourceAnchor' in (doc!.edges[2] as object)).toBe(false)
  })
})
