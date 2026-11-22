/**
 * 思维导图数据模型（KityMinder 式）。
 *
 * 存成节点图结构：nodes=导图节点，edges=父子关系，直接复用 nodeGraph 的类型与自动布局。
 * 老数据（{ title, children }）读取时迁移。
 */
import JSZip from 'jszip'
import type { GraphEdge, GraphNode } from '../../types/nodeGraph'
import { computeLayout, type LayoutMode } from '../../components/canvas/nodeGraph/layout'

export const MINDMAP_NODE_WIDTH = 170
export const MINDMAP_NODE_HEIGHT = 44

/** 节点优先级：0 无 / 1 低 / 2 中 / 3 高。 */
export type MindmapPriority = 0 | 1 | 2 | 3

/** 优先级标记符号，与百度脑图一致（低 ※ / 中 ！ / 高 ★）。 */
export const PRIORITY_MARKS: Record<MindmapPriority, string> = {
  0: '',
  1: '※',
  2: '！',
  3: '★',
}

export const PRIORITY_LABELS: Record<MindmapPriority, string> = {
  0: '无优先级',
  1: '低优先级',
  2: '中优先级',
  3: '高优先级',
}

export type MindmapNode = GraphNode & {
  priority?: MindmapPriority
  /** 节点备注，画布与演示模式里展示。 */
  note?: string
}

export type MindmapDoc = {
  title: string
  nodes: MindmapNode[]
  edges: GraphEdge[]
}

export type MindmapTreeNode = {
  node: MindmapNode
  depth: number
  children: MindmapTreeNode[]
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

export function createNode(title: string): MindmapNode {
  return {
    id: uid('mn'),
    type: 'richtext',
    x: 0,
    y: 0,
    width: MINDMAP_NODE_WIDTH,
    height: MINDMAP_NODE_HEIGHT,
    title,
  }
}

export function createEdge(source: string, target: string): GraphEdge {
  return { id: uid('e'), source, target, label: '' }
}

export function emptyMindmap(title = '中心主题'): MindmapDoc {
  const root = createNode(title)
  return { title, nodes: [root], edges: [] }
}

/** 兼容旧版 { title, children: [{ title, children }] } 结构。 */
export function migrateMindmap(raw: unknown): MindmapDoc {
  const data = raw as Partial<MindmapDoc> & {
    children?: Array<{ title?: string; children?: unknown[] }>
  }
  if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
    const nodes = data.nodes.map((n) => ({ ...createNode(n.title ?? ''), ...n }))
    const ids = new Set(nodes.map((node) => node.id))
    // 旧数据可能有删除残留的孤儿边；读取时丢掉，避免环和幽灵子节点。
    const edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    return { title: data.title ?? nodes[0]?.title ?? '中心主题', nodes, edges }
  }
  const legacyTitle = typeof data?.title === 'string' ? data.title : '中心主题'
  const doc: MindmapDoc = { title: legacyTitle, nodes: [], edges: [] }
  const root = createNode(legacyTitle)
  doc.nodes.push(root)
  const walk = (list: Array<{ title?: string; children?: unknown[] }>, parentId: string) => {
    for (const item of list) {
      const node = createNode(item.title ?? '新分支')
      doc.nodes.push(node)
      doc.edges.push(createEdge(parentId, node.id))
      if (Array.isArray(item.children)) {
        walk(item.children as Array<{ title?: string; children?: unknown[] }>, node.id)
      }
    }
  }
  if (Array.isArray(data?.children)) walk(data.children, root.id)
  return doc
}

/** 父节点 id → 子节点 id（按连线顺序，即兄弟顺序）。 */
export function childrenMap(doc: MindmapDoc): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const edge of doc.edges) {
    const list = map.get(edge.source) ?? []
    list.push(edge.target)
    map.set(edge.source, list)
  }
  return map
}

/** 子节点 id → 父节点 id。 */
export function parentMap(doc: MindmapDoc): Map<string, string> {
  const map = new Map<string, string>()
  for (const edge of doc.edges) map.set(edge.target, edge.source)
  return map
}

export function buildTree(doc: MindmapDoc): MindmapTreeNode[] {
  const kids = childrenMap(doc)
  const parents = parentMap(doc)
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const walk = (id: string, depth: number): MindmapTreeNode | null => {
    const node = byId.get(id)
    if (!node) return null
    const children = (kids.get(id) ?? [])
      .map((childId) => walk(childId, depth + 1))
      .filter((x): x is MindmapTreeNode => !!x)
    return { node, depth, children }
  }
  const roots = doc.nodes.filter((n) => !parents.has(n.id)).map((n) => walk(n.id, 0))
  return roots.filter((x): x is MindmapTreeNode => !!x)
}

/** 展平成大纲行（受折叠影响）。 */
export function outlineRows(doc: MindmapDoc): MindmapTreeNode[] {
  const out: MindmapTreeNode[] = []
  const walk = (item: MindmapTreeNode) => {
    out.push(item)
    if (item.node.collapsed) return
    item.children.forEach(walk)
  }
  buildTree(doc).forEach(walk)
  return out
}

export function addChild(doc: MindmapDoc, parentId: string, title = '新分支'): string | null {
  const parent = doc.nodes.find((n) => n.id === parentId)
  if (!parent) return null
  const node = createNode(title)
  doc.nodes.push(node)
  doc.edges.push(createEdge(parentId, node.id))
  return node.id
}

export function addSibling(doc: MindmapDoc, nodeId: string, title = '新分支'): string | null {
  const parent = parentMap(doc).get(nodeId)
  if (!parent) {
    // 根节点没有兄弟：当作根的子节点。
    return addChild(doc, nodeId, title)
  }
  return addChild(doc, parent, title)
}

export function removeNode(doc: MindmapDoc, id: string): void {
  const drop = new Set(subtreeIds(doc, id))
  doc.nodes = doc.nodes.filter((node) => !drop.has(node.id))
  doc.edges = doc.edges.filter((edge) => !drop.has(edge.source) && !drop.has(edge.target))
}

/** 升级：变成前一个兄弟的最后��孩子。 */
export function indentNode(doc: MindmapDoc, id: string): boolean {
  const parents = parentMap(doc)
  const parentId = parents.get(id)
  if (!parentId) return false
  const siblings = doc.edges.filter((e) => e.source === parentId).map((e) => e.target)
  const index = siblings.indexOf(id)
  if (index <= 0) return false
  const prev = siblings[index - 1]
  doc.edges = doc.edges.filter((e) => e.target !== id)
  doc.edges.push(createEdge(prev, id))
  return true
}

/** 降级：变成父节点的下一个兄弟。 */
export function outdentNode(doc: MindmapDoc, id: string): boolean {
  const parents = parentMap(doc)
  const parentId = parents.get(id)
  if (!parentId) return false
  const grandId = parents.get(parentId)
  if (!grandId) return false
  const uncles = doc.edges.filter((e) => e.source === grandId).map((e) => e.target)
  const index = uncles.indexOf(parentId)
  if (index < 0) return false
  doc.edges = doc.edges.filter((e) => e.target !== id)
  doc.edges.push(createEdge(grandId, id))
  return true
}

/** 同级内上移 / 下移。 */
export function moveSibling(doc: MindmapDoc, id: string, dir: -1 | 1): boolean {
  const parents = parentMap(doc)
  const parentId = parents.get(id)
  if (!parentId) return false
  const siblings = doc.edges.filter((e) => e.source === parentId)
  const index = siblings.findIndex((e) => e.target === id)
  const target = index + dir
  if (index < 0 || target < 0 || target >= siblings.length) return false
  const [edge] = siblings.splice(index, 1)
  siblings.splice(target, 0, edge)
  const rest = doc.edges.filter((e) => e.source !== parentId)
  doc.edges = [...rest, ...siblings]
  return true
}

export function renameNode(doc: MindmapDoc, id: string, title: string): void {
  const node = doc.nodes.find((n) => n.id === id)
  if (node) node.title = title
}

/** 用 nodeGraph 的自动布局重排坐标。 */
export function applyLayout(doc: MindmapDoc, mode: LayoutMode): MindmapDoc {
  const positions = computeLayout(doc.nodes, doc.edges, mode)
  for (const node of doc.nodes) {
    const pos = positions[node.id]
    if (pos) {
      node.x = pos.x
      node.y = pos.y
    }
  }
  return doc
}

/** 折叠：节点下的子树在图上与大纲里都隐藏。 */
export function setCollapsed(doc: MindmapDoc, id: string, collapsed: boolean): void {
  const node = doc.nodes.find((n) => n.id === id)
  if (node) node.collapsed = collapsed
}

// ---------------- 优先级 / 备注 / 编号 / 演示 ----------------

/** 设置节点优先级（0–3，超范围按 0 处理）。 */
export function setPriority(doc: MindmapDoc, id: string, level: number): MindmapPriority {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) return 0
  const value = (level < 0 ? 0 : level > 3 ? 3 : Math.round(level)) as MindmapPriority
  // 0 表示没有优先级，不落字段，避免旧数据里堆积空标记。
  if (value === 0) delete node.priority
  else node.priority = value
  return value
}

/** 循环切换优先级：无 → 低 → 中 → 高 → 无。 */
export function cyclePriority(doc: MindmapDoc, id: string): MindmapPriority {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) return 0
  return setPriority(doc, id, ((node.priority ?? 0) + 1) % 4)
}

/** 写节点备注（空串表示清除）。 */
export function setNote(doc: MindmapDoc, id: string, note: string): void {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) return
  const clean = note.trim()
  if (clean) node.note = clean
  else delete node.note
}

/**
 * 兄弟序号编号（1 / 1.2 / 1.2.3）。
 * 根节点不编号，只有子节点按所在层级递增。
 */
export function nodeNumbers(doc: MindmapDoc): Map<string, string> {
  const kids = childrenMap(doc)
  const out = new Map<string, string>()
  const roots = doc.nodes.filter((n) => !parentMap(doc).has(n.id))
  const walk = (id: string, prefix: string) => {
    const children = kids.get(id) ?? []
    children.forEach((childId, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      out.set(childId, number)
      walk(childId, number)
    })
  }
  roots.forEach((root) => walk(root.id, ''))
  return out
}

/** 演示模式的节点顺序：先序遍历（父节点在子节点前）。 */
export function presentationOrder(doc: MindmapDoc): string[] {
  const out: string[] = []
  const walk = (id: string) => {
    out.push(id)
    for (const child of childrenMap(doc).get(id) ?? []) walk(child)
  }
  const parents = parentMap(doc)
  doc.nodes.filter((n) => !parents.has(n.id)).forEach((root) => walk(root.id))
  return out
}

/** 演示模式的相邻节点：dir 取 next / prev / parent / firstChild。 */
export function presentationStep(
  doc: MindmapDoc,
  currentId: string,
  dir: 'next' | 'prev' | 'parent' | 'firstChild',
): string | null {
  const kids = childrenMap(doc)
  const parents = parentMap(doc)
  if (dir === 'parent') return parents.get(currentId) ?? null
  if (dir === 'firstChild') return kids.get(currentId)?.[0] ?? null
  const order = presentationOrder(doc)
  const index = order.indexOf(currentId)
  if (index < 0) return null
  const target = dir === 'next' ? index + 1 : index - 1
  return order[target] ?? null
}

export function isAncestor(doc: MindmapDoc, ancestorId: string, nodeId: string): boolean {
  const parents = parentMap(doc)
  let current = parents.get(nodeId)
  while (current) {
    if (current === ancestorId) return true
    current = parents.get(current)
  }
  return false
}

/** 折叠节点的子树 id（含自身）。 */
export function subtreeIds(doc: MindmapDoc, id: string): string[] {
  const kids = childrenMap(doc)
  const out: string[] = []
  const walk = (nodeId: string) => {
    out.push(nodeId)
    for (const child of kids.get(nodeId) ?? []) walk(child)
  }
  walk(id)
  return out
}

// ---------------- 导出 / 导入 ----------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function toMarkdown(doc: MindmapDoc): string {
  const lines: string[] = [`# ${doc.title}`]
  const walk = (item: MindmapTreeNode) => {
    item.children.forEach((child) => {
      lines.push(`${'  '.repeat(child.depth)}- ${child.node.title}`)
      walk(child)
    })
  }
  buildTree(doc).forEach(walk)
  return lines.join('\n')
}

export function fromMarkdown(text: string, title?: string): MindmapDoc {
  type Item = { indent: number; text: string; heading: boolean }
  const items: Item[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indent = (raw.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '    ').length
    const line = raw.trim()
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const bullet = line.match(/^[-*+]\s+(.*)$/)
    const label = heading ? heading[1] : bullet ? bullet[1] : line
    items.push({ indent, text: label.trim(), heading: !!heading })
  }
  const doc: MindmapDoc = { title: title || '中心主题', nodes: [], edges: [] }
  if (!items.length) {
    doc.nodes.push(createNode(doc.title))
    return doc
  }
  // 第一行是标题时它就是根；否则用传入标题做根，所有条目挂��去。
  const rootIsHeading = items[0].heading
  const root = createNode(rootIsHeading ? items[0].text : title || items[0].text)
  doc.title = root.title
  doc.nodes.push(root)
  const stack: Array<{ indent: number; id: string }> = []
  items.forEach((item, index) => {
    if (index === 0 && rootIsHeading) return
    const node = createNode(item.text)
    doc.nodes.push(node)
    while (stack.length && stack[stack.length - 1].indent >= item.indent) stack.pop()
    const parentId = stack.length ? stack[stack.length - 1].id : root.id
    doc.edges.push(createEdge(parentId, node.id))
    stack.push({ indent: item.indent, id: node.id })
  })
  return doc
}

export function toFreeMind(doc: MindmapDoc): string {
  const build = (item: MindmapTreeNode): string => {
    const children = item.children
      .map(
        (child) =>
          `<node TEXT="${escapeXml(child.node.title)}">${child.children.length ? build(child) : ''}</node>`,
      )
      .join('')
    return children
  }
  const root = buildTree(doc)[0]
  const body = root ? `<node TEXT="${escapeXml(root.node.title)}">${build(root)}</node>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?><map version="1.0.1">${body}</map>`
}

export function fromFreeMind(xml: string): MindmapDoc {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  const rootNode = parsed.querySelector('map > node')
  const doc: MindmapDoc = { title: '中心主题', nodes: [], edges: [] }
  if (!rootNode) {
    doc.nodes.push(createNode(doc.title))
    return doc
  }
  const read = (el: Element): string => {
    const text = el.getAttribute('TEXT') ?? el.textContent ?? ''
    const node = createNode(text.trim())
    doc.nodes.push(node)
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== 'node') continue
      const childId = read(child)
      doc.edges.push(createEdge(node.id, childId))
    }
    return node.id
  }
  doc.title = rootNode.getAttribute('TEXT')?.trim() || '中心主题'
  read(rootNode)
  return doc
}

export function toOPML(doc: MindmapDoc): string {
  const build = (item: MindmapTreeNode): string => {
    const children = item.children
      .map((child) => `<outline text="${escapeXml(child.node.title)}">${build(child)}</outline>`)
      .join('')
    return children
  }
  const root = buildTree(doc)[0]
  const body = root ? `<outline text="${escapeXml(root.node.title)}">${build(root)}</outline>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>${escapeXml(doc.title)}</title></head><body>${body}</body></opml>`
}

export function fromOPML(xml: string): MindmapDoc {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  const doc: MindmapDoc = { title: '中心主题', nodes: [], edges: [] }
  const body = parsed.querySelector('opml > body')
  const rootEl = body?.querySelector(':scope > outline')
  if (!body || !rootEl) {
    doc.nodes.push(createNode(doc.title))
    return doc
  }
  const read = (el: Element): string => {
    const node = createNode(el.getAttribute('text') ?? '')
    doc.nodes.push(node)
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== 'outline') continue
      const childId = read(child)
      doc.edges.push(createEdge(node.id, childId))
    }
    return node.id
  }
  doc.title = rootEl.getAttribute('text') ?? '中心主题'
  read(rootEl)
  return doc
}

/** XMind（Zen 格式 content.json）。 */
function xmindTopic(item: MindmapTreeNode, counter: { value: number }): unknown {
  counter.value += 1
  const topic: Record<string, unknown> = {
    id: `t${counter.value}`,
    title: item.node.title,
  }
  if (item.children.length) {
    topic.children = { attached: item.children.map((child) => xmindTopic(child, counter)) }
  }
  return topic
}

export function toXMindContent(doc: MindmapDoc): unknown {
  const counter = { value: 0 }
  const root = buildTree(doc)[0]
  const rootTopic = root
    ? xmindTopic(root, counter)
    : { id: 't0', title: doc.title }
  return [
    {
      id: 'sheet0',
      class: 'sheet',
      title: doc.title,
      rootTopic,
      topicPositioning: 'fixed',
      theme: { id: 'theme0' },
    },
  ]
}

/** 打包成 .xmind（zip：content.json + metadata.json + manifest.json）。 */
export async function toXMind(doc: MindmapDoc): Promise<Blob> {
  const zip = new JSZip()
  zip.file('content.json', JSON.stringify(toXMindContent(doc)))
  zip.file('metadata.json', JSON.stringify({ creator: { name: 'MetaMatrix' }, created: Date.now() }))
  zip.file('manifest.json', JSON.stringify({ fileEntries: [{ 'content.json': {} }, { 'metadata.json': {} }] }))
  return zip.generateAsync({ type: 'blob' })
}

/** 解析 .xmind：优先 content.json（Zen），回退 content.xml（XMind 8）。 */
export async function fromXMind(file: File): Promise<MindmapDoc> {
  const zip = await JSZip.loadAsync(file)
  const contentJson = zip.file('content.json')
  if (contentJson) {
    const data = JSON.parse(await contentJson.async('string')) as unknown[]
    const sheet = Array.isArray(data) ? data[0] : data
    const rootTopic = (sheet as { rootTopic?: unknown })?.rootTopic
    if (rootTopic) {
      const doc: MindmapDoc = { title: (sheet as { title?: string })?.title ?? '中心主题', nodes: [], edges: [] }
      const read = (topic: Record<string, unknown>): string => {
        const node = createNode(String(topic.title ?? ''))
        doc.nodes.push(node)
        const attached = (topic.children as { attached?: unknown[] })?.attached ?? []
        for (const child of attached) {
          const childId = read(child as Record<string, unknown>)
          doc.edges.push(createEdge(node.id, childId))
        }
        return node.id
      }
      read(rootTopic as Record<string, unknown>)
      return doc
    }
  }
  const contentXml = zip.file('content.xml')
  if (contentXml) return fromFreeMind(await contentXml.async('string'))
  throw new Error('无法识别的 xmind 文件')
}

/** 导出文件名。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 从文档 HTML 标题层级生成脑图（文档 → 一键脑图）。 */
export function mindmapFromHeadings(docTitle: string, html: string): MindmapDoc {
  const doc = emptyMindmap(docTitle)
  const rootId = doc.nodes[0].id
  const parsed = new DOMParser().parseFromString(html || '', 'text/html')
  const heads = Array.from(parsed.querySelectorAll('h1,h2,h3,h4'))
  let current = rootId
  const levels: number[] = []
  for (const head of heads) {
    const text = (head.textContent ?? '').trim()
    if (!text) continue
    const level = Number(head.tagName.slice(1))
    const node = createNode(text)
    doc.nodes.push(node)
    while (levels.length && levels[levels.length - 1] >= level) levels.pop()
    const parentId = levels.length ? current : rootId
    doc.edges.push(createEdge(parentId, node.id))
    current = node.id
    levels.push(level)
  }
  if (doc.nodes.length === 1) {
    // 没有标题层级：把正文首段当作一级分支。
    const paragraphs = Array.from(parsed.querySelectorAll('p'))
      .map((p) => (p.textContent ?? '').trim())
      .filter((t) => t && t.length <= 60)
      .slice(0, 8)
    for (const text of paragraphs) {
      const node = createNode(text)
      doc.nodes.push(node)
      doc.edges.push(createEdge(rootId, node.id))
    }
  }
  return doc
}
