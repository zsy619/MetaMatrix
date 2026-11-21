<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getKnowledgeGraph } from '../../api/knowledge'
import type { KnowledgeGraph } from '../../api/knowledge'

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
}

const WIDTH = 900
const HEIGHT = 620
const CLUSTER_COLORS = ['#1677ff', '#00b42a', '#ff7d00', '#f5319d', '#722ed1', '#14c9c9', '#f5222d']

/** 节点位置：力导向布局（斥力 + 弹簧 + 归心），可拖拽。 */
const placed = ref<Placed[]>([])

const clusterNames = computed(() => {
  const types = [...new Set(placed.value.map((n) => n.nodeType))]
  return types.map((type, index) => ({ type, color: CLUSTER_COLORS[index % CLUSTER_COLORS.length] }))
})

function colorOf(nodeType: string) {
  const index = clusterNames.value.findIndex((c) => c.type === nodeType)
  return CLUSTER_COLORS[(index < 0 ? 0 : index) % CLUSTER_COLORS.length]
}

/** 力导向迭代：布局一次即可收敛，之后只在拖拽时继续算。 */
function simulate(steps = 260) {
  const nodes = placed.value
  if (!nodes.length) return
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

  const repulsion = 5200
  const springLength = 90
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
        const tx = (c.x / WIDTH) * WIDTH
        const ty = (c.y / HEIGHT) * HEIGHT
        for (const m of members) {
          m.vx += (tx - m.x) * 0.02
          m.vy += (ty - m.y) * 0.02
        }
      })
    }
    for (const node of nodes) {
      node.vx += (WIDTH / 2 - node.x) * 0.008
      node.vy += (HEIGHT / 2 - node.y) * 0.008
      node.x += node.vx * alpha
      node.y += node.vy * alpha
      node.vx *= 0.82
      node.vy *= 0.82
      node.x = Math.max(40, Math.min(WIDTH - 40, node.x))
      node.y = Math.max(30, Math.min(HEIGHT - 30, node.y))
    }
  }
}

function layout() {
  const nodes = graph.value.nodes
  const types = [...new Set(nodes.map((n) => n.nodeType))]
  placed.value = nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2
    const cluster = Math.max(0, types.indexOf(node.nodeType))
    return {
      id: node.id,
      title: node.title,
      nodeType: node.nodeType,
      documentId: node.documentId,
      x: WIDTH / 2 + Math.cos(angle) * 180,
      y: HEIGHT / 2 + Math.sin(angle) * 180,
      vx: 0,
      vy: 0,
      cluster,
    }
  })
  simulate()
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

async function load() {
  loading.value = true
  try {
    graph.value = await getKnowledgeGraph(props.projectId)
    layout()
  } catch {
    ElMessage.error('加载知识图谱失败')
  } finally {
    loading.value = false
  }
}

/** 滚轮缩放。 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  scale.value = Math.min(3, Math.max(0.3, scale.value * factor))
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

/** 复位视图。 */
function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

watch(() => props.projectId, load)
watch(clustered, () => layout())
onMounted(load)
onBeforeUnmount(() => {
  dragging.value = null
  panning.value = null
})
</script>

<template>
  <section class="kg">
    <header class="kg__head">
      <span class="kg__title">知识图谱</span>
      <span class="kg__hint">{{ graph.nodes.length }} 个节点 · {{ graph.edges.length }} 条关系</span>
      <el-checkbox v-model="clustered" size="small">按类型聚类</el-checkbox>
      <el-button size="small" @click="resetView">复位</el-button>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </header>
    <div v-if="loading" class="kg__empty">加载中…</div>
    <div v-else-if="!graph.nodes.length" class="kg__empty">还没有节点，先在目录里创建文档。</div>
    <div v-else class="kg__canvas" @mousedown="onCanvasMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp" @wheel="onWheel">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="kg__svg">
        <g :transform="`translate(${offsetX},${offsetY}) scale(${scale})`">
          <g v-for="(edge, index) in edges" :key="index">
            <line
              :x1="edge.from.x"
              :y1="edge.from.y"
              :x2="edge.to.x"
              :y2="edge.to.y"
              :stroke="edge.type === 'reference' ? '#ff8800' : '#c9cdd4'"
              :stroke-dasharray="edge.type === 'reference' ? '4 3' : ''"
              stroke-width="1.5"
            />
          </g>
          <g
            v-for="node in placed"
            :key="node.id"
            class="kg__node"
            @mousedown="onNodeMouseDown(node, $event)"
            @click="node.documentId && emit('open-node', node.documentId)"
          >
            <circle :cx="node.x" :cy="node.y" r="8" :fill="colorOf(node.nodeType)" />
            <text :x="node.x + 12" :y="node.y + 4" font-size="12" fill="#1d2129">
              {{ node.title.length > 12 ? node.title.slice(0, 12) + '…' : node.title }}
            </text>
          </g>
        </g>
      </svg>
      <p class="kg__legend">
        <span v-for="cluster in clusterNames" :key="cluster.type">
          <i class="kg__dot" :style="{ background: cluster.color }" />{{ cluster.type }}
        </span>
        <span><i class="kg__dot kg__dot--ref" />文档引用</span>
        <span class="kg__hint">滚轮缩放 · 拖拽平移 · 拖动节点重排</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.kg {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--mm-surface, #fff);
}
.kg__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.kg__title {
  font-size: 16px;
  font-weight: 600;
}
.kg__hint {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.kg__head .el-button:last-child {
  margin-left: auto;
}
.kg__canvas {
  flex: 1;
  overflow: hidden;
  padding: 12px;
  cursor: grab;
}
.kg__svg {
  width: 100%;
  height: 100%;
  min-height: 420px;
}
.kg__node {
  cursor: grab;
}
.kg__legend {
  display: flex;
  gap: 16px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  flex-wrap: wrap;
}
.kg__legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.kg__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.kg__dot--ref {
  background: #ff8800;
}
.kg__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 14px;
}
</style>
