/**
 * 节点画布（node-graph）文档类型。
 *
 * 画布内容整体作为 JSON 存进 kb_documents.current_data，
 * 与其它 76 个画布模板一样不单独建表（见 docs/GLOBAL_RULES）。
 */

/** 节点类型。新增类型时改 nodeTypes 注册表，不要在这里加分支。 */
export type NodeGraphNodeType = 'richtext' | 'canvasRef'

export interface GraphNode {
  id: string
  type: NodeGraphNodeType
  /** 画布坐标（世界坐标），单位 px。 */
  x: number
  y: number
  width: number
  height: number
  title: string
  /** 节点描述：属性面板里可编辑，说明这个节点为什么存在。 */
  description?: string
  /** 节点进度（0–100）。没设置过就不显示进度条。 */
  progress?: number
  /** 富文本节点正文（HTML 字符串），与现有 RTE 的存储格式一致。 */
  content?: string
  /** 画布节点指向 92 个画布之一（模板 id）。创建时选定，之后不可更改。 */
  refTemplateId?: string
  /** 画布节点指向本项目里的画布（kb_documents.id）。 */
  refCanvasId?: string
  /** 锁定后不能拖动、改接或编辑，只能解锁后操作。 */
  locked?: boolean
  /** 折叠成标题条，正文/描述不显示。 */
  collapsed?: boolean
  /** 节点主题色覆盖（十六进制），不填就用类型色。 */
  color?: string
  /** 编组 id：同一组的节点一起选中、一起拖动。 */
  groupId?: string
  /** 自由标签，用于筛选与批量改属性。 */
  tags?: string[]
}

export type EdgeLineStyle = 'solid' | 'dashed' | 'ortho'
export type EdgeArrow = 'end' | 'both' | 'none'

/** 连线的样式：线型、箭头、粗细、颜色。 */
export interface GraphEdgeStyle {
  line?: EdgeLineStyle
  arrow?: EdgeArrow
  width?: number
  color?: string
}

export interface GraphEdge {
  id: string
  /** 起点节点 id。 */
  source: string
  /** 终点节点 id。 */
  target: string
  /** 连线从节点的哪一侧出发。 */
  sourceAnchor?: AnchorSide | GraphEdgeAnchor
  /** 连线落到节点的哪一侧。 */
  targetAnchor?: AnchorSide | GraphEdgeAnchor
  label: string
  /** 悬空端点（世界坐标）：有值时这一端不绑节点，可画标注线。 */
  sourcePoint?: { x: number; y: number }
  targetPoint?: { x: number; y: number }
  style?: GraphEdgeStyle
}

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left'

/** 侧边上的任意位置：offset 是沿该侧的新比例（0–1，0.5 即中点）。 */
export interface GraphEdgeAnchor {
  side: AnchorSide
  offset: number
}

export interface NodeGraphViewport {
  /** 画布平移偏移（世界坐标 → 屏幕坐标）。 */
  x: number
  y: number
  /** 缩放比例。 */
  zoom: number
}

/** 画布背景模板：图案 + 颜色 + 间距。 */
export type NodeGraphBackgroundPattern =
  | 'dots'
  | 'grid'
  | 'cross'
  | 'lines'
  | 'diagonal'
  | 'checker'
  | 'blueprint'
  | 'dotgrid'
  | 'dash'
  | 'brick'
  | 'hex'
  | 'tri'
  | 'wave'
  | 'diamond'
  | 'circuit'
  | 'star'
  | 'rings'
  | 'solid'
  | 'none'

export interface NodeGraphBackground {
  pattern: NodeGraphBackgroundPattern
  /** 图案线条/圆点的颜色。 */
  color: string
  /** 底色（solid 与 none 时就是整个背景色）。 */
  background: string
  /** 图案间距（px）。 */
  size: number
}

export const DEFAULT_NODE_GRAPH_BACKGROUND: NodeGraphBackground = {
  pattern: 'dots',
  color: '#dbe3ec',
  background: '#f8fafc',
  size: 24,
}

export interface NodeGraphDocumentJSON {
  id: string
  type: 'node-graph'
  schemaVersion: number
  viewport: NodeGraphViewport
  /** 画布背景模板。 */
  background?: NodeGraphBackground
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** 节点评论（锚定到节点，随画布保存）。 */
  comments?: NodeComment[]
  /** 回收站：软删除的节点，最多保留 50 个。 */
  deleted?: DeletedNode[]
  /** 画布操作记录（最近的节点级动作）。 */
  activity?: ActivityEntry[]
  /** 画布偏好：网格吸附开关与格子大小。 */
  settings?: NodeGraphSettings
}

export interface NodeComment {
  id: string
  nodeId: string
  text: string
  author: string
  createdAt: string
  resolved?: boolean
}

export interface DeletedNode {
  node: GraphNode
  deletedAt: string
}

export interface ActivityEntry {
  id: string
  action: string
  nodeId?: string
  at: string
}

export interface NodeGraphSettings {
  snap?: boolean
  gridSize?: number
}

export const NODE_GRAPH_TYPE = 'node-graph'
export const NODE_GRAPH_TEMPLATE_ID = 'node-graph'

export function isNodeGraphDoc(doc: unknown): doc is NodeGraphDocumentJSON {
  if (!doc || typeof doc !== 'object') return false
  const raw = doc as { type?: unknown; nodes?: unknown }
  return raw.type === NODE_GRAPH_TYPE && Array.isArray(raw.nodes)
}

export const DEFAULT_NODE_WIDTH = 240
export const DEFAULT_NODE_HEIGHT = 96

/** 新建画布时的初始文档：一个空画布。 */
export function emptyNodeGraphDoc(id: string): NodeGraphDocumentJSON {
  return {
    id,
    type: NODE_GRAPH_TYPE,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { ...DEFAULT_NODE_GRAPH_BACKGROUND },
    nodes: [],
    edges: [],
  }
}

/** 背景归一化：手改数据里的非法图案/颜色/间距一律换成默认值。 */
export function normalizeBackground(raw: unknown): NodeGraphBackground {
  const base = { ...DEFAULT_NODE_GRAPH_BACKGROUND }
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<NodeGraphBackground>
  const patterns: NodeGraphBackgroundPattern[] = [
    'dots',
    'grid',
    'cross',
    'lines',
    'diagonal',
    'checker',
    'blueprint',
    'dotgrid',
    'dash',
    'brick',
    'hex',
    'tri',
    'wave',
    'diamond',
    'circuit',
    'star',
    'rings',
    'solid',
    'none',
  ]
  return {
    pattern: patterns.includes(input.pattern as NodeGraphBackgroundPattern)
      ? (input.pattern as NodeGraphBackgroundPattern)
      : base.pattern,
    color: typeof input.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(input.color) ? input.color : base.color,
    background:
      typeof input.background === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(input.background)
        ? input.background
        : base.background,
    size: Number.isFinite(input.size) ? Math.max(8, Math.min(80, Math.round(input.size as number))) : base.size,
  }
}

/**
 * 归一化：旧数据或手改数据可能缺字段，缺什么补什么，绝不丢节点。
 * 归一化失败（不是节点画布）时返回 null，交给调用方按普通文档处理。
 */
export function normalizeNodeGraphDoc(doc: unknown): NodeGraphDocumentJSON | null {
  if (!doc || typeof doc !== 'object') return null
  const raw = doc as Partial<NodeGraphDocumentJSON>
  const nodes: GraphNode[] = Array.isArray(raw.nodes) ? raw.nodes : []
  const nodeIds = new Set<string>()
  const cleanNodes = nodes
    .filter((node): node is GraphNode => !!node && typeof node === 'object' && typeof node.id === 'string')
    .map((node) => {
      const id = node.id
      nodeIds.add(id)
      const type: NodeGraphNodeType = node.type === 'canvasRef' ? 'canvasRef' : 'richtext'
      return {
        id,
        type,
        x: Number.isFinite(node.x) ? node.x : 0,
        y: Number.isFinite(node.y) ? node.y : 0,
        width: Number.isFinite(node.width) ? node.width : DEFAULT_NODE_WIDTH,
        height: Number.isFinite(node.height) ? node.height : DEFAULT_NODE_HEIGHT,
        title: typeof node.title === 'string' ? node.title : '',
        ...(typeof node.description === 'string' ? { description: node.description } : {}),
        // 进度是可选属性：手改数据里的越界值夹到 0–100，非法值直接丢掉。
        ...(Number.isFinite(node.progress)
          ? { progress: Math.max(0, Math.min(100, Math.round(node.progress as number))) }
          : {}),
        ...(type === 'richtext' ? { content: typeof node.content === 'string' ? node.content : '' } : {}),
        ...(type === 'canvasRef'
          ? {
              ...(typeof node.refTemplateId === 'string' ? { refTemplateId: node.refTemplateId } : {}),
              ...(typeof node.refCanvasId === 'string' ? { refCanvasId: node.refCanvasId } : {}),
            }
          : {}),
        ...(node.locked === true ? { locked: true } : {}),
        ...(node.collapsed === true ? { collapsed: true } : {}),
        ...(typeof node.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(node.color) ? { color: node.color } : {}),
        ...(typeof node.groupId === 'string' && node.groupId ? { groupId: node.groupId } : {}),
        ...(Array.isArray(node.tags)
          ? { tags: node.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) }
          : {}),
      }
    })
  // 指向已不存在节点、又没有悬空端点的连线直接丢弃：留着会变成空箭头。
  const edges: GraphEdge[] = Array.isArray(raw.edges)
    ? raw.edges
        .filter(
          (edge): edge is GraphEdge =>
            !!edge &&
            typeof edge === 'object' &&
            typeof edge.id === 'string' &&
            (nodeIds.has((edge as GraphEdge).source) || isPoint((edge as GraphEdge).sourcePoint)) &&
            (nodeIds.has((edge as GraphEdge).target) || isPoint((edge as GraphEdge).targetPoint)),
        )
        .map((edge) => {
          const sourceAnchor = normalizeEdgeAnchor(edge.sourceAnchor)
          const targetAnchor = normalizeEdgeAnchor(edge.targetAnchor)
          return {
            id: edge.id,
            source: nodeIds.has(edge.source) ? edge.source : '',
            target: nodeIds.has(edge.target) ? edge.target : '',
            ...(sourceAnchor ? { sourceAnchor } : {}),
            ...(targetAnchor ? { targetAnchor } : {}),
            label: typeof edge.label === 'string' ? edge.label : '',
            ...(isPoint(edge.sourcePoint) ? { sourcePoint: { x: edge.sourcePoint.x, y: edge.sourcePoint.y } } : {}),
            ...(isPoint(edge.targetPoint) ? { targetPoint: { x: edge.targetPoint.x, y: edge.targetPoint.y } } : {}),
            ...(edge.style && typeof edge.style === 'object' ? { style: normalizeEdgeStyle(edge.style) } : {}),
          }
        })
    : []
  const viewport = raw.viewport || { x: 0, y: 0, zoom: 1 }
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    type: NODE_GRAPH_TYPE,
    schemaVersion: Number.isFinite(raw.schemaVersion) ? (raw.schemaVersion as number) : 1,
    background: normalizeBackground(raw.background),
    viewport: {
      x: Number.isFinite(viewport.x) ? viewport.x : 0,
      y: Number.isFinite(viewport.y) ? viewport.y : 0,
      zoom: Number.isFinite(viewport.zoom) ? viewport.zoom : 1,
    },
    nodes: cleanNodes,
    edges,
    comments: Array.isArray(raw.comments)
      ? raw.comments
          .filter(
            (item): item is NodeComment =>
              !!item && typeof item.id === 'string' && typeof item.text === 'string' && nodeIds.has(item.nodeId),
          )
          .slice(0, 200)
      : [],
    deleted: Array.isArray(raw.deleted)
      ? raw.deleted
          .filter((item): item is DeletedNode => !!item && !!item.node && typeof item.node.id === 'string')
          .slice(0, 50)
      : [],
    activity: Array.isArray(raw.activity)
      ? raw.activity
          .filter((item): item is ActivityEntry => !!item && typeof item.id === 'string' && typeof item.action === 'string')
          .slice(-200)
      : [],
    settings: {
      snap: raw.settings?.snap === true,
      gridSize: Number.isFinite(raw.settings?.gridSize)
        ? Math.max(4, Math.min(64, Math.round(raw.settings!.gridSize as number)))
        : 8,
    },
  }
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as { x?: unknown; y?: unknown }
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function normalizeEdgeStyle(style: GraphEdgeStyle): GraphEdgeStyle {
  return {
    line: style.line === 'dashed' || style.line === 'ortho' ? style.line : 'solid',
    arrow: style.arrow === 'both' || style.arrow === 'none' ? style.arrow : 'end',
    width: Number.isFinite(style.width) ? Math.max(1, Math.min(8, style.width as number)) : 1.6,
    ...(typeof style.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(style.color) ? { color: style.color } : {}),
  }
}

export function isAnchorSide(value: unknown): value is AnchorSide {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
}

/** 旧数据只有侧边字符串，新数据是 `{ side, offset }`，两种都认。 */
export function normalizeEdgeAnchor(value: unknown): AnchorSide | GraphEdgeAnchor | undefined {
  if (isAnchorSide(value)) return value
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<GraphEdgeAnchor>
  if (!isAnchorSide(raw.side) || !Number.isFinite(raw.offset)) return undefined
  return { side: raw.side, offset: Math.max(0, Math.min(1, raw.offset as number)) }
}
