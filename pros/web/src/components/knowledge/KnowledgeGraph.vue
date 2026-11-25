<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getKnowledgeGraph } from '../../api/knowledge'
import type { KnowledgeGraph } from '../../api/knowledge'
import AppLoading from '../common/AppLoading.vue'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ 'open-node': [documentId: string] }>()

const graph = ref<KnowledgeGraph>({ nodes: [], edges: [] })
const loading = ref(false)
/** 按类型聚类：同类节点被吸到各自的簇心。 */
const clustered = ref(true)
/** 视图变换：缩放与平移。 */
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref<{ id: string; dx: number; dy: number } | null>(null)
const panning = ref<{ x: number; y: number; ox: number; oy: number } | null>(null)
/** 悬停节点：显示浮层信息。 */
const hoveredId = ref('')
const tooltip = ref({ x: 0, y: 0, title: '', type: '', degree: 0, visible: false })
/** 选中节点：高亮它与邻居。 */
const selectedId = ref('')
/** 标题搜索：命中的节点高亮，其余淡出。 */
const query = ref('')
/** 类型筛选：只看某一种类型（空 = 全部）。 */
const typeFilter = ref('')

interface Placed {
  id: string
  title: string
  nodeType: string
  documentId: string
  x: number
  y: number
  vx: number
  vy: number
  cluster: number
  degree: number
}

/** 节点类型配色：固定映射，避免节点增减后同类型换色。 */
const TYPE_COLORS: Record<string, string> = {
  doc: '#1677ff',
  canvas: '#00b42a',
  sheet: '#f5319d',
  mindmap: '#722ed1',
  folder: '#ff7d00',
  note: '#14c9c9',
  attachment: '#f5222d',
}
const TYPE_LABELS: Record<string, string> = {
  doc: '文档',
  canvas: '画布',
  sheet: '多维表格',
  mindmap: '思维导图',
  folder: '文件夹',
  note: '笔记',
  attachment: '附件',
}
const FALLBACK_COLORS = ['#1677ff', '#00b42a', '#f5319d', '#722ed1', '#ff7d00', '#14c9c9', '#f5222d']

/** 画布尺寸跟随容器，布局与视图都按真实宽高算。 */
const size = ref({ w: 960, h: 640 })
const canvasRef = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null
let resizeTimer: number | null = null

const placed = ref<Placed[]>([])

function hash(text: string): number {
  let value = 0
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) | 0
  return value
}

function colorOf(nodeType: string): string {
  return TYPE_COLORS[nodeType] ?? FALLBACK_COLORS[Math.abs(hash(nodeType)) % FALLBACK_COLORS.length]
}

/** 出现过的类型（按节点数排序，图例只列真实存在的类型）。 */
const typeList = computed(() => {
  const count = new Map<string, number>()
  for (const node of graph.value.nodes) count.set(node.nodeType, (count.get(node.nodeType) ?? 0) + 1)
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, total]) => ({
      type,
      total,
      label: TYPE_LABELS[type] ?? type,
      color: colorOf(type),
    }))
})

/** 度数：连接数越多，节点越大。 */
const degreeOf = computed(() => {
  const map = new Map<string, number>()
  for (const edge of graph.value.edges) {
    map.set(edge.source, (map.get(edge.source) ?? 0) + 1)
    map.set(edge.target, (map.get(edge.target) ?? 0) + 1)
  }
  return map
})

/** 力导向布局：斥力 + 弹簧 + 归心，按容器尺寸迭代。 */
function simulate(steps = 300) {
  const nodes = placed.value
  if (!nodes.length) return
  const { w, h } = size.value
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = graph.value.edges
    .map((e) => ({ s: index.get(e.source), t: index.get(e.target) }))
    .filter((e): e is { s: number; t: number } => e.s !== undefined && e.t !== undefined)

  // 簇心：同类型节点共用一个吸引点。
  const clusters = new Map<number, { x: number; y: number; count: number }>()
  nodes.forEach((node) => {
    const c = clusters.get(node.cluster) ?? { x: 0, y: 0, count: 0 }
    c.x += node.x
    c.y += node.y
    c.count += 1
    clusters.set(node.cluster, c)
  })
  clusters.forEach((c) => {
    c.x /= c.count || 1
    c.y /= c.count || 1
  })

  const repulsion = 4200
  const springLength = Math.max(70, Math.min(w, h) / 9)
  const springK = 0.02
  for (let step = 0; step < steps; step++) {
    const alpha = 1 - step / steps
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        const distSq = dx * dx + dy * dy || 1
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        a.vx += dx
        a.vy += dy
        b.vx -= dx
        b.vy -= dy
      }
    }
    for (const edge of edges) {
      const a = nodes[edge.s]
      const b = nodes[edge.t]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - springLength) * springK
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
    if (clustered.value) {
      clusters.forEach((c, key) => {
        const members = nodes.filter((n) => n.cluster === key)
        for (const m of members) {
          m.vx += (c.x - m.x) * 0.02
          m.vy += (c.y - m.y) * 0.02
        }
      })
    }
    for (const node of nodes) {
      node.vx += (w / 2 - node.x) * 0.008
      node.vy += (h / 2 - node.y) * 0.008
      node.x += node.vx * alpha
      node.y += node.vy * alpha
      node.vx *= 0.82
      node.vy *= 0.82
      node.x = Math.max(40, Math.min(w - 40, node.x))
      node.y = Math.max(30, Math.min(h - 30, node.y))
    }
  }
}

function layout() {
  const nodes = graph.value.nodes
  const types = [...new Set(nodes.map((n) => n.nodeType))]
  const { w, h } = size.value
  const radius = Math.min(w, h) / 3
  placed.value = nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2
    return {
      id: node.id,
      title: node.title,
      nodeType: node.nodeType,
      documentId: node.documentId,
      x: w / 2 + Math.cos(angle) * radius,
      y: h / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      cluster: Math.max(0, types.indexOf(node.nodeType)),
      degree: degreeOf.value.get(node.id) ?? 0,
    }
  })
  simulate()
  fitView()
}

const position = computed(() => {
  const map = new Map<string, Placed>()
  for (const node of placed.value) map.set(node.id, node)
  return map
})

const edges = computed(() =>
  graph.value.edges
    .map((edge) => {
      const from = position.value.get(edge.source)
      const to = position.value.get(edge.target)
      if (!from || !to) return null
      return { ...edge, from, to }
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null),
)

function nodeRadius(node: Placed): number {
  return 6 + Math.min(node.degree, 8) * 0.9
}

/**
 * 标签避让：按度数从高到低，依次尝试右/左/上/下四个位置，
 * 与已放置标签重叠就不画；放不下的信息由悬停浮层补齐。
 *
 * 标签在「屏幕坐标系」里算（不随缩放变大），单独画在未缩放的一层上，
 * 所以放大到 200% 时字仍然是 12px，不会糊成一团。
 */
const labels = computed(() => {
  const taken: { x1: number; y1: number; x2: number; y2: number }[] = []
  const out: { id: string; x: number; y: number; text: string; anchor: 'start' | 'end' | 'middle' }[] = []
  const ordered = [...placed.value].sort((a, b) => b.degree - a.degree)
  const k = scale.value
  for (const node of ordered) {
    const text = node.title.length > 14 ? `${node.title.slice(0, 14)}…` : node.title
    const width = text.length * 12 + 4
    const height = 16
    const cx = offsetX.value + node.x * k
    const cy = offsetY.value + node.y * k
    const r = nodeRadius(node) * k
    const candidates = [
      { x: cx + r + 8, y: cy + 4, anchor: 'start' as const },
      { x: cx - r - 8, y: cy + 4, anchor: 'end' as const },
      { x: cx, y: cy - r - 8, anchor: 'middle' as const },
      { x: cx, y: cy + r + 16, anchor: 'middle' as const },
    ]
    for (const c of candidates) {
      const x1 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - width : c.x - width / 2
      const rect = { x1, y1: c.y - height / 2, x2: x1 + width, y2: c.y + height / 2 }
      const hit = taken.some((t) => !(rect.x2 < t.x1 || rect.x1 > t.x2 || rect.y2 < t.y1 || rect.y1 > t.y2))
      if (hit) continue
      // 标签整体要留在画布内，超出就换一个位置。
      if (rect.x1 < 2 || rect.x2 > size.value.w - 2 || rect.y1 < 2 || rect.y2 > size.value.h - 2) continue
      taken.push(rect)
      out.push({ id: node.id, x: c.x, y: c.y, text, anchor: c.anchor })
      break
    }
  }
  return out
})

/** 搜索命中的节点集合。 */
const matchedIds = computed(() => {
  const key = query.value.trim().toLowerCase()
  if (!key) return null
  return new Set(placed.value.filter((n) => n.title.toLowerCase().includes(key)).map((n) => n.id))
})

/** 选中节点的邻居集合：用于高亮。 */
const neighborIds = computed(() => {
  if (!selectedId.value) return null
  const set = new Set<string>([selectedId.value])
  for (const edge of graph.value.edges) {
    if (edge.source === selectedId.value) set.add(edge.target)
    if (edge.target === selectedId.value) set.add(edge.source)
  }
  return set
})

/** 节点状态：正常 / 淡出（被筛选或搜索排除）。 */
function nodeDim(node: Placed): boolean {
  if (typeFilter.value && node.nodeType !== typeFilter.value) return true
  if (matchedIds.value && !matchedIds.value.has(node.id)) return true
  if (neighborIds.value && !neighborIds.value.has(node.id)) return true
  return false
}

function edgeDim(edge: { source: string; target: string }): boolean {
  if (typeFilter.value) {
    const from = position.value.get(edge.source)
    const to = position.value.get(edge.target)
    if (from?.nodeType !== typeFilter.value && to?.nodeType !== typeFilter.value) return true
  }
  if (neighborIds.value && !(neighborIds.value.has(edge.source) && neighborIds.value.has(edge.target))) return true
  return false
}

async function load() {
  loading.value = true
  try {
    graph.value = await getKnowledgeGraph(props.projectId)
    layout()
  } catch {
    ElMessage.error('加载知识图谱失败')
  } finally {
    loading.value = false
    // 画布是 v-else 渲染的：数据到位后它才挂载，此时才能测量尺寸。
    await nextTick()
    observeCanvas()
  }
}

/** 观察画布容器：尺寸变了就重排并重新适应。 */
function observeCanvas() {
  if (!canvasRef.value) return
  observer?.disconnect()
  observer = new ResizeObserver(() => onResize())
  observer.observe(canvasRef.value)
  onResize()
}

/** 滚轮缩放：锚点在鼠标位置，缩放时画面不跳。 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  const next = Math.min(3, Math.max(0.3, scale.value * factor))
  const k = next / scale.value
  offsetX.value = mx - (mx - offsetX.value) * k
  offsetY.value = my - (my - offsetY.value) * k
  scale.value = next
}

/** 拖动节点。 */
function onNodeMouseDown(node: Placed, e: MouseEvent) {
  e.stopPropagation()
  const rect = (e.currentTarget as SVGGraphicsElement).ownerSVGElement?.getBoundingClientRect()
  if (!rect) return
  const sx = (e.clientX - rect.left - offsetX.value) / scale.value
  const sy = (e.clientY - rect.top - offsetY.value) / scale.value
  dragging.value = { id: node.id, dx: node.x - sx, dy: node.y - sy }
}

/** 拖动背景平移。 */
function onCanvasMouseDown(e: MouseEvent) {
  panning.value = { x: e.clientX, y: e.clientY, ox: offsetX.value, oy: offsetY.value }
  selectedId.value = ''
}

function onMouseMove(e: MouseEvent) {
  if (dragging.value) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const sx = (e.clientX - rect.left - offsetX.value) / scale.value
    const sy = (e.clientY - rect.top - offsetY.value) / scale.value
    const node = placed.value.find((n) => n.id === dragging.value?.id)
    if (node) {
      node.x = sx + dragging.value.dx
      node.y = sy + dragging.value.dy
    }
    return
  }
  if (panning.value) {
    offsetX.value = panning.value.ox + (e.clientX - panning.value.x)
    offsetY.value = panning.value.oy + (e.clientY - panning.value.y)
  }
}

function onMouseUp() {
  dragging.value = null
  panning.value = null
}

/** 适应画布：把整张图缩放到可视区域并居中。 */
function fitView() {
  const nodes = placed.value
  if (!nodes.length) return
  const { w, h } = size.value
  const pad = 56
  const minX = Math.min(...nodes.map((n) => n.x)) - pad
  const maxX = Math.max(...nodes.map((n) => n.x)) + pad
  const minY = Math.min(...nodes.map((n) => n.y)) - pad
  const maxY = Math.max(...nodes.map((n) => n.y)) + pad
  const scaleX = w / Math.max(1, maxX - minX)
  const scaleY = h / Math.max(1, maxY - minY)
  const next = Math.min(2.6, Math.max(0.3, Math.min(scaleX, scaleY)))
  scale.value = next
  offsetX.value = (w - (maxX - minX) * next) / 2 - minX * next
  offsetY.value = (h - (maxY - minY) * next) / 2 - minY * next
}

/** 重置缩放：回到 100% 并把原点归零。 */
function resetZoom() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function zoomBy(factor: number) {
  const { w, h } = size.value
  const next = Math.min(3, Math.max(0.3, scale.value * factor))
  const k = next / scale.value
  offsetX.value = w / 2 - (w / 2 - offsetX.value) * k
  offsetY.value = h / 2 - (h / 2 - offsetY.value) * k
  scale.value = next
}

/** 悬停浮层：跟随鼠标，显示完整标题与连接数。 */
function onNodeEnter(node: Placed, e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  const x = e.clientX - (rect?.left ?? 0) + 14
  const y = e.clientY - (rect?.top ?? 0) - 10
  hoveredId.value = node.id
  tooltip.value = {
    x: Math.min(x, size.value.w - 276),
    y: Math.min(y, size.value.h - 72),
    title: node.title,
    type: TYPE_LABELS[node.nodeType] ?? node.nodeType,
    degree: node.degree,
    visible: true,
  }
}

function onNodeLeave() {
  hoveredId.value = ''
  tooltip.value = { ...tooltip.value, visible: false }
}

function onNodeClick(node: Placed) {
  selectedId.value = selectedId.value === node.id ? '' : node.id
  if (node.documentId) emit('open-node', node.documentId)
}

/** 容器尺寸变化：重排并重新适应。 */
function onResize() {
  const el = canvasRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width < 80 || rect.height < 80) return
  size.value = { w: Math.round(rect.width), h: Math.round(rect.height) }
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    if (placed.value.length) layout()
  }, 160)
}

watch(() => props.projectId, load)
watch(clustered, () => layout())
watch(typeFilter, () => {
  selectedId.value = ''
})

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  if (resizeTimer) window.clearTimeout(resizeTimer)
  dragging.value = null
  panning.value = null
})
</script>

<template>
  <section class="kg">
    <header class="kg__head">
      <div class="kg__head-left">
        <span class="kg__title">知识图谱</span>
        <span class="kg__hint">{{ graph.nodes.length }} 个节点 · {{ graph.edges.length }} 条关系</span>
      </div>
      <div class="kg__head-right">
        <el-input v-model="query" size="small" class="kg__search" placeholder="搜索节点标题" clearable />
        <el-checkbox v-model="clustered" size="small">按类型聚类</el-checkbox>
        <el-button size="small" @click="fitView()">适应画布</el-button>
        <el-button size="small" :loading="loading" @click="load">刷新</el-button>
      </div>
    </header>

    <div v-if="loading" class="kg__empty"><AppLoading /></div>
    <div v-else-if="!graph.nodes.length" class="kg__empty">还没有节点，先在目录里创建文档。</div>
    <div
      v-else
      ref="canvasRef"
      class="kg__canvas"
      @mousedown="onCanvasMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
    >
      <svg :viewBox="`0 0 ${size.w} ${size.h}`" class="kg__svg">
        <defs>
          <filter id="kg-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.28" />
          </filter>
        </defs>
        <g :transform="`translate(${offsetX},${offsetY}) scale(${scale})`">
          <!-- 连线：目录关系灰实线，文档引用橙色虚线 -->
          <g v-for="(edge, index) in edges" :key="index">
            <line
              class="kg__edge"
              :class="{ 'kg__edge--ref': edge.type === 'reference', 'kg__edge--dim': edgeDim(edge) }"
              :x1="edge.from.x"
              :y1="edge.from.y"
              :x2="edge.to.x"
              :y2="edge.to.y"
            />
          </g>
          <!-- 节点 -->
          <g
            v-for="node in placed"
            :key="node.id"
            class="kg__node"
            :class="{
              'kg__node--dim': nodeDim(node),
              'kg__node--active': hoveredId === node.id || selectedId === node.id,
            }"
            @mousedown="onNodeMouseDown(node, $event)"
            @mouseenter="onNodeEnter(node, $event)"
            @mouseleave="onNodeLeave"
            @click="onNodeClick(node)"
          >
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="nodeRadius(node)"
              :fill="colorOf(node.nodeType)"
              stroke="rgba(255, 255, 255, 0.9)"
              stroke-width="1.5"
              filter="url(#kg-shadow)"
            />
            <circle
              v-if="selectedId === node.id"
              class="kg__node-ring"
              :cx="node.x"
              :cy="node.y"
              :r="nodeRadius(node) + 5"
            />
          </g>
        </g>
        <!-- 标签：单独一层，不随缩放变大；自动避让，重叠时不画 -->
        <g class="kg__labels">
          <text
            v-for="label in labels"
            :key="label.id"
            class="kg__label"
            :x="label.x"
            :y="label.y"
            :text-anchor="label.anchor"
            :opacity="nodeDim(position.get(label.id)!) ? 0.25 : 1"
          >
            {{ label.text }}
          </text>
        </g>
      </svg>

      <!-- 缩放控件 -->
      <div class="kg__zoom">
        <button type="button" title="放大" @click="zoomBy(1.2)">+</button>
        <button type="button" title="缩小" @click="zoomBy(1 / 1.2)">−</button>
        <button type="button" class="kg__zoom-value" title="重置为 100%" @click="resetZoom">
          {{ Math.round(scale * 100) }}%
        </button>
      </div>

      <!-- 悬停浮层 -->
      <div v-show="tooltip.visible" class="kg__tip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
        <span class="kg__tip-title">{{ tooltip.title }}</span>
        <span class="kg__tip-meta">{{ tooltip.type }} · {{ tooltip.degree }} 条关联</span>
      </div>
    </div>

    <!-- 图例：点类型即筛选 -->
    <footer v-if="graph.nodes.length" class="kg__legend">
      <button type="button" class="kg__chip" :class="{ 'kg__chip--on': !typeFilter }" @click="typeFilter = ''">
        全部 {{ graph.nodes.length }}
      </button>
      <button
        v-for="item in typeList"
        :key="item.type"
        type="button"
        class="kg__chip"
        :class="{ 'kg__chip--on': typeFilter === item.type }"
        @click="typeFilter = typeFilter === item.type ? '' : item.type"
      >
        <i class="kg__dot" :style="{ background: item.color }" />{{ item.label }} {{ item.total }}
      </button>
      <span class="kg__chip kg__chip--ref"><i class="kg__dot kg__dot--ref" />文档引用</span>
      <span class="kg__legend-hint">滚轮缩放 · 拖拽平移 · 拖动节点重排 · 点击节点打开文档</span>
    </footer>
  </section>
</template>

<style scoped>
.kg {
  flex: 1;
  min-width: 0;
  /* flex 子项默认 min-height:auto 会被画布内容撑出视口，底部节点因此被裁。 */
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* 头部：玻璃条，与其它知识库页面一致 */
.kg__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kg__head-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.kg__head-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.kg__search {
  width: 168px;
}
.kg__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ent-text, #1f2733);
}
.kg__hint {
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
}

.kg__canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
}
.kg__canvas:active {
  cursor: grabbing;
}
.kg__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.kg__edge {
  stroke: rgba(100, 116, 139, 0.55);
  stroke-width: 1.4;
  stroke-linecap: round;
  transition: opacity 0.18s ease;
}
.kg__edge--ref {
  stroke: rgba(255, 136, 0, 0.85);
  stroke-dasharray: 4 3;
}
.kg__edge--dim {
  opacity: 0.12;
}

.kg__node {
  cursor: pointer;
  transition: opacity 0.18s ease;
}
.kg__node--dim {
  opacity: 0.16;
}
.kg__node--active circle:first-child {
  stroke: #1a73e8;
  stroke-width: 2.5;
}
.kg__node-ring {
  fill: none;
  stroke: rgba(26, 115, 232, 0.55);
  stroke-width: 2;
}

/* 标签：白色描边光晕，压在极光背景上也读得清 */
.kg__label {
  font-size: 12px;
  fill: var(--ent-text, #1f2733);
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}

.kg__zoom {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.kg__zoom button {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ent-text-2, #5a6472);
  font-size: 15px;
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.16s ease;
}
.kg__zoom button:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}
.kg__zoom-value {
  padding: 0 6px;
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  font-variant-numeric: tabular-nums;
}

.kg__tip {
  position: absolute;
  z-index: 5;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  pointer-events: none;
}
.kg__tip-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--ent-text, #1f2733);
}
.kg__tip-meta {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
}

/* 图例：类型可点选筛选 */
.kg__legend {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kg__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.16s ease;
}
.kg__chip:hover {
  background: rgba(255, 255, 255, 0.86);
  transform: translateY(-1px);
}
.kg__chip--on {
  background: rgba(255, 255, 255, 0.94);
  color: var(--ent-primary, #1a73e8);
  font-weight: 600;
}
.kg__chip--ref {
  cursor: default;
}
.kg__chip--ref:hover {
  transform: none;
  background: rgba(255, 255, 255, 0.5);
}
.kg__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.kg__dot--ref {
  background: #ff8800;
}
.kg__legend-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
}

.kg__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--ent-text-2, #5a6472);
  font-size: 14px;
}
</style>
