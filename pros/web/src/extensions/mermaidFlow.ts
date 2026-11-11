/** 简单流程图：横向、纵向和判断分支。复杂源码解析失败时仍走源码编辑。 */

export type FlowShape = 'rect' | 'round' | 'diamond'
export type FlowDir = 'LR' | 'TD'
export type FlowNode = { id: string; text: string; shape: FlowShape }
export type FlowEdge = { from: string; to: string; label: string }
export type FlowModel = { dir: FlowDir; nodes: FlowNode[]; edges: FlowEdge[] }

const NODE = String.raw`([A-Za-z][\w-]*)(?:\[([^\]\n]*)\]|\(([^)\n]*)\)|\{([^}\n]*)\})?`
const EDGE = new RegExp(`^${NODE}\\s*-->\\s*(?:\\|([^|\\n]*)\\|\\s*)?${NODE}\\s*$`)
const ONLY = new RegExp(`^${NODE}\\s*$`)

export const MERMAID_FLOW_LR = `flowchart LR
  A[开始] --> B[处理]
  B --> C[结束]`

export const MERMAID_FLOW_TD = `flowchart TD
  A[开始] --> B[处理]
  B --> C[结束]`

export const MERMAID_FLOW_DECISION = `flowchart TD
  A[开始] --> B{是否继续}
  B -->|是| C[完成]
  B -->|否| D[返回]`

export const MERMAID_TEMPLATES = [
  { id: 'flow-lr', label: '横向流程', code: MERMAID_FLOW_LR },
  { id: 'flow-td', label: '纵向流程', code: MERMAID_FLOW_TD },
  { id: 'flow-decision', label: '判断分支', code: MERMAID_FLOW_DECISION },
] as const

export function mermaidTemplate(id?: string): string {
  return MERMAID_TEMPLATES.find((item) => item.id === id)?.code || MERMAID_FLOW_LR
}

function shapeOf(bracket?: string, paren?: string, brace?: string): { text?: string; shape?: FlowShape } {
  if (bracket != null) return { text: bracket, shape: 'rect' }
  if (paren != null) return { text: paren, shape: 'round' }
  if (brace != null) return { text: brace, shape: 'diamond' }
  return {}
}

function remember(
  nodes: Map<string, FlowNode>,
  order: string[],
  id: string,
  text: string | undefined,
  shape: FlowShape | undefined,
) {
  const existing = nodes.get(id)
  if (!existing) {
    nodes.set(id, { id, text: text ?? id, shape: shape ?? 'rect' })
    order.push(id)
    return
  }
  if (text != null && shape) {
    existing.text = text
    existing.shape = shape
  }
}

export function parseFlow(code: string): FlowModel | null {
  const lines = code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'))
  if (!lines.length) return null
  const head = lines[0].match(/^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)\s*$/i)
  if (!head) return null
  const raw = head[1].toUpperCase()
  const dir: FlowDir = raw === 'TD' || raw === 'TB' || raw === 'BT' ? 'TD' : 'LR'
  const nodes = new Map<string, FlowNode>()
  const order: string[] = []
  const edges: FlowEdge[] = []
  const body = lines.slice(1)
  if (!body.length) return null
  for (const line of body) {
    const edge = line.match(EDGE)
    if (edge) {
      const from = shapeOf(edge[2], edge[3], edge[4])
      const to = shapeOf(edge[7], edge[8], edge[9])
      remember(nodes, order, edge[1], from.text, from.shape)
      remember(nodes, order, edge[6], to.text, to.shape)
      edges.push({ from: edge[1], to: edge[6], label: (edge[5] || '').trim() })
      continue
    }
    const alone = body.length === 1 ? line.match(ONLY) : null
    if (!alone) return null
    const one = shapeOf(alone[2], alone[3], alone[4])
    remember(nodes, order, alone[1], one.text, one.shape)
  }
  if (!order.length) return null
  return { dir, nodes: order.map((id) => nodes.get(id)!), edges }
}

function token(node: FlowNode): string {
  const text = node.text.replace(/[[\](){}|]/g, '').trim() || ' '
  if (node.shape === 'round') return `${node.id}(${text})`
  if (node.shape === 'diamond') return `${node.id}{${text}}`
  return `${node.id}[${text}]`
}

export function serializeFlow(model: FlowModel): string {
  const byId = new Map(model.nodes.map((node) => [node.id, node]))
  const lines = [`flowchart ${model.dir}`]
  if (!model.edges.length && model.nodes[0]) {
    lines.push(`  ${token(model.nodes[0])}`)
    return lines.join('\n')
  }
  for (const edge of model.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) continue
    const label = edge.label.replace(/\|/g, '').trim()
    lines.push(`  ${token(from)} -->${label ? `|${label}| ` : ' '}${token(to)}`)
  }
  return lines.join('\n')
}

export function isFlowChain(model: FlowModel): boolean {
  if (!model.nodes.length) return false
  if (model.edges.length !== Math.max(0, model.nodes.length - 1)) return false
  return model.edges.every((edge, index) => edge.from === model.nodes[index]?.id && edge.to === model.nodes[index + 1]?.id)
}

function nextId(nodes: FlowNode[]): string {
  const used = new Set(nodes.map((node) => node.id))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const letter of letters) if (!used.has(letter)) return letter
  for (let n = 1; n < 40; n += 1) {
    for (const letter of letters) {
      const id = `${letter}${n}`
      if (!used.has(id)) return id
    }
  }
  return `N${nodes.length + 1}`
}

export function addFlowStep(model: FlowModel): FlowModel {
  const id = nextId(model.nodes)
  const node: FlowNode = { id, text: '新步骤', shape: 'rect' }
  const last = model.nodes[model.nodes.length - 1]
  return {
    ...model,
    nodes: [...model.nodes, node],
    edges: last ? [...model.edges, { from: last.id, to: id, label: '' }] : model.edges,
  }
}

export function removeFlowNode(model: FlowModel, id: string): FlowModel {
  if (model.nodes.length <= 1) return model
  const chain = isFlowChain(model)
  const nodes = model.nodes.filter((node) => node.id !== id)
  if (chain) {
    const edges: FlowEdge[] = []
    for (let i = 0; i < nodes.length - 1; i += 1) edges.push({ from: nodes[i].id, to: nodes[i + 1].id, label: '' })
    return { ...model, nodes, edges }
  }
  return { ...model, nodes, edges: model.edges.filter((edge) => edge.from !== id && edge.to !== id) }
}

export function setFlowText(model: FlowModel, id: string, text: string): FlowModel {
  return { ...model, nodes: model.nodes.map((node) => (node.id === id ? { ...node, text } : node)) }
}

export function cycleFlowShape(model: FlowModel, id: string): FlowModel {
  const order: FlowShape[] = ['rect', 'round', 'diamond']
  return {
    ...model,
    nodes: model.nodes.map((node) => {
      if (node.id !== id) return node
      const next = order[(order.indexOf(node.shape) + 1) % order.length]
      return { ...node, shape: next }
    }),
  }
}

export function setFlowDir(model: FlowModel, dir: FlowDir): FlowModel {
  return { ...model, dir }
}

export function setFlowEdgeLabel(model: FlowModel, index: number, label: string): FlowModel {
  return {
    ...model,
    edges: model.edges.map((edge, i) => (i === index ? { ...edge, label } : edge)),
  }
}
