<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Connection,
  DataAnalysis,
  Document,
  FullScreen,
  MoreFilled,
  Picture,
  Pointer,
  RefreshLeft,
  RefreshRight,
  Search,
} from '@element-plus/icons-vue'
import type { DocumentSummary } from '../../../api/documents'
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type GraphEdge,
  type GraphNode,
  type NodeGraphNodeType,
} from '../../../types/nodeGraph'
import { findFreeSpot } from './placeNode'
import { escapeHtml } from '../../../utils/itemsHtml'
import { marqueeRect } from './marquee'
import { anchorForPoint, type AnchorSide, type GraphEdgeAnchor } from './anchors'
import { connectTargetAt, nodeAtPoint } from './hitTest'
import { buildNodeGraphSvg, exportNodeGraphImage, type ExportFormat } from './exportImage'
import { computeGuides, snapToGrid, type Guide } from './guides'
import { createPresence, type PeerCursor } from './presence'
import type { LayoutMode } from './layout'
import { computeStats } from './stats'
import NodeGraphBackgroundPanel from './NodeGraphBackgroundPanel.vue'
import { backgroundStyle } from './background'
import {
  filterTemplateGroups,
  matchTemplate,
  type PickerGroup,
} from './pickerFilter'
import { GUIDE_LANES } from '../../guide/guideLanes'
import { CATEGORY_LABELS, TEMPLATE_META, type TemplateCategory } from '../../../stores/document'
import { findRefProblem, refProblemMessage, type RefMap } from './refCycle'
import { useNodeGraphStore } from '../../../stores/nodeGraph'
import NodeGraphNode from './NodeGraphNode.vue'
import NodeGraphEdgeLayer from './NodeGraphEdgeLayer.vue'
import NodeGraphContextMenu from './NodeGraphContextMenu.vue'
import NodeGraphMinimap from './NodeGraphMinimap.vue'
import AlignIcon from './AlignIcon.vue'
import type { AlignMode, DistributeMode } from './align'

const props = defineProps<{
  canvases: DocumentSummary[]
  /** 当前画布 id：拦截自引用。 */
  currentCanvasId: string
  /** 项目内的引用图：拦截环引用。 */
  refs?: RefMap
  /** 只读分享：不落改动，只保留浏览与导出。 */
  readonly?: boolean
}>()

const emit = defineEmits<{
  /** 单击节点：打开属性面板。 */
  openPanel: [id: string]
  /** 双击节点：打开内容编辑弹窗。 */
  openEditor: [id: string]
  /** 打开节点评论抽屉。 */
  openComments: [id: string]
}>()

const store = useNodeGraphStore()
const rootEl = ref<HTMLElement | null>(null)

type DragState =
  | { kind: 'none' }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number; additive: boolean; moved: boolean }
  | { kind: 'pan'; startClientX: number; startClientY: number; originX: number; originY: number }
  | { kind: 'node'; ids: string[]; startWorldX: number; startWorldY: number; origins: Record<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; id: string; startWorldX: number; startWorldY: number; width: number; height: number; moved: boolean }
  | { kind: 'connect'; source: string; side: AnchorSide; offset: number; x: number; y: number }
  | { kind: 'reconnect'; edgeId: string; which: 'source' | 'target'; x: number; y: number; moved: boolean }

const drag = ref<DragState>({ kind: 'none' })
/** 按住空格时空白处拖拽是平移，不是框选。 */
const spaceDown = ref(false)

/** 触屏：一根手指平移，两根手指捏合缩放。 */
const touchPoints = new Map<number, { x: number; y: number }>()
let pinch: { distance: number; zoom: number; worldX: number; worldY: number; cx: number; cy: number } | null = null

const viewport = computed(() => store.viewport)

const worldStyle = computed(() => ({
  transform: 'translate(' + viewport.value.x + 'px,' + viewport.value.y + 'px) scale(' + viewport.value.zoom + ')',
}))

function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = rootEl.value?.getBoundingClientRect()
  const vp = viewport.value
  const left = rect ? rect.left : 0
  const top = rect ? rect.top : 0
  return {
    x: (clientX - left - vp.x) / vp.zoom,
    y: (clientY - top - vp.y) / vp.zoom,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ---------- 缩放 ----------

function onWheel(event: WheelEvent) {
  // 弹窗（选择画布等）和右键菜单就挂在画布容器里：它们里面的滚轮要滚自己的列表，
  // 不能被画布缩放吃掉（菜单比视口高时，底部的项只能靠滚轮够到）。
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.el-overlay, .el-dialog, .pm-overlay, .ng-ctx')) return
  event.preventDefault()
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top
  const vp = viewport.value
  // 触控板双指滚动平移画布，Ctrl/⌘ + 滚动才是缩放（同 excalidraw）；
  // 鼠标滚轮维持原来的直接缩放。
  if (event.ctrlKey || event.metaKey || !isTrackpadPan(event)) {
    const zoom = clamp(vp.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.2, 2.5)
    const worldX = (px - vp.x) / vp.zoom
    const worldY = (py - vp.y) / vp.zoom
    store.setViewport({ x: px - worldX * zoom, y: py - worldY * zoom, zoom })
    return
  }
  // 指针下的世界坐标保持不动：平移手感才跟手。
  store.setViewport({
    x: vp.x - event.deltaX,
    y: vp.y - event.deltaY,
    zoom: vp.zoom,
  })
}

/**
 * 无 Ctrl 的触控板滚动：像素模式（鼠标滚轮是逐行）且有 X 分量或带 Shift。
 * shortcut: 纵向单指滚动和鼠标滚轮无法区分，会缩放而不是平移；等 Pointer Events
 * 普及 wheel 事件的 pointerType 后再改。
 */
function isTrackpadPan(event: WheelEvent): boolean {
  return event.deltaMode === 0 && (event.deltaX !== 0 || event.shiftKey)
}

/** 当前缩放百分比（左下角显示）。 */
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))

const ZOOM_LEVELS = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5]

// ---------- 自动排列后收进视口 ----------

/** 排列把内容挪出视口后手动找回来很烦；store 排完通知一次，把画布适应到新内容。 */
onMounted(() => {
  window.addEventListener('ng-autolayout', fitToContent)
})
onBeforeUnmount(() => {
  window.removeEventListener('ng-autolayout', fitToContent)
})

const zoomSelectModel = computed({
  get: () => ZOOM_LEVELS.reduce((best, level) => Math.abs(level - viewport.value.zoom) < Math.abs(best - viewport.value.zoom) ? level : best, ZOOM_LEVELS[0]) * 100,
  set: (value: number) => setZoom(value),
})

function setZoom(nextPercent: number) {
  const rect = rootEl.value?.getBoundingClientRect()
  const px = rect ? rect.width / 2 : 0
  const py = rect ? rect.height / 2 : 0
  const vp = viewport.value
  const zoom = clamp(nextPercent / 100, 0.2, 2.5)
  const worldX = (px - vp.x) / vp.zoom
  const worldY = (py - vp.y) / vp.zoom
  store.setViewport({ x: px - worldX * zoom, y: py - worldY * zoom, zoom })
}

/** 缩放回到 100%（同 excalidraw 的 Cmd/Ctrl+0）。 */
function resetZoom() {
  store.setViewport({ ...viewport.value, zoom: 1 })
}

function zoomBy(factor: number) {
  const rect = rootEl.value?.getBoundingClientRect()
  const px = rect ? rect.width / 2 : 0
  const py = rect ? rect.height / 2 : 0
  const vp = viewport.value
  const zoom = clamp(vp.zoom * factor, 0.2, 2.5)
  const worldX = (px - vp.x) / vp.zoom
  const worldY = (py - vp.y) / vp.zoom
  store.setViewport({ x: px - worldX * zoom, y: py - worldY * zoom, zoom })
}

/** 把全部节点装进视口。 */
function fitToContent() {
  const nodes = store.nodes
  const rect = rootEl.value?.getBoundingClientRect()
  if (!nodes.length || !rect) {
    store.setViewport({ x: 0, y: 0, zoom: 1 })
    return
  }
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  const pad = 60
  const zoom = clamp(
    Math.min((rect.width - pad * 2) / (maxX - minX || 1), (rect.height - pad * 2) / (maxY - minY || 1)),
    0.2,
    1.5,
  )
  store.setViewport({
    x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom,
    zoom,
  })
}

// ---------- 空白处按下 ----------

/** 抓手模式：左键拖拽直接平移画布（同 excalidraw 的抓手工具）。 */
const panMode = ref(false)

/** 画布背景设置面板（同 excalidraw 的画布样式面板）。 */
const bgPanelOpen = ref(false)

const backgroundCss = computed(() => backgroundStyle(store.background, viewport.value))

function onBackgroundPointerDown(event: PointerEvent) {
  if (event.button === 2) return
  if (event.pointerType === 'touch') {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touchPoints.size === 1) {
      drag.value = {
        kind: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: viewport.value.x,
        originY: viewport.value.y,
      }
    } else if (touchPoints.size === 2) {
      startPinch()
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    event.preventDefault()
    return
  }
  const world = clientToWorld(event.clientX, event.clientY)
  // 中键、空格、Alt、抓手模式：平移。左键：框选。
  if (event.button === 1 || spaceDown.value || event.altKey || panMode.value) {
    drag.value = {
      kind: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewport.value.x,
      originY: viewport.value.y,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    event.preventDefault()
    return
  }
  drag.value = {
    kind: 'marquee',
    startX: world.x,
    startY: world.y,
    curX: world.x,
    curY: world.y,
    additive: event.shiftKey || event.metaKey || event.ctrlKey,
    moved: false,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function startPinch() {
  const [a, b] = [...touchPoints.values()]
  if (!a || !b) return
  const rect = rootEl.value?.getBoundingClientRect()
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const vp = viewport.value
  pinch = {
    distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    zoom: vp.zoom,
    worldX: (cx - (rect?.left || 0) - vp.x) / vp.zoom,
    worldY: (cy - (rect?.top || 0) - vp.y) / vp.zoom,
    cx: cx - (rect?.left || 0),
    cy: cy - (rect?.top || 0),
  }
  drag.value = { kind: 'none' }
}

// ---------- 节点拖动 ----------

function onNodeDragStart(event: PointerEvent, node: GraphNode) {
  let ids: string[]
  if (event.altKey) {
    // Alt+拖拽 = 拖一份副本（同 excalidraw）：复制后选中副本，拖的是副本。
    store.duplicateNodes([node.id])
    ids = [...store.selectedNodeIds]
  } else {
    const selected = store.selectedNodeIds.includes(node.id)
    if (!selected) {
      // 多选：shift 加选（同 excalidraw），cmd/ctrl 也保留。
      store.selectNodes([node.id], event.shiftKey || event.metaKey || event.ctrlKey)
    }
    ids = store.selectedNodeIds.includes(node.id) ? [...store.selectedNodeIds] : [node.id]
  }
  // 编组：拖组里任何一个成员，整组一起走。
  ids = [...new Set(ids.flatMap((id) => store.groupMembers(id)))]
  const origins: Record<string, { x: number; y: number }> = {}
  for (const id of ids) {
    const target = store.nodes.find((item) => item.id === id)
    if (target) origins[id] = { x: target.x, y: target.y }
  }
  const world = clientToWorld(event.clientX, event.clientY)
  drag.value = {
    kind: 'node',
    ids,
    startWorldX: world.x,
    startWorldY: world.y,
    origins,
    moved: false,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

// ---------- 节点缩放 ----------

/** 拖右下角改宽高：同一次拖动只留一条撤销记录。 */
function onNodeResizeStart(event: PointerEvent, node: GraphNode) {
  const world = clientToWorld(event.clientX, event.clientY)
  store.selectNodes([node.id], false)
  drag.value = {
    kind: 'resize',
    id: node.id,
    startWorldX: world.x,
    startWorldY: world.y,
    width: node.width,
    height: node.height,
    moved: false,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  event.preventDefault()
}

// ---------- 连线 ----------

/** 选中连线后拖动端点：另一端保持不动，落点决定新的节点与边框位置。 */
function onReconnectStart(id: string, which: 'source' | 'target', event: PointerEvent) {
  const world = clientToWorld(event.clientX, event.clientY)
  drag.value = { kind: 'reconnect', edgeId: id, which, x: world.x, y: world.y, moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  event.preventDefault()
}

function onConnectStart(event: PointerEvent, node: GraphNode) {
  const world = clientToWorld(event.clientX, event.clientY)
  const hinted = (event.target as HTMLElement | null)?.dataset?.anchor as AnchorSide | undefined
  const anchor = anchorForPoint(node, world)
  const side = hinted || anchor.side
  // 从哪条边的哪一段出发：按拖出来的那条边算比例，角上也不会串边。
  const offset =
    side === 'top' || side === 'bottom'
      ? clamp((world.x - node.x) / (node.width || 1), 0, 1)
      : clamp((world.y - node.y) / (node.height || 1), 0, 1)
  drag.value = {
    kind: 'connect',
    source: node.id,
    side,
    offset,
    x: world.x,
    y: world.y,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  event.preventDefault()
}

/** 命中测试：世界坐标点落在哪个节点上。 */
function nodeAt(worldX: number, worldY: number): GraphNode | null {
  return nodeAtPoint(store.nodes, worldX, worldY)
}

/** 连线落点：先精确命中，再按 24 屏幕像素吸附，缩放后手感一致。 */
function connectTarget(worldX: number, worldY: number): GraphNode | null {
  return connectTargetAt(store.nodes, worldX, worldY, 24 / (viewport.value.zoom || 1))
}

/** 拖线时指针停在哪个节点上（空串表示空白处），用来点亮目标节点。 */
const connectHoverId = computed(() => {
  const state = drag.value
  if (state.kind !== 'connect') return ''
  const hit = connectTarget(state.x, state.y)
  return hit && hit.id !== state.source ? hit.id : ''
})

// ---------- 指针移动与抬起 ----------

function onPointerMove(event: PointerEvent) {
  if (touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  if (pinch && touchPoints.size >= 2) {
    const [a, b] = [...touchPoints.values()]
    if (a && b) {
      const zoom = clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance), 0.2, 2.5)
      store.setViewport({
        x: pinch.cx - pinch.worldX * zoom,
        y: pinch.cy - pinch.worldY * zoom,
        zoom,
      })
    }
    return
  }
  const state = drag.value
  if (state.kind === 'none') return
  if (state.kind === 'pan') {
    store.setViewport({
      x: state.originX + (event.clientX - state.startClientX),
      y: state.originY + (event.clientY - state.startClientY),
      zoom: viewport.value.zoom,
    })
    return
  }
  const world = clientToWorld(event.clientX, event.clientY)
  if (state.kind === 'marquee') {
    state.curX = world.x
    state.curY = world.y
    if (Math.abs(world.x - state.startX) > 2 || Math.abs(world.y - state.startY) > 2) {
      state.moved = true
    }
    return
  }
  if (state.kind === 'node') {
    let dx = world.x - state.startWorldX
    let dy = world.y - state.startWorldY
    if (!state.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    if (!state.moved) {
      // 第一次真的动了才压栈：单击节点不该留下一条空撤销记录。
      store.beginDrag()
      state.moved = true
    }
    const movingIds = new Set(state.ids)
    const moving = state.ids
      .map((id) => store.nodes.find((item) => item.id === id))
      .filter((item): item is GraphNode => !!item)
      .map((item) => ({ x: item.x + dx, y: item.y + dy, width: item.width, height: item.height }))
    const others = store.nodes.filter((item) => !movingIds.has(item.id))
    const result = computeGuides(moving, others, 6 / viewport.value.zoom)
    dx += result.dx
    dy += result.dy
    // 网格吸附：先按第一个被拖节点对齐，整组保持相对位置。
    const anchorId = state.ids[0]
    const anchorOrigin = anchorId ? state.origins[anchorId] : null
    if (store.settings.snap && anchorOrigin) {
      const grid = store.settings.gridSize || 8
      dx += snapToGrid(anchorOrigin.x + dx, grid) - (anchorOrigin.x + dx)
      dy += snapToGrid(anchorOrigin.y + dy, grid) - (anchorOrigin.y + dy)
    }
    guideLines.value = result.guides
    store.moveNodes(state.origins, dx, dy)
    return
  }
  if (state.kind === 'resize') {
    const dx = world.x - state.startWorldX
    const dy = world.y - state.startWorldY
    if (!state.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    if (!state.moved) {
      store.beginDrag()
      state.moved = true
    }
    store.resizeNode(state.id, state.width + dx, state.height + dy)
    return
  }
  if (state.kind === 'connect') {
    state.x = world.x
    state.y = world.y
    return
  }
  if (state.kind === 'reconnect') {
    state.x = world.x
    state.y = world.y
    state.moved = true
  }
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    touchPoints.delete(event.pointerId)
    if (touchPoints.size < 2) pinch = null
    if (touchPoints.size === 0) {
      drag.value = { kind: 'none' }
      guideLines.value = []
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    return
  }
  const state = drag.value
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  drag.value = { kind: 'none' }
  guideLines.value = []

  if (state.kind === 'marquee') {
    if (!state.moved) {
      // 点空白：清空选择并收起面板。
      store.clearSelection()
      store.closePanel()
      return
    }
    const left = Math.min(state.startX, state.curX)
    const top = Math.min(state.startY, state.curY)
    const right = Math.max(state.startX, state.curX)
    const bottom = Math.max(state.startY, state.curY)
    const hit = store.nodes
      .filter(
        (node) =>
          node.x < right &&
          node.x + node.width > left &&
          node.y < bottom &&
          node.y + node.height > top,
      )
      .map((node) => node.id)
    store.selectNodes(hit, state.additive)
    return
  }
  if (state.kind === 'node') {
    if (!state.moved) {
      // 只是点了一下节点：当作选中。
      store.selectNodes(state.ids, false)
    }
    return
  }
  if (state.kind === 'resize') return
  if (state.kind === 'connect') {
    const world = clientToWorld(event.clientX, event.clientY)
    const target = connectTarget(world.x, world.y)
    if (target && target.id !== state.source) {
      // 自己连自己、同方向重复连线都由 store 挡下。
      const from: GraphEdgeAnchor = { side: state.side, offset: state.offset }
      const ok = store.addEdge(state.source, target.id, '', from, anchorForPoint(target, world))
      if (!ok) ElMessage.info('这两个节点之间已经有一条连线了')
    } else if (!target) {
      // 拖到空白处：保留悬空端点，之后再拖到节点上接上。
      const from: GraphEdgeAnchor = { side: state.side, offset: state.offset }
      store.addEdge(state.source, '', '', from, undefined, { targetPoint: world })
    }
    return
  }
  if (state.kind === 'reconnect') {
    if (!state.moved) return
    const world = clientToWorld(event.clientX, event.clientY)
    const target = connectTarget(world.x, world.y)
    if (!target) {
      store.reconnectEdge(state.edgeId, state.which, '', undefined, world)
      return
    }
    const ok = store.reconnectEdge(
      state.edgeId,
      state.which,
      target.id,
      anchorForPoint(target, world),
    )
    if (!ok) ElMessage.info('不能连到同一个节点，或这条连线已经存在')
  }
}

// ---------- 键盘 ----------

/**
 * 剪贴板：优先写系统剪贴板（同 excalidraw），
 * 浏览器不给权限时退回到内存里的这一份，快捷键仍然可用。
 */
const CLIP_PREFIX = 'metamatrix:nodegraph:'
let memoryClipboard: string | null = null
const clipboardReady = ref(false)

function serializeSelection(cut = false): string | null {
  const payload = store.copySelection()
  if (!payload) return null
  const text = CLIP_PREFIX + JSON.stringify(payload)
  memoryClipboard = text
  clipboardReady.value = true
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  if (cut) store.deleteSelection()
  return text
}

async function readClipboard(): Promise<string | null> {
  try {
    const text = await navigator.clipboard?.readText()
    if (text && text.startsWith(CLIP_PREFIX)) return text
  } catch {
    /* 读系统剪贴板需要权限，失败就用内存里的 */
  }
  return memoryClipboard
}

async function pasteFromClipboard() {
  const text = await readClipboard()
  if (!text) {
    ElMessage.info('剪贴板里没有可粘贴的节点')
    return
  }
  // 剪贴板不是画布节点时按纯文本粘贴：一段文字直接变成富文本节点，省一次复制粘贴。
  if (!text.startsWith(CLIP_PREFIX)) {
    addTextFromClipboard(text)
    return
  }
  try {
    const payload = JSON.parse(text.slice(CLIP_PREFIX.length))
    const rect = rootEl.value?.getBoundingClientRect()
    const vp = viewport.value
    const origin = rect
      ? {
          x: Math.round((rect.width / 2 - vp.x) / vp.zoom - DEFAULT_NODE_WIDTH / 2),
          y: Math.round((rect.height / 2 - vp.y) / vp.zoom - DEFAULT_NODE_HEIGHT / 2),
        }
      : undefined
    store.pasteSubgraph(payload, origin)
  } catch {
    ElMessage.warning('剪贴板内容不是节点画布')
  }
}

/** 把剪贴板里的纯文本变成视口中央的富文本节点；太长的截断成标题，全文进正文。 */
function addTextFromClipboard(text: string) {
  const spot = centerSpot()
  const node = store.addNode('richtext', spot.x, spot.y)
  const trimmed = text.trim().slice(0, 5000)
  const firstLine = trimmed.split(/\r?\n/, 1)[0].slice(0, 60)
  const escaped = escapeHtml(trimmed).replace(/\r?\n/g, '<br>')
  store.updateNode(node.id, {
    title: firstLine || '粘贴文本',
    content: '<p>' + escaped + '</p>',
  })
  store.selectNodes([node.id])
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true
  )
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === ' ' && !isTypingTarget(event.target)) {
    spaceDown.value = true
    return
  }
  if (isTypingTarget(event.target)) return
  if (event.key === '?') {
    event.preventDefault()
    helpOpen.value = true
    return
  }
  if (props.readonly) {
    if (event.key === 'Escape') store.clearSelection()
    return
  }
  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) store.redo()
    else store.undo()
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'y') {
    event.preventDefault()
    store.redo()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (store.selectedNodeIds.length || store.selectedEdgeIds.length) {
      event.preventDefault()
      store.deleteSelection()
    }
    return
  }
  if (event.key === 'Escape') {
    store.clearSelection()
    store.closePanel()
    return
  }
  // 方向键微调（同 excalidraw）：默认 1px，Shift 走大步长。
  const step = event.shiftKey ? 10 : 1
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    store.nudgeNodes(-step, 0)
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    store.nudgeNodes(step, 0)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    store.nudgeNodes(0, -step)
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    store.nudgeNodes(0, step)
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'd') {
    // 复制选中节点（同 excalidraw 的 Cmd/Ctrl+D）。
    event.preventDefault()
    store.duplicateNodes([])
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'a') {
    event.preventDefault()
    store.selectAll()
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'f') {
    event.preventDefault()
    searchOpen.value = true
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'c') {
    if (store.selectedNodeIds.length) {
      event.preventDefault()
      serializeSelection()
    }
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'x') {
    if (store.selectedNodeIds.length) {
      event.preventDefault()
      serializeSelection(true)
    }
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === 'v') {
    event.preventDefault()
    void pasteFromClipboard()
    return
  }
  if ((event.metaKey || event.ctrlKey) && key === '0') {
    // 缩放回到 100%（同 excalidraw 的 Cmd/Ctrl+0）。
    event.preventDefault()
    store.setViewport({ ...viewport.value, zoom: 1 })
    return
  }
  if (key === 'h') {
    // 抓手工具（同 excalidraw 的 H）：左键拖拽平移画布。
    event.preventDefault()
    panMode.value = !panMode.value
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key === ' ') spaceDown.value = false
}

// ---------- 工具栏 ----------

function centerSpot() {
  const rect = rootEl.value?.getBoundingClientRect()
  const vp = viewport.value
  const width = rect ? rect.width : 800
  const height = rect ? rect.height : 600
  const baseX = (width / 2 - vp.x) / vp.zoom - DEFAULT_NODE_WIDTH / 2
  const baseY = (height / 2 - vp.y) / vp.zoom - DEFAULT_NODE_HEIGHT / 2
  // 新节点一律落在正中心会严丝合缝地叠在一起：压在下面的那个根本点不到。
  // 从中心开始按网格找第一个不重叠的位置。
  return findFreeSpot(store.nodes, baseX, baseY)
}

function addNodeAtCenter(type: NodeGraphNodeType) {
  const { x, y } = centerSpot()
  store.addNode(type, x, y)
}

/* 画布节点：先选目标（92 个画布之一或本项目画布），目标创建后不可更改。 */
const pickerOpen = ref(false)
const pickerSpot = ref({ x: 0, y: 0 })
/** 选画布时的搜索词：按画布名与说明过滤。 */
const pickerQuery = ref('')

/* ---------------- 右键菜单（同 excalidraw） ---------------- */

const ctxOpen = ref(false)
const helpOpen = ref(false)
const ctxPos = ref({ x: 0, y: 0 })
/** 右键落点上的节点：决定菜单里出现哪些节点操作。 */
const ctxNode = ref<GraphNode | null>(null)
/** 上下游追踪：鼠标停在节点上时高亮整条链路。 */
const traceNodeId = ref<string | null>(null)
/** 拖动时的智能参考线。 */
const guideLines = ref<Guide[]>([])
/** 同浏览器多标签协作光标。 */
const peers = ref<PeerCursor[]>([])
let presence: ReturnType<typeof createPresence> | null = null
let lastPresenceAt = 0

function onContextMenu(event: MouseEvent) {
  const world = clientToWorld(event.clientX, event.clientY)
  const hit = nodeAt(world.x, world.y)
  if (hit && !store.selectedNodeIds.includes(hit.id)) {
    store.selectNodes(store.groupMembers(hit.id), false)
  }
  ctxNode.value = hit
  ctxPos.value = { x: event.clientX, y: event.clientY }
  ctxOpen.value = true
}

function closeContextMenu() {
  ctxOpen.value = false
  ctxNode.value = null
}

// ---------- 节点操作 ----------

function onRename(id: string, title: string) {
  store.updateNode(id, { title })
}

function onQuickEdit(id: string, html: string) {
  store.updateNode(id, { content: html })
}

function onToggleLock(id: string) {
  const node = store.nodes.find((item) => item.id === id)
  if (node) store.setLocked(store.groupMembers(id), !node.locked)
}

function onToggleCollapse(id: string) {
  const node = store.nodes.find((item) => item.id === id)
  if (node) store.setCollapsed(store.groupMembers(id), !node.collapsed)
}

function onNodeContextMenu(event: MouseEvent, node: GraphNode) {
  if (!store.selectedNodeIds.includes(node.id)) store.selectNodes(store.groupMembers(node.id), false)
  ctxNode.value = node
  ctxPos.value = { x: event.clientX, y: event.clientY }
  ctxOpen.value = true
}

/** 上下游追踪：沿有向边双向扩一圈，返回命中的节点与连线。 */
const trace = computed(() => {
  const start = traceNodeId.value
  if (!start) return null
  const nodes = new Set<string>([start])
  const edges = new Set<string>()
  let frontier = [start]
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      for (const edge of store.edges) {
        const other = edge.source === id ? edge.target : edge.target === id ? edge.source : ''
        if (!other || nodes.has(other)) continue
        nodes.add(other)
        edges.add(edge.id)
        next.push(other)
      }
    }
    frontier = next
  }
  return { nodes, edges: [...edges] }
})

/** 导出画布为图片：PNG / JPG / SVG；只导选中时按子图裁剪。 */
async function runExport(format: ExportFormat, onlySelection = false) {
  const ids = onlySelection ? store.selectedNodeIds : []
  if (onlySelection && !ids.length) {
    ElMessage.info('先选中要导出的节点')
    return
  }
  try {
    await exportNodeGraphImage(store.nodes, store.edges, format, store.title, store.background, ids)
    ElMessage.success(`已导出 ${format.toUpperCase()} 图片`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导出图片失败')
  }
}

function downloadText(text: string, ext: string, mime: string) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = (store.title || '画布') + '.' + ext
  link.click()
  URL.revokeObjectURL(url)
}

/** 结构化导出：保留节点属性与连线，方便再导入或做外部处理。 */
function structuredExport() {
  return {
    title: store.title,
    exportedAt: new Date().toISOString(),
    nodes: store.nodes,
    edges: store.edges,
    settings: store.settings,
  }
}

function toMarkdown(): string {
  const lines = ['# ' + (store.title || '节点画布'), '']
  for (const node of store.nodes) {
    const progress = typeof node.progress === 'number' ? `（${node.progress}%）` : ''
    const lock = node.locked ? ' 🔒' : ''
    lines.push(`## ${node.title || '未命名节点'}${progress}${lock}`)
    if (node.description) lines.push('', node.description)
    const tags = node.tags?.length ? `\n\n标签：${node.tags.join('、')}` : ''
    if (tags) lines.push(tags)
    const next = store.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => store.nodes.find((item) => item.id === edge.target)?.title || '悬空端点')
    if (next.length) lines.push('', '下游：' + next.join('、'))
    lines.push('')
  }
  return lines.join('\n')
}

/** 打印 / 另存 PDF：用浏览器打印走矢量 SVG，不引入 PDF 依赖。 */
function printCanvas() {
  const svg = buildNodeGraphSvg(store.nodes, store.edges, store.background)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open('', '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    ElMessage.warning('浏览器拦截了打印窗口，请允许弹窗后重试')
    return
  }
  win.document.write(
    '<html><head><title>' + (store.title || '节点画布') + '</title>' +
      '<style>body{margin:0;padding:16px;display:flex;justify-content:center}img{max-width:100%}</style>' +
      '</head><body><img src="' + url + '" onload="window.print()"></body></html>',
  )
  win.document.close()
}

function onContextAction(id: string) {
  const node = ctxNode.value
  closeContextMenu()
  switch (id) {
    case 'rename':
      if (node) {
        void ElMessageBox.prompt('节点名称', '重命名节点', {
          inputValue: node.title,
          confirmButtonText: '保存',
          cancelButtonText: '取消',
        })
          .then(({ value }) => store.updateNode(node.id, { title: value.trim().slice(0, 120) }))
          .catch(() => undefined)
      }
      return
    case 'node-lock':
      if (node) store.setLocked(store.selectedNodeIds.length ? [...store.selectedNodeIds] : [node.id], !node.locked)
      return
    case 'node-collapse':
      if (node) store.setCollapsed(store.selectedNodeIds.length ? [...store.selectedNodeIds] : [node.id], !node.collapsed)
      return
    case 'node-front':
      store.reorderNodes(store.selectedNodeIds.length ? [...store.selectedNodeIds] : node ? [node.id] : [], 'front')
      return
    case 'node-back':
      store.reorderNodes(store.selectedNodeIds.length ? [...store.selectedNodeIds] : node ? [node.id] : [], 'back')
      return
    case 'group':
      store.groupSelection()
      return
    case 'ungroup':
      store.ungroupSelection()
      return
    case 'copy-style':
      if (node) store.copyNodeStyle(node.id)
      return
    case 'paste-style':
      store.pasteNodeStyle(store.selectedNodeIds)
      return
    case 'comments':
      if (node) emit('openComments', node.id)
      return
    case 'export-json':
      downloadText(JSON.stringify(structuredExport(), null, 2), 'json', 'application/json')
      return
    case 'export-markdown':
      downloadText(toMarkdown(), 'md', 'text/markdown')
      return
    case 'export-print':
      printCanvas()
      return
    case 'duplicate':
      store.duplicateNodes([])
      return
    case 'copy':
      serializeSelection()
      return
    case 'cut':
      serializeSelection(true)
      return
    case 'paste':
      void pasteFromClipboard()
      return
    case 'delete':
      store.deleteSelection()
      return
    case 'selectAll':
      store.selectAll()
      return
    case 'fit':
      fitToContent()
      return
    case 'reset-zoom':
      resetZoom()
      return
    case 'zoom-in':
      zoomBy(1.1)
      return
    case 'zoom-out':
      zoomBy(1 / 1.1)
      return
    case 'undo':
      store.undo()
      return
    case 'redo':
      store.redo()
      return
    case 'add-text':
      addNodeAtCenter('richtext')
      return
    case 'add-canvas':
      requestCanvasNode()
      return
    case 'export-png':
    case 'export-jpg':
    case 'export-svg':
      void runExport(id.slice('export-'.length) as ExportFormat)
      return
    case 'export-selection-png':
    case 'export-selection-svg':
      void runExport(id.endsWith('png') ? 'png' : 'svg', true)
      return
    case 'stats':
      statsOpen.value = true
      return
    case 'search':
      searchOpen.value = true
      return
    default:
      if (id.startsWith('node-color:')) {
        const color = id.slice('node-color:'.length) || undefined
        store.setNodeColor(store.selectedNodeIds.length ? [...store.selectedNodeIds] : node ? [node.id] : [], color)
        return
      }
      if (id.startsWith('align-')) {
        store.alignSelection(id.slice('align-'.length) as AlignMode)
        return
      }
      if (id.startsWith('layout-')) {
        store.autoLayout(id.slice('layout-'.length) as LayoutMode)
        return
      }
  }
}

function requestCanvasNode() {
  pickerSpot.value = centerSpot()
  pickerOpen.value = true
}

function createCanvasNode(target: { refTemplateId?: string; refCanvasId?: string }) {
  store.addNode('canvasRef', pickerSpot.value.x, pickerSpot.value.y, target)
  pickerOpen.value = false
}

/**
 * 画布库按「分类 → 级」两级排开，和引导页用的是同一套口径（GUIDE_LANES）。
 * 92 张画布平铺一屏没法看，分组之后一眼就知道该去哪一类。
 */
const templateGroups = computed(() => {
  const groups: PickerGroup[] = (Object.keys(GUIDE_LANES) as TemplateCategory[]).map(
    (category) => {
      const lanes = GUIDE_LANES[category].map((lane) => ({
        id: lane.id,
        title: lane.title,
        hint: lane.hint || '',
        items: lane.ids.map((id) => ({
          id,
          name: TEMPLATE_META[id].name,
          description: TEMPLATE_META[id].description,
        })),
      }))
      return {
        key: category,
        label: CATEGORY_LABELS[category],
        count: lanes.reduce((sum, lane) => sum + lane.items.length, 0),
        lanes,
      }
    },
  )
  return filterTemplateGroups(groups, pickerQuery.value)
})

/** 项目内画布也按搜索词过滤。 */
const projectCanvases = computed(() =>
  props.canvases.filter((item) => matchTemplate(item.title, '', pickerQuery.value)),
)

/** 搜索结果总数（含项目画布）。 */
const pickerTotal = computed(
  () =>
    templateGroups.value.reduce((sum, group) => sum + group.count, 0) +
    projectCanvases.value.length,
)

/** 项目内画布的引用问题：自己、环引用都要拦下来。 */
function projectCanvasProblem(canvasId: string): string {
  const problem = findRefProblem({
    selfCanvasId: props.currentCanvasId,
    targetCanvasId: canvasId,
    refs: props.refs || {},
  })
  return problem ? refProblemMessage(problem) : ''
}

function openPanel(id: string) {
  store.openPanel(id)
}

function selectEdge(id: string) {
  store.selectEdges([id])
  store.selectNodes([], false)
}

function editLabel(id: string, label: string) {
  store.updateEdgeLabel(id, label)
}

/** 当前选中的唯一一条连线：浮动样式面板据此显示。 */
const selectedEdge = computed<GraphEdge | null>(() => {
  if (store.selectedEdgeIds.length !== 1) return null
  return store.edges.find((edge) => edge.id === store.selectedEdgeIds[0]) || null
})

/** 编组容器：同 groupId 的节点外面套一圈虚线。 */
const groupBoxes = computed(() => {
  const map = new Map<string, GraphNode[]>()
  for (const node of store.nodes) {
    if (!node.groupId) continue
    const list = map.get(node.groupId) || []
    list.push(node)
    map.set(node.groupId, list)
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([id, list]) => {
      const minX = Math.min(...list.map((node) => node.x))
      const minY = Math.min(...list.map((node) => node.y))
      const maxX = Math.max(...list.map((node) => node.x + node.width))
      const maxY = Math.max(...list.map((node) => node.y + node.height))
      return { id, left: minX - 16, top: minY - 16, width: maxX - minX + 32, height: maxY - minY + 32 }
    })
})

const pending = computed(() => (drag.value.kind === 'connect' ? drag.value : null))
const reconnecting = computed(() => (drag.value.kind === 'reconnect' ? drag.value : null))

/* ---------------- 选区工具条（多选对齐） ---------------- */

/** 选区包围盒（屏幕坐标）。两个及以上节点选中时浮在选区上方。 */
const selectionBox = computed(() => {
  const ids = store.selectedNodeIds
  if (ids.length < 2) return null
  const picked = store.nodes.filter((node) => ids.includes(node.id))
  if (picked.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  for (const node of picked) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
  }
  const vp = viewport.value
  return {
    left: minX * vp.zoom + vp.x,
    top: minY * vp.zoom + vp.y,
    width: (maxX - minX) * vp.zoom,
  }
})

const ALIGN_ACTIONS: { mode: AlignMode | DistributeMode; title: string; icon: string }[] = [
  { mode: 'left', title: '左对齐', icon: 'left' },
  { mode: 'center', title: '水平居中', icon: 'center' },
  { mode: 'right', title: '右对齐', icon: 'right' },
  { mode: 'top', title: '顶对齐', icon: 'top' },
  { mode: 'middle', title: '垂直居中', icon: 'middle' },
  { mode: 'bottom', title: '底对齐', icon: 'bottom' },
  { mode: 'horizontal', title: '水平分布', icon: 'distribute-h' },
  { mode: 'vertical', title: '垂直分布', icon: 'distribute-v' },
]

function align(mode: AlignMode | DistributeMode) {
  store.alignSelection(mode)
}

/* ---------------- 缩略图 ---------------- */

/** 画布可视区尺寸：缩略图要按它算当前视口的位置。 */
const canvasSize = ref({ width: 0, height: 0 })
let sizeObserver: ResizeObserver | null = null

function syncCanvasSize() {
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  canvasSize.value = { width: rect.width, height: rect.height }
}

/** 点缩略图：把该世界坐标挪到视口中心。 */
function navigateTo(worldX: number, worldY: number) {
  const vp = viewport.value
  const rect = rootEl.value?.getBoundingClientRect()
  const w = rect ? rect.width : canvasSize.value.width
  const h = rect ? rect.height : canvasSize.value.height
  store.setViewport({
    x: -worldX * vp.zoom + w / 2,
    y: -worldY * vp.zoom + h / 2,
    zoom: vp.zoom,
  })
}

/* ---------------- 可视区裁剪（节点多时只渲染看得见的） ---------------- */

/** 只有节点超过 300 个才启用裁剪：小画布全量渲染，搜索高亮也不会漏。 */
const CULL_THRESHOLD = 300

const visibleNodes = computed(() => {
  const all = store.nodes
  if (all.length <= CULL_THRESHOLD) return all
  const { width, height } = canvasSize.value
  if (!width || !height) return all
  const vp = viewport.value
  const margin = 260
  const left = -vp.x / vp.zoom - margin
  const top = -vp.y / vp.zoom - margin
  const right = (width - vp.x) / vp.zoom + margin
  const bottom = (height - vp.y) / vp.zoom + margin
  return all.filter(
    (node) =>
      node.x < right &&
      node.x + node.width > left &&
      node.y < bottom &&
      node.y + node.height > top,
  )
})

/** 连线只要有一端在可视区就画：跨屏的长线不会整条消失。 */
const visibleEdges = computed(() => {
  if (store.nodes.length <= CULL_THRESHOLD) return store.edges
  const ids = new Set(visibleNodes.value.map((node) => node.id))
  return store.edges.filter((edge) => ids.has(edge.source) || ids.has(edge.target))
})

/* ---------------- 节点搜索（逐个命中并居中） ---------------- */

const searchOpen = ref(false)
const searchQuery = ref('')
const searchIndex = ref(0)

const searchMatches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return store.nodes.filter((node) => {
    const text = [node.title, node.description, node.content].filter(Boolean).join(' ')
    return text.toLowerCase().includes(q)
  })
})

const highlightedNodeId = computed(() => {
  if (!searchOpen.value || !searchMatches.value.length) return null
  return searchMatches.value[Math.min(searchIndex.value, searchMatches.value.length - 1)].id
})

function centerOnNode(id: string) {
  const node = store.nodes.find((item) => item.id === id)
  if (!node) return
  navigateTo(node.x + node.width / 2, node.y + node.height / 2)
}

function stepSearch(delta: number) {
  const total = searchMatches.value.length
  if (!total) return
  searchIndex.value = (searchIndex.value + delta + total) % total
  centerOnNode(searchMatches.value[searchIndex.value].id)
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) searchQuery.value = ''
}

/* ---------------- 画布统计 ---------------- */

const statsOpen = ref(false)
const stats = computed(() => computeStats(store.nodes, store.edges))
const statBars = computed(() =>
  Object.entries(stats.value.byType).map(([label, count]) => ({
    label,
    count,
    percent: stats.value.nodes ? Math.round((count / stats.value.nodes) * 100) : 0,
  })),
)

/* ---------------- 无限画布工作区提示 ---------------- */

/** 内容外扩 1600px 的虚线框：平移出这一圈时会提示回内容区。 */
const WORLD_PAD = 1600
const worldFrame = computed(() => {
  const nodes = store.nodes
  if (!nodes.length) return null
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
  return { left: minX - WORLD_PAD, top: minY - WORLD_PAD, width: maxX - minX + WORLD_PAD * 2, height: maxY - minY + WORLD_PAD * 2 }
})

const outsideWorld = computed(() => {
  const frame = worldFrame.value
  if (!frame || !canvasSize.value.width) return false
  const vp = viewport.value
  const cx = (canvasSize.value.width / 2 - vp.x) / vp.zoom
  const cy = (canvasSize.value.height / 2 - vp.y) / vp.zoom
  return cx < frame.left || cx > frame.left + frame.width || cy < frame.top || cy > frame.top + frame.height
})

const marqueeStyle = computed(() => {
  const state = drag.value
  if (state.kind !== 'marquee' || !state.moved) return null
  // 框选矩形记的是世界坐标，画在屏幕坐标系里要按视口换算，
  // 否则方框会偏在视口平移量之外，看起来不跟手。
  const rect = marqueeRect(state.startX, state.startY, state.curX, state.curY, viewport.value)
  return {
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  }
})

/** 点画布空白处：关掉右键菜单与说明面板。 */
function onCanvasPointerDown(event: PointerEvent) {
  // 菜单与工具面板自己就在画布容器里：在它们身上按下时不能关，
  // 否则菜单会在 click 之前被卸载，菜单项点了没反应。
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.ng-ctx, .ng-toolbar')) return
  if (ctxOpen.value) closeContextMenu()
  if (helpOpen.value) helpOpen.value = false
}

function onPointerActivity(event: PointerEvent) {
  if (!presence) return
  const now = performance.now()
  if (now - lastPresenceAt < 80) return
  lastPresenceAt = now
  const world = clientToWorld(event.clientX, event.clientY)
  presence.send(world.x, world.y)
}

function currentUserId(): string {
  try {
    const raw = localStorage.getItem('metamatrix:user')
    const parsed = raw ? (JSON.parse(raw) as { id?: string; email?: string }) : null
    return parsed?.id || parsed?.email || 'me'
  } catch {
    return 'me'
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointermove', onPointerActivity)
  presence = createPresence(
    'canvas:' + props.currentCanvasId,
    { id: currentUserId(), name: '我' },
    (list) => { peers.value = list },
  )
  syncCanvasSize()
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    sizeObserver = new ResizeObserver(() => syncCanvasSize())
    sizeObserver.observe(rootEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointermove', onPointerActivity)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  presence?.destroy()
  presence = null
  sizeObserver?.disconnect()
  sizeObserver = null
})
</script>

<template>
  <div
    ref="rootEl"
    class="ng-root"
    :class="{ 'is-pan': panMode, 'is-panning': drag?.kind === 'pan' }"
    :style="backgroundCss"
    @wheel="onWheel"
    @contextmenu.prevent="onContextMenu"
    @pointerdown="onCanvasPointerDown"
  >
    <div class="ng-bg" @pointerdown="onBackgroundPointerDown"></div>

    <div class="ng-world" :style="worldStyle">
      <!-- 工作区边界：无限画布上没有硬墙，但要让用户知道内容都在这圈里 -->
      <div
        v-if="worldFrame"
        class="ng-world-frame"
        :style="{
          left: worldFrame.left + 'px',
          top: worldFrame.top + 'px',
          width: worldFrame.width + 'px',
          height: worldFrame.height + 'px',
        }"
      >
        <span class="ng-world-frame__label">画布工作区</span>
      </div>
      <!-- 编组容器：同组节点落在同一个虚线框里 -->
      <div
        v-for="box in groupBoxes"
        :key="'group-' + box.id"
        class="ng-group-box"
        :style="{
          left: box.left + 'px',
          top: box.top + 'px',
          width: box.width + 'px',
          height: box.height + 'px',
        }"
      ></div>

      <!-- 智能参考线：拖动时和别的节点边/中线对齐 -->
      <div
        v-for="(guide, index) in guideLines"
        :key="'guide-' + index"
        class="ng-guide"
        :class="'ng-guide--' + guide.orientation"
        :style="guide.orientation === 'v'
          ? { left: guide.at + 'px', top: guide.from + 'px', height: (guide.to - guide.from) + 'px' }
          : { top: guide.at + 'px', left: guide.from + 'px', width: (guide.to - guide.from) + 'px' }"
      ></div>

      <NodeGraphEdgeLayer
        :nodes="visibleNodes"
        :edges="visibleEdges"
        :selected-edge-ids="store.selectedEdgeIds"
        :pending="pending"
        :reconnect="reconnecting"
        :focus-edge-ids="trace ? trace.edges : null"
        @select-edge="selectEdge"
        @edit-label="editLabel"
        @reconnect-start="onReconnectStart"
      />
      <NodeGraphNode
        v-for="node in visibleNodes"
        :key="node.id"
        :node="node"
        :selected="store.selectedNodeIds.includes(node.id)"
        :highlighted="highlightedNodeId === node.id"
        :readonly="props.readonly"
        :dimmed="!!trace && !trace.nodes.has(node.id)"
        :comment-count="store.commentsOf(node.id).filter((item) => !item.resolved).length"
        :connect-ready="connectHoverId === node.id"
        :canvases="props.canvases"
        @open-panel="openPanel"
        @open-editor="(id: string) => emit('openEditor', id)"
        @drag-start="onNodeDragStart"
        @connect-start="onConnectStart"
        @resize-start="onNodeResizeStart"
        @rename="onRename"
        @quick-edit="onQuickEdit"
        @toggle-collapse="onToggleCollapse"
        @toggle-lock="onToggleLock"
        @context-menu="onNodeContextMenu"
        @open-comments="(id: string) => emit('openComments', id)"
        @pointerenter="traceNodeId = node.id"
        @pointerleave="traceNodeId = null"
      />

      <!-- 同浏览器多标签协作光标 -->
      <div
        v-for="peer in peers"
        :key="'peer-' + peer.id"
        class="ng-peer"
        :style="{ transform: 'translate(' + peer.x + 'px,' + peer.y + 'px)', color: peer.color }"
      >
        <i :style="{ background: peer.color }"></i>
        <span>{{ peer.name }}</span>
      </div>
    </div>

    <button v-if="outsideWorld" type="button" class="ng-world-back" @click="fitToContent">
      回到内容区
    </button>

    <div v-if="marqueeStyle" class="ng-marquee" :style="marqueeStyle"></div>

    <!-- 选区工具条：多选后浮在选区上方，做对齐与分布 -->
    <div
      v-if="selectionBox && !props.readonly"
      class="ng-selection-tools"
      :style="{
        left: selectionBox.left + selectionBox.width / 2 + 'px',
        top: selectionBox.top - 44 + 'px',
      }"
      @pointerdown.stop
      @click.stop
    >
      <button
        v-for="action in ALIGN_ACTIONS"
        :key="action.mode"
        type="button"
        class="ng-selection-tool"
        :title="action.title"
        :aria-label="action.title"
        @click="align(action.mode)"
      >
        <AlignIcon :icon="action.icon" />
      </button>
    </div>

    <!-- 浮动工具面板（同 excalidraw：左上角一块小面板，图标 + 分隔线） -->
    <div v-if="!props.readonly" class="ng-toolbar mm-bar__group" role="toolbar" aria-label="画布工具">
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :disabled="!store.canUndo"
        title="撤销 (Cmd/Ctrl+Z)"
        aria-label="撤销"
        @click="store.undo()"
      >
        <el-icon><RefreshLeft /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :disabled="!store.canRedo"
        title="重做 (Cmd/Ctrl+Shift+Z)"
        aria-label="重做"
        @click="store.redo()"
      >
        <el-icon><RefreshRight /></el-icon>
      </button>
      <span class="ng-tool-sep mm-bar__divider"></span>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        title="新建富文本节点"
        aria-label="新建富文本节点"
        @click="addNodeAtCenter('richtext')"
      >
        <el-icon><Document /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        title="新建画布节点"
        aria-label="新建画布节点"
        @click="requestCanvasNode"
      >
        <el-icon><Connection /></el-icon>
      </button>
      <span class="ng-tool-sep mm-bar__divider"></span>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :class="{ 'is-on': bgPanelOpen }"
        title="画布背景"
        aria-label="画布背景"
        :aria-pressed="bgPanelOpen"
        @click="bgPanelOpen = !bgPanelOpen"
      >
        <el-icon><Picture /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :class="{ 'is-on': panMode }"
        title="抓手：拖拽平移画布 (H)"
        aria-label="抓手工具"
        :aria-pressed="panMode"
        @click="panMode = !panMode"
      >
        <el-icon><Pointer /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        title="适应画布"
        aria-label="适应画布"
        @click="fitToContent"
      >
        <el-icon><FullScreen /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :class="{ 'is-on': searchOpen }"
        title="搜索节点 (Cmd/Ctrl+F)"
        aria-label="搜索节点"
        :aria-pressed="searchOpen"
        @click="toggleSearch"
      >
        <el-icon><Search /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :class="{ 'is-on': statsOpen }"
        title="画布统计"
        aria-label="画布统计"
        @click="statsOpen = true"
      >
        <el-icon><DataAnalysis /></el-icon>
      </button>
      <button
        type="button"
        class="ng-tool-btn mm-bar__btn mm-bar__btn--square"
        :class="{ 'is-on': helpOpen }"
        title="快捷键说明"
        aria-label="快捷键说明"
        @click="helpOpen = !helpOpen"
      >
        <el-icon><MoreFilled /></el-icon>
      </button>

      <!-- 说明面板：把原来常驻在工具栏上的长提示收进来，画布保持干净 -->
      <div v-if="helpOpen" class="ng-tool-help" role="note">
        <p><b>选择</b>：单击节点看属性 · Shift+单击多选 · 空白拖拽框选</p>
        <p><b>移动</b>：拖拽节点 · Alt+拖拽复制 · 方向键微调（Shift 加大）</p>
        <p><b>画布</b>：空白拖拽框选 · 空格/中键/Alt 或抓手(H) 拖拽平移 · 滚轮缩放</p>
        <p><b>快捷键</b>：Cmd/Ctrl+Z 撤销 · +D 复制 · +A 全选 · +C/X/V 复制/剪切/粘贴 · +0 缩放 100%</p>
      </div>

      <!-- 搜索：命中后逐个居中，当前那个带金色高亮 -->
      <div v-if="searchOpen" class="ng-tool-search">
        <el-input
          v-model="searchQuery"
          size="small"
          placeholder="搜索节点标题 / 描述 / 正文"
          clearable
          @input="searchIndex = 0"
          @keydown.enter.prevent="stepSearch($event.shiftKey ? -1 : 1)"
          @keydown.esc.prevent="toggleSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <div class="ng-tool-search__meta">
          <span v-if="searchQuery.trim()">{{ searchMatches.length ? Math.min(searchIndex + 1, searchMatches.length) + '/' + searchMatches.length : '无匹配' }}</span>
          <span v-else>回车跳到下一个命中</span>
          <span class="ng-tool-search__ops">
            <button type="button" :disabled="!searchMatches.length" aria-label="上一个" title="上一个" @click="stepSearch(-1)">↑</button>
            <button type="button" :disabled="!searchMatches.length" aria-label="下一个" title="下一个" @click="stepSearch(1)">↓</button>
          </span>
        </div>
      </div>
    </div>

    <!-- 画布背景设置面板 -->
    <NodeGraphBackgroundPanel
      v-if="bgPanelOpen"
      :background="store.background"
      @change="(bg) => store.setBackground(bg)"
    />

    <!-- 选中连线：浮动样式面板（线型 / 箭头 / 粗细 / 颜色 / 标签预设） -->
    <div v-if="selectedEdge && !props.readonly" class="ng-edge-style" @pointerdown.stop @click.stop>
      <header class="ng-edge-style__head">
        <b>连线样式</b>
        <button type="button" aria-label="关闭连线样式" title="关闭" @click="store.selectEdges([])">×</button>
      </header>
      <div class="ng-edge-style__row">
        <span>线型</span>
        <button
          v-for="item in ([['solid', '实线'], ['dashed', '虚线'], ['ortho', '直角']] as const)"
          :key="item[0]"
          type="button"
          class="ng-edge-style__chip"
          :class="{ 'is-on': (selectedEdge.style?.line || 'solid') === item[0] }"
          @click="store.updateEdgeStyle(selectedEdge.id, { line: item[0] })"
        >{{ item[1] }}</button>
      </div>
      <div class="ng-edge-style__row">
        <span>箭头</span>
        <button
          v-for="item in ([['end', '单向'], ['both', '双向'], ['none', '无']] as const)"
          :key="item[0]"
          type="button"
          class="ng-edge-style__chip"
          :class="{ 'is-on': (selectedEdge.style?.arrow || 'end') === item[0] }"
          @click="store.updateEdgeStyle(selectedEdge.id, { arrow: item[0] })"
        >{{ item[1] }}</button>
      </div>
      <div class="ng-edge-style__row">
        <span>粗细</span>
        <button
          v-for="width in [1, 1.6, 2.4, 3.2]"
          :key="width"
          type="button"
          class="ng-edge-style__chip"
          :class="{ 'is-on': (selectedEdge.style?.width || 1.6) === width }"
          @click="store.updateEdgeStyle(selectedEdge.id, { width })"
        >{{ width }}</button>
      </div>
      <div class="ng-edge-style__row">
        <span>颜色</span>
        <button
          v-for="color in ['#94a3b8', '#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626']"
          :key="color"
          type="button"
          class="ng-edge-style__swatch"
          :style="{ background: color }"
          :aria-label="'连线颜色 ' + color"
          @click="store.updateEdgeStyle(selectedEdge.id, { color })"
        ></button>
      </div>
      <div class="ng-edge-style__row">
        <span>标签</span>
        <button
          v-for="label in ['依赖', '流向', '参考', '阻塞']"
          :key="label"
          type="button"
          class="ng-edge-style__chip"
          :class="{ 'is-on': selectedEdge.label === label }"
          @click="store.updateEdgeLabel(selectedEdge.id, label)"
        >{{ label }}</button>
      </div>
    </div>

    <!-- 右键菜单 -->
    <NodeGraphContextMenu
      v-if="ctxOpen"
      :x="ctxPos.x"
      :y="ctxPos.y"
      :has-selection="store.selectedNodeIds.length > 0"
      :multi-selection="store.selectedNodeIds.length > 1"
      :can-undo="store.canUndo"
      :can-redo="store.canRedo"
      :zoom-percent="zoomPercent"
      :can-paste="clipboardReady"
      :node="ctxNode"
      :can-paste-style="store.hasStyleClipboard"
      :readonly="props.readonly"
      @action="onContextAction"
      @close="closeContextMenu"
    />

    <!-- 左下角缩放条：预设百分比用下拉选择 -->
    <div class="ng-zoom-bar" role="group" aria-label="缩放">
      <button type="button" class="ng-zoom-btn" aria-label="缩小" title="缩小" @click="zoomBy(1 / 1.1)">−</button>
      <select
        v-model.number="zoomSelectModel"
        class="ng-zoom-pct"
        aria-label="选择缩放比例"
        title="选择缩放比例"
        @change="setZoom(zoomSelectModel)"
      >
        <option v-for="level in ZOOM_LEVELS" :key="level" :value="Math.round(level * 100)">
          {{ Math.round(level * 100) }}%
        </option>
      </select>
      <button type="button" class="ng-zoom-btn" aria-label="放大" title="放大" @click="zoomBy(1.1)">＋</button>
      <button type="button" class="ng-zoom-btn ng-zoom-btn--wide" aria-label="适应画布" title="适应画布" @click="fitToContent">适应</button>
    </div>

    <!-- 右下角缩略图 -->
    <NodeGraphMinimap
      :nodes="store.nodes"
      :viewport="viewport"
      :size="canvasSize"
      @navigate="navigateTo"
    />

    <!-- 画布统计：节点 / 连线 / 类型分布 / 进度 -->
    <el-dialog v-model="statsOpen" class="ng-stats-dialog" title="画布统计" width="420px" :close-on-click-modal="false">
      <div class="ng-stats">
        <div class="ng-stats__row">
          <div class="ng-stats__card">
            <b>{{ stats.nodes }}</b>
            <span>节点</span>
          </div>
          <div class="ng-stats__card">
            <b>{{ stats.edges }}</b>
            <span>连线</span>
          </div>
          <div class="ng-stats__card">
            <b>{{ stats.avgProgress === null ? '—' : stats.avgProgress + '%' }}</b>
            <span>平均进度</span>
          </div>
          <div class="ng-stats__card">
            <b>{{ stats.completed }}</b>
            <span>已完成</span>
          </div>
        </div>
        <div v-for="bar in statBars" :key="bar.label" class="ng-stats__bar">
          <span class="ng-stats__bar-label">{{ bar.label }}</span>
          <i><em :style="{ width: bar.percent + '%' }"></em></i>
          <span class="ng-stats__bar-count">{{ bar.count }}</span>
        </div>
        <p v-if="!stats.nodes" class="ng-stats__empty">画布上还没有节点。</p>
      </div>
    </el-dialog>

    <!-- 画布节点的目标：92 个画布之一，或本项目里的画布；选定后不可更改 -->
    <el-dialog
      v-model="pickerOpen"
      class="ng-picker-dialog"
      title="选择画布"
      width="760px"
      top="6vh"
      :close-on-click-modal="false"
    >
      <div class="ng-picker__search">
        <el-input
          v-model="pickerQuery"
          class="ng-picker__input"
          placeholder="搜索画布名称或说明"
          clearable
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <span class="ng-picker__total">共 {{ pickerTotal }} 张</span>
      </div>

      <div class="ng-picker">
        <p v-if="!templateGroups.length && !projectCanvases.length" class="ng-picker__empty">
          没有匹配的画布，换个关键词试试。
        </p>
        <section v-for="group in templateGroups" :key="group.key" class="ng-picker__cat">
          <h4 class="ng-picker__cat-title">
            <span>{{ group.label }}</span>
            <em>{{ group.count }} 张</em>
          </h4>
          <div v-for="lane in group.lanes" :key="lane.id" class="ng-picker__lane">
            <p class="ng-picker__lane-title">
              {{ lane.title }}
              <em>{{ lane.items.length }}</em>
              <span v-if="lane.hint">{{ lane.hint }}</span>
            </p>
            <div class="ng-picker__list">
              <button
                v-for="item in lane.items"
                :key="item.id"
                type="button"
                class="ng-picker__item"
                :title="item.description"
                @click="createCanvasNode({ refTemplateId: item.id })"
              >
                <span class="ng-picker__name">{{ item.name }}</span>
                <span class="ng-picker__desc">{{ item.description }}</span>
              </button>
            </div>
          </div>
        </section>
        <section v-if="projectCanvases.length" class="ng-picker__group">
          <h4 class="ng-picker__title">本项目的画布</h4>
          <div class="ng-picker__list">
            <button
              v-for="item in projectCanvases"
              :key="item.id"
              type="button"
              class="ng-picker__item"
              :disabled="!!projectCanvasProblem(item.id)"
              :title="projectCanvasProblem(item.id) || item.title"
              @click="createCanvasNode({ refCanvasId: item.id })"
            >
              <span class="ng-picker__name">{{ item.title }}</span>
              <span v-if="projectCanvasProblem(item.id)" class="ng-picker__warn">
                {{ projectCanvasProblem(item.id) }}
              </span>
            </button>
          </div>
        </section>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.ng-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 背景图案由背景设置面板决定（backgroundStyle 绑在 style 上）。 */
  background: #f8fafc;
}

.ng-bg {
  position: absolute;
  inset: 0;
  cursor: default;
}

/* 抓手模式：空白处是抓取手势，拖动时变成正在抓。 */
.ng-root.is-pan .ng-bg {
  cursor: grab;
}

.ng-root.is-panning .ng-bg {
  cursor: grabbing;
}

.ng-world {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}

/* 工作区边界：只画一圈虚线，不挡节点交互 */
.ng-world-frame {
  position: absolute;
  border: 1px dashed #cbd5e1;
  border-radius: 24px;
  pointer-events: none;
}

.ng-world-frame__label {
  position: absolute;
  left: 16px;
  top: -22px;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

/* 编组容器：只做视觉归属，不拦截节点交互 */
.ng-group-box {
  position: absolute;
  border: 1.5px dashed #a5b4fc;
  border-radius: 16px;
  background: rgba(99, 102, 241, 0.045);
  pointer-events: none;
}

/* 智能参考线 */
.ng-guide {
  position: absolute;
  z-index: 8;
  background: #ec4899;
  pointer-events: none;
}

.ng-guide--v {
  width: 1px;
}

.ng-guide--h {
  height: 1px;
}

/* 协作光标 */
.ng-peer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  white-space: nowrap;
  pointer-events: none;
}

.ng-peer i {
  width: 8px;
  height: 8px;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
}

.ng-peer span {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid currentColor;
}

/* 平移出工作区后的回位提示 */
.ng-world-back {
  position: absolute;
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  z-index: 15;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(55, 48, 163, 0.12);
}

/* 选区工具条：多选时浮在选区上方 */
.ng-selection-tools {
  position: absolute;
  z-index: 9;
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e2e8f0;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  transform: translateX(-50%);
}

.ng-selection-tool {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.ng-selection-tool:hover {
  background: #eef2ff;
  color: #4f46e5;
}

.ng-selection-tool:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}

.ng-marquee {
  position: absolute;
  border: 1px solid #2563eb;
  background: rgba(37, 99, 235, 0.08);
  pointer-events: none;
  z-index: 5;
}

/* 浮动工具面板（同 excalidraw：左上角一小块，图标按钮 + 分隔线） */
.ng-toolbar {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 快捷键说明：原来常驻在工具栏上的长提示收进这个面板，画布不再被一行字占着 */
.ng-tool-help {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  width: 320px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e5e7eb;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
}

.ng-tool-help p {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #5f6368;
}

.ng-tool-help p:last-child {
  margin-bottom: 0;
}

.ng-tool-help b {
  color: #1f2329;
}

.ng-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 工具栏下方的搜索小面板 */
.ng-tool-search {
  position: absolute;
  left: 0;
  top: 42px;
  width: 268px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.ng-tool-search__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: #8b929b;
}

.ng-tool-search__ops {
  display: inline-flex;
  gap: 4px;
}

.ng-tool-search__ops button {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.ng-tool-search__ops button:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 画布统计弹窗 */
.ng-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ng-stats__row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ng-stats__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.ng-stats__card b {
  font-size: 18px;
  color: #1f2937;
}

.ng-stats__card span {
  font-size: 11px;
  color: #8b929b;
}

.ng-stats__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #4b5563;
}

.ng-stats__bar-label {
  width: 48px;
  flex: none;
}

.ng-stats__bar i {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: #eef0f3;
  overflow: hidden;
}

.ng-stats__bar em {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #2563eb;
}

.ng-stats__bar-count {
  width: 28px;
  text-align: right;
  flex: none;
  color: #8b929b;
}

.ng-stats__empty {
  margin: 0;
  font-size: 12px;
  color: #8b929b;
  text-align: center;
}

/* ---------------- 左下角缩放条（同 excalidraw） ---------------- */
.ng-zoom-bar {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

/* 连线样式浮动面板 */
.ng-edge-style {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 22;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 300px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
}

.ng-edge-style__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #1f2937;
}

.ng-edge-style__head button {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.ng-edge-style__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
}

.ng-edge-style__row > span {
  flex: 0 0 28px;
  font-size: 11px;
  color: #8b929b;
}

.ng-edge-style__chip {
  padding: 2px 7px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  font-size: 11px;
  cursor: pointer;
}

.ng-edge-style__chip.is-on {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.ng-edge-style__swatch {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 5px;
  cursor: pointer;
}

.ng-zoom-btn {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5f6368;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.ng-zoom-btn:hover {
  background: #f1f3f4;
  color: #1f2329;
}

.ng-zoom-btn--wide {
  font-size: 12px;
}

.ng-zoom-pct {
  min-width: 46px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f2329;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.12s ease;
}

.ng-zoom-pct:hover {
  background: #f1f3f4;
}

/* ---------------- 画布目标选择 ---------------- */
.ng-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 58vh;
  overflow-y: auto;
  /* 滚轮只滚列表，不把整页带着跑（scroll chaining）。 */
  overscroll-behavior: contain;
  /* 滚动条常驻占位：滚到底时内容不会左右跳。 */
  scrollbar-gutter: stable;
  padding: 14px 12px 14px 14px;
  border: 1px solid #eef0f3;
  border-radius: 14px;
  background: #fbfcfe;
}

/* 搜索条固定在列表上方，不跟着列表一起滚走。 */
.ng-picker__search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid #e8ebf1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.ng-picker__input {
  flex: 1;
  min-width: 0;
}

/* 搜索框：浅灰底 + 细描边，和列表面板区分开。 */
.ng-picker__input :deep(.el-input__wrapper) {
  border-radius: 9px;
  background: #f4f6fa;
  box-shadow: inset 0 0 0 1px #e6eaf1;
}

.ng-picker__input :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--mm-blue), 0 0 0 3px rgba(26, 115, 232, 0.14);
}

.ng-picker__total {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--mm-blue-soft);
  color: var(--mm-blue);
  font-size: 12px;
  font-weight: 600;
}

.ng-picker__empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #8b929b;
}

.ng-picker__cat + .ng-picker__cat {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #eef0f3;
}

/* 一级：分类 */
.ng-picker__cat-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
}

.ng-picker__cat-title em {
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  color: #9aa0a6;
}

/* 二级：用途轨道 */
.ng-picker__lane + .ng-picker__lane {
  margin-top: 12px;
}

.ng-picker__lane-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.ng-picker__lane-title em {
  font-size: 11px;
  font-style: normal;
  color: #b0b6bd;
}

/* 用 clip 而不是 hidden：hidden 会让这个元素变成滚动容器，
   鼠标滚轮打到省略号上时列表就不滚了（滚轮被它吃掉）。 */
.ng-picker__lane-title span {
  font-size: 11px;
  font-weight: 400;
  color: #b0b6bd;
  overflow: clip;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-picker__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.ng-picker__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.ng-picker__item:hover:not(:disabled) {
  border-color: #7c3aed;
  background: #faf7ff;
}

.ng-picker__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ng-picker__name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.ng-picker__desc,
.ng-picker__warn {
  font-size: 11.5px;
  color: #6b7280;
  line-height: 1.4;
  /* 同上：clip 不会吃掉滚轮。 */
  overflow: clip;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ng-picker__warn {
  color: #b45309;
}
</style>
