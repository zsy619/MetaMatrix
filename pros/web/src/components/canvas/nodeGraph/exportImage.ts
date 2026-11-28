/**
 * 节点画布导出为图片（PNG / JPG / SVG）。
 *
 * 画布内容是 DOM + SVG 连线，没法直接截图，所以按节点数据重新画一张
 * 同布局的 SVG，再把 SVG 栅格化成 PNG / JPG（同 BusinessFormulaCanvas 的导出做法）。
 */
import {
  DEFAULT_NODE_GRAPH_BACKGROUND,
  type GraphEdge,
  type GraphNode,
  type NodeGraphBackground,
} from '../../../types/nodeGraph'
import { nodeTypeSpec } from './nodeTypes'
import { backgroundSvg } from './background'
import { edgeEndpoints } from './anchors'

export type ExportFormat = 'png' | 'jpg' | 'svg'

const PADDING = 48
const FONT = "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 富文本正文取纯文本预览：导出图里只放一行字。 */
export function contentPreview(html: string | undefined, max = 26): string {
  if (!html) return ''
  const text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return ellipsis(text, max)
}

/** 描述太长时截断，卡片里只放一行。 */
function ellipsis(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean
}

/** 内容包围盒：节点为准，连线不额外扩边。 */
export function contentBounds(nodes: GraphNode[]): {
  minX: number
  minY: number
  width: number
  height: number
} {
  if (!nodes.length) return { minX: 0, minY: 0, width: 640, height: 400 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** 连线起止点：与画布上的 EdgeLayer 同一套算法（从侧边出发、落到侧边）。 */
function endpointsOf(edge: GraphEdge, map: Map<string, GraphNode>) {
  return edgeEndpoints(edge, map)
}

/** 直角连线（与画布上的渲染一致）。 */
function orthoPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2
  return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`
}

/** 节点画布的 SVG 源码。 */
export function buildNodeGraphSvg(
  nodes: GraphNode[],
  edges: GraphEdge[],
  background?: NodeGraphBackground,
): string {
  const bounds = contentBounds(nodes)
  const width = Math.round(bounds.width + PADDING * 2)
  const height = Math.round(bounds.height + PADDING * 2)
  const offsetX = PADDING - bounds.minX
  const offsetY = PADDING - bounds.minY
  const map = new Map(nodes.map((node) => [node.id, node]))

  const markers: string[] = []
  const edgeSvg = edges
    .map((edge, index) => {
      const points = endpointsOf(edge, map)
      if (!points) return ''
      const { from, to } = points
      const dx = Math.abs(to.x - from.x)
      const dy = Math.abs(to.y - from.y)
      let d: string
      if (edge.style?.line === 'ortho') {
        d = orthoPath(from, to)
      } else if (dy >= dx) {
        const bend = Math.max(32, dy / 2)
        const dir = to.y >= from.y ? 1 : -1
        d =
          `M ${from.x} ${from.y} C ${from.x} ${from.y + bend * dir}, ` +
          `${to.x} ${to.y - bend * dir}, ${to.x} ${to.y}`
      } else {
        const bend = Math.max(40, dx / 2)
        const dir = to.x >= from.x ? 1 : -1
        d =
          `M ${from.x} ${from.y} C ${from.x + bend * dir} ${from.y}, ` +
          `${to.x - bend * dir} ${to.y}, ${to.x} ${to.y}`
      }
      const color = edge.style?.color || '#cbd5e1'
      const width = edge.style?.width || 1.6
      const dash = edge.style?.line === 'dashed' ? ' stroke-dasharray="6 5"' : ''
      const arrow = edge.style?.arrow || 'end'
      const markerId = 'ng-arrow-' + index
      if (arrow !== 'none') {
        markers.push(
          `<marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
            `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
        )
      }
      const end = arrow === 'none' ? '' : ` marker-end="url(#${markerId})"`
      const start = arrow === 'both' ? ` marker-start="url(#${markerId})"` : ''
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash}${end}${start}/>`
    })
    .join('')

  // 连线标签画在节点之后：否则会被节点卡片盖住一半。
  const edgeLabelSvg = edges
    .map((edge) => {
      if (!edge.label) return ''
      const points = endpointsOf(edge, map)
      if (!points) return ''
      const { from, to } = points
      return `<text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 6}" text-anchor="middle" fill="#8b929b" font-size="11" font-family="${FONT}">${esc(edge.label)}</text>`
    })
    .join('')

  const nodeSvg = nodes
    .map((node) => {
      const spec = nodeTypeSpec(node.type)
      // 节点用世界坐标：整组内容再由外层 translate 搬到画布位置。
      // （早前这里又加了一次偏移，等于加了两次，节点被画到视口外，导出只剩连线。）
      const x = node.x
      const y = node.y
      const title = esc(ellipsis(node.title || '未命名节点', 18))
      const summary = node.description || contentPreview(node.content)
      const desc = summary ? esc(ellipsis(summary, 26)) : ''
      const progress =
        typeof node.progress === 'number'
          ? `<rect x="${x}" y="${y + node.height - 4}" width="${node.width}" height="4" fill="#eef0f3"/>
             <rect x="${x}" y="${y + node.height - 4}" width="${(node.width * Math.max(0, Math.min(100, node.progress))) / 100}" height="4" fill="${spec.accent}"/>`
          : ''
      return (
        `<g>` +
        `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="10" fill="#ffffff" stroke="${spec.accent}" stroke-width="1.4"/>` +
        `<rect x="${x}" y="${y}" width="4" height="${node.height}" rx="2" fill="${spec.accent}"/>` +
        `<text x="${x + 16}" y="${y + 26}" fill="#202124" font-size="14" font-weight="600" font-family="${FONT}">${title}</text>` +
        (desc ? `<text x="${x + 16}" y="${y + 46}" fill="#6b7280" font-size="12" font-family="${FONT}">${desc}</text>` : '') +
        `<text x="${x + 16}" y="${y + node.height - 12}" fill="#9ca3af" font-size="10" font-family="${FONT}">${esc(spec.label)}</text>` +
        progress +
        `</g>`
      )
    })
    .join('')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>${markers.join('')}</defs>` +
    backgroundSvg(background || DEFAULT_NODE_GRAPH_BACKGROUND, width, height) +
    `<g transform="translate(${offsetX}, ${offsetY})">${edgeSvg}${nodeSvg}${edgeLabelSvg}</g>` +
    `</svg>`
  )
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** SVG 源码 → 位图（PNG / JPG）。 */
async function rasterize(svg: string, mime: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片生成失败'))
      img.src = url
    })
    const size = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * size))
    canvas.height = Math.max(1, Math.round(image.height * size))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器不支持画布导出')
    ctx.scale(size, size)
    ctx.drawImage(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('图片生成失败'))),
        mime,
        0.92,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 导出节点画布为图片文件；传 nodeIds 时只导选中子图。 */
export async function exportNodeGraphImage(
  nodes: GraphNode[],
  edges: GraphEdge[],
  format: ExportFormat,
  title = '节点画布',
  background?: NodeGraphBackground,
  nodeIds: string[] = [],
): Promise<void> {
  const picked = nodeIds.length ? nodes.filter((node) => nodeIds.includes(node.id)) : nodes
  if (!picked.length) throw new Error('画布上还没有节点，先加几个再导出。')
  const set = new Set(picked.map((node) => node.id))
  const pickedEdges = nodeIds.length
    ? edges.filter((edge) => set.has(edge.source) && set.has(edge.target))
    : edges
  const svg = buildNodeGraphSvg(picked, pickedEdges, background)
  const name = (title || '节点画布').replace(/[\\/:*?"<>|]/g, '_')
  if (format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`)
    return
  }
  const blob = await rasterize(svg, format === 'jpg' ? 'image/jpeg' : 'image/png')
  downloadBlob(blob, `${name}.${format}`)
}
