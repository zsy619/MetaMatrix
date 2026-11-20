/**
 * 一键自动布局。
 *
 * 纯计算：输入节点与连线，输出每个节点的新坐标，不动 store。
 * 全部模式见 LAYOUT_LABELS，菜单分组见 LAYOUT_GROUPS；每种都保证节点互不重叠、左上角留在原内容的左上角
 * （layout.test.ts 逐个校验）。
 */
import type { GraphEdge, GraphNode } from '../../../types/nodeGraph'

export const LAYOUT_LABELS = {
  grid: '网格排列',
  snake: '蛇形排列',
  honeycomb: '蜂巢排列',
  compact: '紧凑排列',
  wide: '宽幅排列',
  tall: '竖幅排列',
  columnFirst: '纵向网格',
  stagger: '错列排列',
  masonry: '瀑布排列',
  sheared: '斜格排列',
  reverseGrid: '倒序网格',
  sparse: '宽松排列',
  row: '横向排开',
  column: '纵向排开',
  zigzag: '之字排列',
  timeline: '时序排列',
  stairs: '阶梯排列',
  diagonal: '对角排列',
  wave: '波浪排列',
  vee: '折角排列',
  slope: '斜坡排列',
  arc: '拱形排列',
  chevron: '尖折排列',
  ribbon: '丝带排列',
  pyramid: '塔形排列',
  funnel: '漏斗排列',
  frame: '回形排列',
  whirl: '回旋排列',
  diamond: '菱形排列',
  cross: '十字排列',
  hexagon: '六边形排列',
  tree: '树形排列',
  treeReverse: '反向树形',
  layered: '分层排列',
  layeredReverse: '倒置分层',
  mindmap: '脑图排列',
  org: '组织架构',
  orgSide: '横向架构',
  outline: '大纲排列',
  lanes: '泳道排列',
  forest: '森林排列',
  fishbone: '鱼骨排列',
  ring: '环形排列',
  fan: '扇形排列',
  spiral: '螺旋排列',
  radial: '辐射排列',
  center: '中心聚拢',
  force: '力导向排列',
  concentric: '同心排列',
  ellipse: '椭圆排列',
  star: '星形排列',
  sunflower: '葵花排列',
  halfRing: '半环排列',
  doubleRing: '双环排列',
  byTitle: '标题排序',
  byProgress: '进度排序',
  byType: '类型分组',
  byGroup: '编组分组',
  byColor: '颜色分组',
  byTag: '标签分组',
} as const

export type LayoutMode = keyof typeof LAYOUT_LABELS

/** 菜单分组；每种模式必须且只能出现一次（layout.test.ts 校验）。 */
export const LAYOUT_GROUPS: { title: string; modes: LayoutMode[] }[] = [
  { title: '网格', modes: ['grid', 'snake', 'honeycomb', 'compact', 'wide', 'tall', 'columnFirst', 'stagger', 'masonry', 'sheared', 'reverseGrid', 'sparse'] },
  { title: '线性', modes: ['row', 'column', 'zigzag', 'timeline', 'stairs', 'diagonal', 'wave', 'vee', 'slope', 'arc', 'chevron', 'ribbon'] },
  { title: '图形', modes: ['pyramid', 'funnel', 'frame', 'whirl', 'diamond', 'cross', 'hexagon'] },
  { title: '层级', modes: ['tree', 'treeReverse', 'layered', 'layeredReverse', 'mindmap', 'org', 'orgSide', 'outline', 'lanes', 'forest', 'fishbone'] },
  { title: '环形', modes: ['ring', 'halfRing', 'doubleRing', 'fan', 'spiral', 'radial', 'center', 'force', 'concentric', 'ellipse', 'star', 'sunflower'] },
  { title: '分类', modes: ['byTitle', 'byProgress', 'byType', 'byGroup', 'byColor', 'byTag'] },
]

export type LayoutResult = Record<string, { x: number; y: number }>

const GAP_X = 64
const GAP_Y = 48
/** 紧凑排列的间距：贴近但不相叠。 */
const COMPACT_GAP = 12
/** 瀑布排列的间距。 */
const MASONRY_GAP = 24
/** 大纲排列每深一级右移多少。 */
const OUTLINE_INDENT = 48
/** 图形类（菱形/十字/六边形）行距：行内半格居中错位，行间多留一档余量。 */
const CELL_GAP_Y = 168

type Box = { minX: number; minY: number; maxW: number; maxH: number }

function bounds(nodes: GraphNode[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxW = 0
  let maxH = 0
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxW = Math.max(maxW, node.width)
    maxH = Math.max(maxH, node.height)
  }
  return { minX, minY, maxW, maxH }
}

/** 把以任意原点算出的坐标整体平移到原内容左上角，排完不会跑到视口外面去。 */
function pinTopLeft(points: LayoutResult, box: Box): LayoutResult {
  const list = Object.values(points)
  const left = Math.min(...list.map((p) => p.x))
  const top = Math.min(...list.map((p) => p.y))
  for (const p of list) {
    p.x = Math.round(box.minX + p.x - left)
    p.y = Math.round(box.minY + p.y - top)
  }
  return points
}

// ---------- 网格类 / 线性类 / 图形类：按序号落到格子里 ----------

type CellAt = [col: number, row: number]
/** 第 index 个节点落在第几列、第几行（可以是小数或负数，用来错位）。 */
type Cell = (index: number, count: number) => CellAt

const gridCols = (count: number) => Math.max(1, Math.ceil(Math.sqrt(count)))

const CELLS = {
  /** 列数取平方根。 */
  grid: (i, n) => [i % gridCols(n), Math.floor(i / gridCols(n))],
  /** 网格，但偶数行从右往左走，首尾相接。 */
  snake: (i, n) => {
    const cols = gridCols(n)
    const row = Math.floor(i / cols)
    return [row % 2 ? cols - 1 - (i % cols) : i % cols, row]
  },
  /** 网格，但偶数行右移半格。 */
  honeycomb: (i, n) => [(i % gridCols(n)) + (Math.floor(i / gridCols(n)) % 2) / 2, Math.floor(i / gridCols(n))],
  row: (i) => [i, 0],
  column: (i) => [0, i],
  /** 左右两列交错下行，相邻节点错开半个行高。 */
  zigzag: (i) => [i % 2, i / 2],
  /** 上下两行交错右行，像时间轴两侧的事件。 */
  timeline: (i) => [i / 2, i % 2],
  /** 每个节点右移半格、下移一格。 */
  stairs: (i) => [i / 2, i],
  /** 列数约为行数两倍的网格：横向铺开，适合宽屏。 */
  wide: (i, n) => {
    const cols = Math.ceil(Math.sqrt(n * 2))
    return [i % cols, Math.floor(i / cols)]
  },
  /** 行数约为列数两倍的网格：纵向铺开。 */
  tall: (i, n) => {
    const cols = Math.max(1, Math.round(Math.sqrt(n / 2)))
    return [i % cols, Math.floor(i / cols)]
  },
  /** 网格，但先填满一列再换下一列。 */
  columnFirst: (i, n) => {
    const rows = Math.ceil(n / gridCols(n))
    return [Math.floor(i / rows), i % rows]
  },
  /** 网格，但偶数列下移半格。 */
  stagger: (i, n) => [i % gridCols(n), Math.floor(i / gridCols(n)) + ((i % gridCols(n)) % 2) / 2],
  /** 每个节点右移一格、下移一格。 */
  diagonal: (i) => [i, i],
  /** 网格，但每列整体竖向剪切：越往右的列越往下沉。 */
  sheared: (i, n) => {
    const cols = gridCols(n)
    const col = i % cols
    return [col, Math.floor(i / cols) + col]
  },
  /** 网格，但顺序倒过来：最后一个节点落在左上角。 */
  reverseGrid: (i, n) => {
    const cols = gridCols(n)
    const rev = n - 1 - i
    return [rev % cols, Math.floor(rev / cols)]
  },
  /** 列数翻倍、隔列留空，节点之间更宽松。 */
  sparse: (i) => [(i % 2) * 2 + Math.floor(i / 2) % 2, Math.floor(i / 2)],
  /** 一路向右，纵向按 0、1、2、1 起伏。 */
  wave: (i) => [i, 1 - Math.cos((i * Math.PI) / 2)],
  /** 一路向右，先降后升排成 V 形。 */
  vee: (i, n) => [i, (n - 1) / 2 - Math.abs(i - (n - 1) / 2)],
  /** 一路向右，折线抬升：前半段上行、后半段横走。 */
  slope: (i, n) => [i, Math.min(i, Math.ceil((n - 1) / 2))],
  /** 一路向右，先升后降排成拱形：两端低、中间高。 */
  arc: (i, n) => [i, Math.floor(Math.min(i, n - 1 - i) / 2)],
  /** 一路向右，升到顶再折回半程，排成尖折形。 */
  chevron: (i, n) => [i, Math.min(i, (n - 1) / 2) + Math.max(0, i - Math.ceil((n - 1) / 2))],
  /** 一路向右，升两次降一次，排成 S 形丝带。 */
  ribbon: (i, n) => [i, Math.min(i, n - 1 - Math.abs(n - 1 - 2 * i))],
  /** 沿正方形的四条边顺时针摆一圈，中间留空。 */
  frame: (i, n) => {
    // 每条边放 side 个，边的终点算作下一条边的起点。
    const side = Math.ceil(n / 4)
    const t = i % side
    const edge: CellAt[] = [[t, 0], [side, t], [side - t, side], [0, side - t]]
    return edge[Math.floor(i / side)]
  },
} satisfies Record<string, Cell>

function layoutCells(nodes: GraphNode[], cell: Cell, gapX = GAP_X, gapY = GAP_Y): LayoutResult {
  const box = bounds(nodes)
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    const [col, row] = cell(index, nodes.length)
    out[node.id] = { x: col * (box.maxW + gapX), y: row * (box.maxH + gapY) }
  })
  // 格子可以是负数或从半格开始（塔形、回旋、折角），统一挪回原内容左上角。
  return pinTopLeft(out, box)
}

/** 事先算好的一串格子。 */
const fromList = (cells: CellAt[]): Cell => (index) => cells[index]

/** 塔形每行放几个：1、2、3… 放不满的那一行按个数插回去，轮廓才是单调的。 */
function pyramidRows(count: number): number[] {
  const sizes: number[] = []
  for (let size = 1, left = count; left > 0; left -= size, size += 1) sizes.push(Math.min(size, left))
  return sizes.sort((a, b) => a - b)
}

/** 逐行摆放，每行按最宽的一行居中。 */
function centeredCells(sizes: number[]): CellAt[] {
  const widest = Math.max(...sizes)
  return sizes.flatMap((size, row) =>
    Array.from({ length: size }, (_, col): CellAt => [col + (widest - size) / 2, row]),
  )
}

/** 菱形：行宽先增后减，共用中间最宽的一行。 */
function diamondRows(count: number): number[] {
  const sizes: number[] = []
  let left = count
  for (let size = 1; left > 0; size += 1) {
    sizes.push(Math.min(size, left))
    left -= sizes[sizes.length - 1]
  }
  const lower: number[] = []
  for (let size = sizes[sizes.length - 1] - 1; size > 0 && left > 0; size -= 1) {
    lower.push(Math.min(size, left))
    left -= lower[lower.length - 1]
  }
  return [...sizes, ...lower]
}

/** 十字：中心一格，其余节点交替分到横臂和竖臂上。 */
function crossCells(count: number): CellAt[] {
  const cells: CellAt[] = [[0, 0]]
  for (let i = 1; i < count; i += 1) {
    const step = Math.ceil(i / 2)
    cells.push(i % 2 ? [step, 0] : [0, step])
  }
  return cells
}

/** 六边形：行宽按 1、2、3…3、2、1 堆叠，外轮廓接近正六边形。 */
function hexagonRows(count: number): number[] {
  const sizes: number[] = []
  let left = count
  for (let size = 1; left > 0; size += 1) {
    for (const take of [size, size]) {
      if (left <= 0) break
      sizes.push(Math.min(take, left))
      left -= sizes[sizes.length - 1]
    }
  }
  return sizes
}

/** 回旋：从中心格出发，顺时针一圈圈往外绕（方形螺旋）。 */
function whirlCells(count: number): CellAt[] {
  const cells: CellAt[] = []
  // 每走完两条边，边长加一。
  for (let x = 0, y = 0, dx = 1, dy = 0, run = 1, left = 1, turns = 0; cells.length < count; ) {
    cells.push([x, y])
    x += dx
    y += dy
    left -= 1
    if (left) continue
    ;[dx, dy] = [-dy, dx]
    turns += 1
    if (turns % 2 === 0) run += 1
    left = run
  }
  return cells
}

/** 半环：节点沿下半圆从左到右摆开（扇形的镜像，开口朝上）。 */
function layoutHalfRing(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const step = nodes.length > 1 ? Math.PI / (nodes.length - 1) : 0
  const radius = step ? ringUnit(box) / (2 * Math.sin(step / 2)) : 0
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    out[node.id] = polar(node, radius, index * step)
  })
  return pinTopLeft(out, box)
}

/** 双环：节点平分两圈，内圈等角度摆开后，外圈半径再加一个半 unit。 */
function layoutDoubleRing(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const half = Math.ceil(nodes.length / 2)
  const inner = ringRadius(half, unit)
  const out: LayoutResult = {}
  placeRing(out, nodes.slice(0, half), inner)
  placeRing(out, nodes.slice(half), inner + unit * 1.6)
  return pinTopLeft(out, box)
}

/** 瀑布：列数同网格，每个节点落到当前最矮的一列；节点高矮不一时比网格紧凑。 */
function layoutMasonry(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const heights = Array.from({ length: gridCols(nodes.length) }, () => 0)
  const out: LayoutResult = {}
  for (const node of nodes) {
    const col = heights.indexOf(Math.min(...heights))
    out[node.id] = { x: col * (box.maxW + MASONRY_GAP), y: heights[col] }
    heights[col] += node.height + MASONRY_GAP
  }
  return pinTopLeft(out, box)
}

// ---------- 分类：按节点属性排序或分组 ----------

/**
 * 分组：同一个 key 的节点排在一起，各组自上而下、组间多留半行；没有 key 的排最后。
 * 一组太长时按两倍网格列数折行，不会排成一条看不到头的线。
 */
function layoutGroups(nodes: GraphNode[], key: (node: GraphNode) => string | undefined): LayoutResult {
  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const name = key(node) || ''
    groups.set(name, [...(groups.get(name) || []), node])
  }
  const ordered = [...groups].sort(([a], [b]) => Number(!a) - Number(!b)).map(([, list]) => list)
  const wrap = gridCols(nodes.length) * 2
  const cells: CellAt[] = []
  let top = 0
  for (const list of ordered) {
    list.forEach((_, index) => cells.push([index % wrap, top + Math.floor(index / wrap)]))
    top += Math.ceil(list.length / wrap) + 0.5
  }
  return layoutCells(ordered.flat(), fromList(cells))
}

/** 网格：列数取平方根，整体从原内容左上角开始。 */
export function layoutGrid(nodes: GraphNode[]): LayoutResult {
  return layoutCells(nodes, CELLS.grid)
}

// ---------- 层级类：按连线分层 ----------

/**
 * 拓扑分层（最长路径）：没有入边的在第 0 层，其余在所有上游的下一层。
 * 连线成环时剩下的节点入度永远不归零，按节点顺序强行取一个当起点把环拆开。
 */
function computeLayers(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const remaining = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!remaining.has(edge.source) || !remaining.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target])
  }
  const layers = new Map<string, number>()
  const queue = nodes.filter((node) => !indegree.get(node.id)).map((node) => node.id)
  while (remaining.size) {
    const id = queue.shift() ?? (remaining.values().next().value as string)
    if (!remaining.delete(id)) continue
    const depth = layers.get(id) || 0
    layers.set(id, depth)
    for (const next of outgoing.get(id) || []) {
      if (!remaining.has(next)) continue
      layers.set(next, Math.max(layers.get(next) || 0, depth + 1))
      const left = (indegree.get(next) || 0) - 1
      indegree.set(next, left)
      if (left === 0) queue.push(next)
    }
  }
  return layers
}

/** 按层分组，下标就是层号。 */
function layerRows(nodes: GraphNode[], layers: Map<string, number>): GraphNode[][] {
  const rows: GraphNode[][] = []
  for (const node of nodes) (rows[layers.get(node.id) || 0] ||= []).push(node)
  // 拆环后可能跳过某一层，压掉空层。
  return rows.filter(Boolean)
}

/**
 * 树形：层与层从左到右，同层纵向排开。
 * 分层（vertical）：层与层自上而下，同层横向排开并按最宽的一层居中。
 * reverse 把层的方向倒过来（从右到左 / 自下而上）。
 */
export function layoutTree(nodes: GraphNode[], edges: GraphEdge[], vertical = false, reverse = false): LayoutResult {
  const { minX, minY, maxW, maxH } = bounds(nodes)
  const rows = layerRows(nodes, computeLayers(nodes, edges))
  const widest = Math.max(0, ...rows.map((list) => list.length))
  const out: LayoutResult = {}
  rows.forEach((list, depth) => {
    const rank = reverse ? rows.length - 1 - depth : depth
    list.forEach((node, index) => {
      out[node.id] = vertical
        ? {
            x: minX + Math.round(((widest - list.length) / 2 + index) * (maxW + GAP_X)),
            y: minY + rank * (maxH + 96),
          }
        : { x: minX + rank * (maxW + 96), y: minY + index * (maxH + GAP_Y) }
    })
  })
  return out
}

/**
 * 把分层结果认成一片森林：每个节点认上一层的第一个上游做父节点，
 * 找不到的（根、拆环的起点）自己当根。子节点一定在父节点的下一层。
 */
function buildForest(nodes: GraphNode[], edges: GraphEdge[]) {
  const rows = layerRows(nodes, computeLayers(nodes, edges))
  const depth = new Map<string, number>()
  rows.forEach((list, index) => list.forEach((node) => depth.set(node.id, index)))
  const children = new Map<string, GraphNode[]>()
  const roots: GraphNode[] = []
  for (const node of rows.flat()) {
    const at = depth.get(node.id) || 0
    const parent = edges.find((edge) => edge.target === node.id && depth.get(edge.source) === at - 1)
    if (parent && at) children.set(parent.source, [...(children.get(parent.source) || []), node])
    else roots.push(node)
  }
  return { rows, depth, children, roots }
}

/**
 * 组织架构：父节点居中压在自己的子树上方，叶子从左到右各占一格。
 * sideways 把它横过来：层从左到右，叶子自上而下。
 */
function layoutOrg(nodes: GraphNode[], edges: GraphEdge[], sideways = false): LayoutResult {
  const box = bounds(nodes)
  const { depth, children, roots } = buildForest(nodes, edges)
  const out: LayoutResult = {}
  let slot = 0
  const place = (node: GraphNode): number => {
    const kids = (children.get(node.id) || []).map(place)
    const at = kids.length ? (kids[0] + kids[kids.length - 1]) / 2 : slot++
    const rank = depth.get(node.id) || 0
    out[node.id] = sideways
      ? { x: rank * (box.maxW + 96), y: at * (box.maxH + GAP_Y) }
      : { x: at * (box.maxW + GAP_X), y: rank * (box.maxH + 96) }
    return at
  }
  roots.forEach(place)
  return pinTopLeft(out, box)
}

/** 大纲：像目录一样一行一个，先父后子，每深一级向右缩进。 */
function layoutOutline(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const box = bounds(nodes)
  const { children, roots } = buildForest(nodes, edges)
  const out: LayoutResult = {}
  let row = 0
  const walk = (node: GraphNode, level: number) => {
    out[node.id] = { x: level * OUTLINE_INDENT, y: row++ * (box.maxH + COMPACT_GAP) }
    for (const kid of children.get(node.id) || []) walk(kid, level + 1)
  }
  for (const root of roots) walk(root, 0)
  return pinTopLeft(out, box)
}

/** 森林：每棵树自上而下占一列，多棵树从左到右铺开。 */
function layoutForest(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const box = bounds(nodes)
  const { roots, children } = buildForest(nodes, edges)
  const out: LayoutResult = {}
  const walk = (node: GraphNode, col: number, depth: number): number => {
    const kids = children.get(node.id) || []
    // 没有子节点的叶子各占一列；有子节点的分支占满子树宽度后再居中。
    let span = 0
    if (!kids.length) span = 1
    else for (const kid of kids) span += walk(kid, col + span, depth + 1)
    out[node.id] = {
      x: Math.round((col + (span - 1) / 2) * (box.maxW + GAP_X)),
      y: depth * (box.maxH + GAP_Y),
    }
    return span
  }
  let col = 0
  for (const root of roots) col += walk(root, col, 0)
  return pinTopLeft(out, box)
}

/**
 * 鱼骨：主干自左向右，节点交替挂在主干上下两侧、逐层往外斜。
 * shortcut: 不看连线的主次，只按节点顺序交替；要严格按因果主干时请手动排。
 */
function layoutFishbone(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    if (index % 3 === 0) {
      out[node.id] = { x: (index / 3) * (box.maxW + GAP_X) * 2, y: 0 }
    } else {
      const slot = Math.floor(index / 3)
      const up = index % 3 === 1
      out[node.id] = {
        x: (slot + 1) * (box.maxW + GAP_X) * 2,
        y: (up ? -1 : 1) * Math.ceil((slot + 1) / 2) * (box.maxH + GAP_Y),
      }
    }
  })
  return pinTopLeft(out, box)
}

/** 连在一起的节点算一组（不看连线方向），按组里第一个节点的顺序排。 */
function components(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[][] {
  const lead = new Map(nodes.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    while (lead.get(id) !== id) id = lead.get(id) as string
    return id
  }
  for (const edge of edges) {
    if (lead.has(edge.source) && lead.has(edge.target)) lead.set(find(edge.source), find(edge.target))
  }
  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes) groups.set(find(node.id), [...(groups.get(find(node.id)) || []), node])
  return [...groups.values()]
}

/** 泳道：互相连着的节点占一条泳道（道内按树形排），泳道自上而下。只有一组时就是树形。 */
function layoutLanes(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const box = bounds(nodes)
  const out: LayoutResult = {}
  let top = 0
  for (const lane of components(nodes, edges)) {
    const placed = layoutTree(lane, edges)
    const points = Object.values(placed)
    const left = Math.min(...points.map((p) => p.x))
    const above = Math.min(...points.map((p) => p.y))
    for (const [id, p] of Object.entries(placed)) out[id] = { x: p.x - left, y: p.y - above + top }
    top += Math.max(...points.map((p) => p.y)) - above + box.maxH + GAP_Y * 2
  }
  return pinTopLeft(out, box)
}

/** 脑图：根在中间一列，第一层子节点左右交替分开，后代跟着所在的那一侧往外长。 */
function layoutMindmap(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const box = bounds(nodes)
  const layers = computeLayers(nodes, edges)
  /** 0 = 中间列，1 = 右侧，-1 = 左侧 */
  const side = new Map<string, number>()
  const columns = new Map<number, GraphNode[]>()
  let branch = 0
  layerRows(nodes, layers).forEach((list, depth) => {
    for (const node of list) {
      const parent = edges.find((edge) => edge.target === node.id && layers.get(edge.source) === depth - 1)
      const at = depth === 0 ? 0 : depth === 1 ? (branch++ % 2 ? -1 : 1) : (parent && side.get(parent.source)) || 1
      side.set(node.id, at)
      columns.set(at * depth, [...(columns.get(at * depth) || []), node])
    }
  })
  const out: LayoutResult = {}
  for (const [column, list] of columns) {
    list.forEach((node, index) => {
      out[node.id] = {
        x: column * (box.maxW + 96),
        y: (index - (list.length - 1) / 2) * (box.maxH + GAP_Y),
      }
    })
  }
  return pinTopLeft(out, box)
}

// ---------- 环形类：极坐标摆放 ----------

/** 圆上相邻两个节点的最小间距：一个节点的对角线再加间隙，任何角度都不会相叠。 */
function ringUnit(box: Box): number {
  return Math.hypot(box.maxW, box.maxH) + GAP_X
}

/** 按弦长反推半径：count 个节点等角度摆开时，相邻两个正好隔开 unit。 */
function ringRadius(count: number, unit: number): number {
  return count > 1 ? unit / (2 * Math.sin(Math.PI / count)) : 0
}

/**
 * 节点中心落在极坐标 (radius, angle) 上时的左上角；原点任意，最后统一 pinTopLeft。
 * stretch ≥ 1 把圆横向拉成椭圆：只会把节点拉得更开，不会拉出重叠。
 */
function polar(node: GraphNode, radius: number, angle: number, stretch = 1) {
  return { x: Math.cos(angle) * radius * stretch - node.width / 2, y: Math.sin(angle) * radius - node.height / 2 }
}

/** 等角度围成一圈，从正上方开始顺时针。 */
function placeRing(out: LayoutResult, nodes: GraphNode[], radius: number, stretch = 1): void {
  nodes.forEach((node, index) => {
    out[node.id] = polar(node, radius, (index / nodes.length) * Math.PI * 2 - Math.PI / 2, stretch)
  })
}

/** 环形：全部节点等角度围成一圈；stretch > 1 时是横向的椭圆。 */
function layoutRing(nodes: GraphNode[], stretch = 1): LayoutResult {
  const box = bounds(nodes)
  const out: LayoutResult = {}
  placeRing(out, nodes, ringRadius(nodes.length, ringUnit(box)), stretch)
  return pinTopLeft(out, box)
}

/**
 * 同心：第 k 圈放 4k 个、半径 k 个 unit，从里往外填。
 * 每圈 4k 个时相邻弦长约 1.4～1.6 个 unit，圈距正好一个 unit，都不会相叠；
 * 不取 6k 是因为那样 6 个节点以内和环形排列完全一样。
 */
function layoutConcentric(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const out: LayoutResult = {}
  for (let ring = 1, start = 0; start < nodes.length; start += ring * 4, ring += 1) {
    placeRing(out, nodes.slice(start, start + ring * 4), ring * unit)
  }
  return pinTopLeft(out, box)
}

/** 星形：围成一圈，但单数位在内圈、双数位往外多伸一个 unit。 */
function layoutStar(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const inner = ringRadius(nodes.length, unit)
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    // 只把节点沿半径往外推，和内圈、和其它外圈节点的距离都只增不减。
    out[node.id] = polar(node, inner + (index % 2 ? 0 : unit), (index / nodes.length) * Math.PI * 2 - Math.PI / 2)
  })
  return pinTopLeft(out, box)
}

/** 葵花：按黄金角一个个往外转（向日葵籽的排法），半径随序号开方增长，疏密均匀。 */
function layoutSunflower(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    out[node.id] = polar(node, unit * Math.sqrt(index), index * golden - Math.PI / 2)
  })
  return pinTopLeft(out, box)
}

/** 扇形：节点沿上半圆从左到右摆开。 */
function layoutFan(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  const step = nodes.length > 1 ? Math.PI / (nodes.length - 1) : 0
  const radius = step ? ringUnit(box) / (2 * Math.sin(step / 2)) : 0
  const out: LayoutResult = {}
  nodes.forEach((node, index) => {
    out[node.id] = polar(node, radius, Math.PI + index * step)
  })
  return pinTopLeft(out, box)
}

/** 螺旋：第一个在圆心，其余沿阿基米德螺线一圈圈往外。 */
function layoutSpiral(nodes: GraphNode[]): LayoutResult {
  const box = bounds(nodes)
  // 圈距和弧长都取 1.05 个 unit：弦比弧短一点，留出余量才不会相叠。
  const pitch = ringUnit(box) * 1.05
  const out: LayoutResult = {}
  let angle = 0
  nodes.forEach((node, index) => {
    const radius = index ? ringUnit(box) + (pitch * angle) / (Math.PI * 2) : 0
    out[node.id] = polar(node, radius, angle - Math.PI / 2)
    if (index) angle += pitch / radius
  })
  return pinTopLeft(out, box)
}

/**
 * 辐射：根在圆心，每往下一层就往外一圈；子节点落在父节点所占的那段扇区里，
 * 扇区按叶子数分配，所以分支多的一支占的角度也大。
 */
function layoutRadial(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const { rows, children, roots } = buildForest(nodes, edges)
  const leaves = new Map<string, number>()
  const countLeaves = (node: GraphNode): number => {
    const kids = children.get(node.id) || []
    const total = kids.length ? kids.reduce((sum, kid) => sum + countLeaves(kid), 0) : 1
    leaves.set(node.id, total)
    return total
  }
  const angles = new Map<string, number>()
  const assign = (list: GraphNode[], from: number, span: number) => {
    const total = list.reduce((sum, node) => sum + (leaves.get(node.id) || 1), 0)
    for (const node of list) {
      const share = (span * (leaves.get(node.id) || 1)) / total
      angles.set(node.id, from + share / 2)
      assign(children.get(node.id) || [], from, share)
      from += share
    }
  }
  roots.forEach(countLeaves)
  assign(roots, 0, Math.PI * 2)

  const out: LayoutResult = {}
  let radius = -unit
  for (const list of rows) {
    // 这一圈上挨得最近的两个节点决定最小半径；同时要和里面一圈隔开一个 unit。
    const sorted = list.map((node) => angles.get(node.id) || 0).sort((x, y) => x - y)
    const gap = Math.min(...sorted.map((angle, i) => (i ? angle - sorted[i - 1] : angle + Math.PI * 2 - sorted[sorted.length - 1])))
    const need = list.length > 1 ? unit / (2 * Math.sin(Math.min(gap, Math.PI) / 2)) : 0
    radius = Math.max(need, radius + unit)
    for (const node of list) out[node.id] = polar(node, radius, (angles.get(node.id) || 0) - Math.PI / 2)
  }
  return pinTopLeft(out, box)
}

/** 中心聚拢：连线最多的节点放在圆心，其余围成一圈。 */
function layoutCenter(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }
  // 度数相同取靠前的节点，没有连线时就是第一个。
  const hub = nodes.reduce((best, node) => ((degree.get(node.id) || 0) > (degree.get(best.id) || 0) ? node : best))
  const rest = nodes.filter((node) => node !== hub)
  const box = bounds(nodes)
  const unit = ringUnit(box)
  const out: LayoutResult = { [hub.id]: polar(hub, 0, 0) }
  // 半径至少一个 unit，圆心的节点才不会碰到环上的节点。
  placeRing(out, rest, Math.max(unit, ringRadius(rest.length, unit)))
  return pinTopLeft(out, box)
}

/**
 * 力导向：排斥 + 弹簧的简化版。
 *
 * shortcut: 节点超过 200 个时退化为网格排列，O(n²) 迭代会卡住主线程。
 */
export function layoutForce(nodes: GraphNode[], edges: GraphEdge[], iterations = 120): LayoutResult {
  if (!nodes.length) return {}
  if (nodes.length > 200) return layoutGrid(nodes)
  const box = bounds(nodes)
  const { maxW, maxH } = box
  const radius = Math.max(200, nodes.length * Math.max(maxW, maxH) * 0.18)
  const pos = new Map<string, { x: number; y: number }>()
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2
    pos.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  })
  const ids = new Set(nodes.map((node) => node.id))
  const links = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  const ideal = maxW + GAP_X
  for (let step = 0; step < iterations; step += 1) {
    const shift = new Map<string, { x: number; y: number }>()
    for (const node of nodes) shift.set(node.id, { x: 0, y: 0 })
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id) as { x: number; y: number }
        const b = pos.get(nodes[j].id) as { x: number; y: number }
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.hypot(dx, dy) || 0.01
        if (dist < 1) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          dist = 0.5
        }
        const force = (ideal * ideal) / dist
        const sa = shift.get(nodes[i].id) as { x: number; y: number }
        const sb = shift.get(nodes[j].id) as { x: number; y: number }
        sa.x += (dx / dist) * force
        sa.y += (dy / dist) * force
        sb.x -= (dx / dist) * force
        sb.y -= (dy / dist) * force
      }
    }
    for (const edge of links) {
      const a = pos.get(edge.source) as { x: number; y: number }
      const b = pos.get(edge.target) as { x: number; y: number }
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.hypot(dx, dy) || 0.01
      const force = (dist - ideal) * 0.08
      const sa = shift.get(edge.source) as { x: number; y: number }
      const sb = shift.get(edge.target) as { x: number; y: number }
      sa.x -= (dx / dist) * force
      sa.y -= (dy / dist) * force
      sb.x += (dx / dist) * force
      sb.y += (dy / dist) * force
    }
    for (const node of nodes) {
      const p = pos.get(node.id) as { x: number; y: number }
      const s = shift.get(node.id) as { x: number; y: number }
      // 向心力：没有连线牵着的节点只受排斥，不拉一把会一直往外飘。
      s.x -= p.x * 2
      s.y -= p.y * 2
      p.x += Math.max(-40, Math.min(40, s.x * 0.01))
      p.y += Math.max(-40, Math.min(40, s.y * 0.01))
    }
  }
  // 力只看中心距离，不知道节点是长方形：把还叠着的沿重叠较浅的那条轴推开。
  for (let pass = 0, moved = true; moved && pass < 200; pass += 1) {
    moved = false
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id) as { x: number; y: number }
        const b = pos.get(nodes[j].id) as { x: number; y: number }
        const overlapX = Math.min(a.x + nodes[i].width, b.x + nodes[j].width) - Math.max(a.x, b.x) + COMPACT_GAP
        const overlapY = Math.min(a.y + nodes[i].height, b.y + nodes[j].height) - Math.max(a.y, b.y) + COMPACT_GAP
        if (overlapX <= 0 || overlapY <= 0) continue
        moved = true
        const axis = overlapX < overlapY ? 'x' : 'y'
        const push = (Math.min(overlapX, overlapY) / 2) * (a[axis] <= b[axis] ? 1 : -1)
        a[axis] -= push
        b[axis] += push
      }
    }
  }
  // 力导向的原点在一圈节点的圆心，统一挪回原内容左上角。
  return pinTopLeft(Object.fromEntries(pos), box)
}

export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], mode: LayoutMode): LayoutResult {
  if (!nodes.length) return {}
  switch (mode) {
    case 'compact':
      return layoutCells(nodes, CELLS.grid, COMPACT_GAP, COMPACT_GAP)
    case 'masonry':
      return layoutMasonry(nodes)
    case 'pyramid':
      return layoutCells(nodes, fromList(centeredCells(pyramidRows(nodes.length))))
    case 'funnel':
      return layoutCells(nodes, fromList(centeredCells(pyramidRows(nodes.length).reverse())))
    case 'diamond':
      return layoutCells(nodes, fromList(centeredCells(diamondRows(nodes.length))), GAP_X, CELL_GAP_Y)
    case 'cross':
      return layoutCells(nodes, fromList(crossCells(nodes.length)), GAP_X, CELL_GAP_Y)
    case 'hexagon':
      return layoutCells(nodes, fromList(centeredCells(hexagonRows(nodes.length))), GAP_X, CELL_GAP_Y)
    case 'halfRing':
      return layoutHalfRing(nodes)
    case 'doubleRing':
      return layoutDoubleRing(nodes)
    case 'forest':
      return layoutForest(nodes, edges)
    case 'fishbone':
      return layoutFishbone(nodes)
    case 'whirl':
      return layoutCells(nodes, fromList(whirlCells(nodes.length)))
    case 'org':
      return layoutOrg(nodes, edges)
    case 'orgSide':
      return layoutOrg(nodes, edges, true)
    case 'outline':
      return layoutOutline(nodes, edges)
    case 'lanes':
      return layoutLanes(nodes, edges)
    case 'concentric':
      return layoutConcentric(nodes)
    case 'ellipse':
      return layoutRing(nodes, 1.6)
    case 'star':
      return layoutStar(nodes)
    case 'sunflower':
      return layoutSunflower(nodes)
    case 'byTitle':
      // sort 是稳定的：标题相同的保持原有先后。
      return layoutGrid([...nodes].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true })))
    case 'byProgress':
      return layoutGrid([...nodes].sort((a, b) => (a.progress || 0) - (b.progress || 0)))
    case 'byType':
      return layoutGroups(nodes, (node) => node.type)
    case 'byGroup':
      return layoutGroups(nodes, (node) => node.groupId)
    case 'byColor':
      return layoutGroups(nodes, (node) => node.color)
    case 'byTag':
      return layoutGroups(nodes, (node) => (node.tags || [])[0])
    case 'tree':
      return layoutTree(nodes, edges)
    case 'treeReverse':
      return layoutTree(nodes, edges, false, true)
    case 'layered':
      return layoutTree(nodes, edges, true)
    case 'layeredReverse':
      return layoutTree(nodes, edges, true, true)
    case 'mindmap':
      return layoutMindmap(nodes, edges)
    case 'ring':
      return layoutRing(nodes)
    case 'fan':
      return layoutFan(nodes)
    case 'spiral':
      return layoutSpiral(nodes)
    case 'radial':
      return layoutRadial(nodes, edges)
    case 'center':
      return layoutCenter(nodes, edges)
    case 'force':
      return layoutForce(nodes, edges)
    default:
      return layoutCells(nodes, CELLS[mode as keyof typeof CELLS])
  }
}
