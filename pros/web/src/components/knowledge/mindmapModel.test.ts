// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  addChild,
  buildTree,
  fromFreeMind,
  fromMarkdown,
  fromOPML,
  indentNode,
  migrateMindmap,
  moveSibling,
  outdentNode,
  removeNode,
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

  it('增删子节点与同级', () => {
    const doc = sample()
    const root = doc.nodes[0].id
    const child = addChild(doc, root, '丙')
    expect(child).toBeTruthy()
    expect(doc.nodes).toHaveLength(5)
    removeNode(doc, child!)
    expect(doc.nodes).toHaveLength(4)
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
})
