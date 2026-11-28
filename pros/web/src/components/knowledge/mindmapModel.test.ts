// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  addChild,
  buildTree,
  cyclePriority,
  fromFreeMind,
  fromMarkdown,
  fromOPML,
  indentNode,
  migrateMindmap,
  moveSibling,
  nodeNumbers,
  outdentNode,
  presentationOrder,
  presentationStep,
  removeNode,
  setNote,
  setPriority,
  toFreeMind,
  toMarkdown,
  toOPML,
  toXMindContent,
  type MindmapDoc,
} from './mindmapModel'

const sample = (): MindmapDoc => {
  const doc = migrateMindmap({
    title: '项目',
    children: [{ title: '甲' }, { title: '乙', children: [{ title: '乙一' }] }],
  })
  return doc
}

describe('思维导图模型', () => {
  it('旧数据迁移成节点图', () => {
    const doc = sample()
    expect(doc.nodes).toHaveLength(4)
    expect(doc.edges).toHaveLength(3)
    expect(buildTree(doc)[0].children).toHaveLength(2)
  })

  it('迁移时丢弃指向不存在节点的孤儿边', () => {
    const doc = migrateMindmap({
      title: '项目',
      nodes: [{ id: 'a', title: '甲', type: 'richtext', x: 0, y: 0, width: 170, height: 44 }],
      edges: [{ id: 'e', source: 'a', target: 'ghost', label: '' }],
    })
    expect(doc.nodes).toHaveLength(1)
    expect(doc.edges).toHaveLength(0)
  })

  it('增删子节点与同级', () => {
    const doc = sample()
    const root = doc.nodes[0].id
    const child = addChild(doc, root, '丙')
    expect(child).toBeTruthy()
    expect(doc.nodes).toHaveLength(5)
    removeNode(doc, child!)
    expect(doc.nodes).toHaveLength(4)
  })

  it('删除子树后不留下孤儿边', () => {
    const doc = sample()
    const second = buildTree(doc)[0].children[1].node.id
    const child = addChild(doc, second, '丙')!
    addChild(doc, child, '丁')
    removeNode(doc, second)
    const ids = new Set(doc.nodes.map((node) => node.id))
    expect(doc.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true)
  })

  it('升级降级与同级换序', () => {
    const doc = sample()
    const tree = buildTree(doc)[0]
    const first = tree.children[0].node.id
    const second = tree.children[1].node.id
    expect(indentNode(doc, second)).toBe(true)
    expect(doc.edges.find((e) => e.target === second)?.source).toBe(first)
    expect(outdentNode(doc, second)).toBe(true)
    expect(doc.edges.find((e) => e.target === second)?.source).toBe(doc.nodes[0].id)
    expect(moveSibling(doc, second, -1)).toBe(true)
    const order = doc.edges.filter((e) => e.source === doc.nodes[0].id).map((e) => e.target)
    expect(order[0]).toBe(second)
  })

  it('Markdown 大纲往返', () => {
    const doc = sample()
    const md = toMarkdown(doc)
    expect(md).toContain('# 项目')
    const back = fromMarkdown(md)
    expect(back.nodes.length).toBe(doc.nodes.length)
    expect(back.edges.length).toBe(doc.edges.length)
  })

  it('FreeMind 与 OPML 往返', () => {
    const doc = sample()
    expect(fromFreeMind(toFreeMind(doc)).nodes.length).toBe(doc.nodes.length)
    expect(fromOPML(toOPML(doc)).nodes.length).toBe(doc.nodes.length)
  })

  it('XMind content.json 结构', () => {
    const content = toXMindContent(sample()) as Array<{ rootTopic: { title: string; children?: { attached: unknown[] } } }>
    expect(content[0].rootTopic.title).toBe('项目')
    expect(content[0].rootTopic.children?.attached.length).toBe(2)
  })

  it('优先级设置与循环', () => {
    const doc = sample()
    const id = doc.nodes[1].id
    expect(setPriority(doc, id, 3)).toBe(3)
    expect(doc.nodes[1].priority).toBe(3)
    expect(cyclePriority(doc, id)).toBe(0)
    expect(cyclePriority(doc, id)).toBe(1)
    expect(setPriority(doc, id, 99)).toBe(3)
    expect(setPriority(doc, id, -5)).toBe(0)
  })

  it('备注写入与清除', () => {
    const doc = sample()
    const id = doc.nodes[1].id
    setNote(doc, id, '  要点  ')
    expect(doc.nodes[1].note).toBe('要点')
    setNote(doc, id, '   ')
    expect(doc.nodes[1].note).toBeUndefined()
  })

  it('兄弟编号按层级递增', () => {
    const doc = sample()
    const tree = buildTree(doc)[0]
    const numbers = nodeNumbers(doc)
    expect(numbers.get(tree.children[0].node.id)).toBe('1')
    expect(numbers.get(tree.children[1].node.id)).toBe('2')
    expect(numbers.get(tree.children[1].children[0].node.id)).toBe('2.1')
    expect(numbers.has(tree.node.id)).toBe(false)
  })

  it('编号跟随同级换序更新', () => {
    const doc = sample()
    const tree = buildTree(doc)[0]
    const first = tree.children[0].node.id
    const second = tree.children[1].node.id
    moveSibling(doc, second, -1)
    const numbers = nodeNumbers(doc)
    expect(numbers.get(second)).toBe('1')
    expect(numbers.get(first)).toBe('2')
  })

  it('演示模式按先序遍历并能前后翻页', () => {
    const doc = sample()
    const order = presentationOrder(doc)
    expect(order).toHaveLength(4)
    expect(order[0]).toBe(doc.nodes[0].id)
    expect(presentationStep(doc, order[0], 'next')).toBe(order[1])
    expect(presentationStep(doc, order[1], 'prev')).toBe(order[0])
    expect(presentationStep(doc, order[1], 'parent')).toBe(doc.nodes[0].id)
    expect(presentationStep(doc, doc.nodes[0].id, 'firstChild')).toBe(order[1])
    expect(presentationStep(doc, order[order.length - 1], 'next')).toBeNull()
  })
})
