<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { GraphEdge, GraphNode } from '../../../types/nodeGraph'
import { anchorPoint, edgeEndpoints, resolveAnchor, type AnchorSide } from './anchors'

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedEdgeIds: string[]
  /** 正在拖拽中的临时连线。 */
  pending: { source: string; side: AnchorSide; offset: number; x: number; y: number } | null
  /** 正在拖动已有连线的某一端：这一端跟着指针走，另一端钉住。 */
  reconnect: { edgeId: string; which: 'source' | 'target'; x: number; y: number } | null
  /** 上下游追踪：命中的连线之外的都变暗。 */
  focusEdgeIds?: string[] | null
}>()

const emit = defineEmits<{
  selectEdge: [id: string]
  editLabel: [id: string, label: string]
  /** 抓住连线端点开始拖动。 */
  reconnectStart: [id: string, which: 'source' | 'target', event: PointerEvent]
}>()

const nodeMap = computed(() => new Map(props.nodes.map((node) => [node.id, node])))

type Endpoints = { from: { x: number; y: number }; to: { x: number; y: number } }

/** 连线从源节点侧边出发、落到目标节点侧边；拖动后自动换到朝向对方的一侧。 */
function endpointsOf(edge: GraphEdge): Endpoints | null {
  return edgeEndpoints(edge, nodeMap.value)
}

function labelPosOf(edge: GraphEdge): { x: number; y: number } | null {
  const points = endpointsOf(edge)
  if (!points) return null
  return {
    x: (points.from.x + points.to.x) / 2,
    y: (points.from.y + points.to.y) / 2,
  }
}

/** 直角连线：先走横再走竖，适合流程/架构图。 */
function orthoPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2
  return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`
}

function pathFor(edge: GraphEdge, from: { x: number; y: number }, to: { x: number; y: number }): string {
  return edge.style?.line === 'ortho' ? orthoPath(from, to) : curvedPath(from, to)
}

const rendered = computed(() =>
  props.edges.flatMap((edge) => {
    const points = endpointsOf(edge)
    if (!points) return []
    return [{ edge, points, path: pathFor(edge, points.from, points.to), label: labelPosOf(edge) }]
  }),
)

function edgeStyle(edge: GraphEdge) {
  const style = edge.style || {}
  return {
    stroke: style.color || (isSelected(edge.id) ? '#2563eb' : '#94a3b8'),
    strokeWidth: style.width || 1.6,
    strokeDasharray: style.line === 'dashed' ? '6 5' : undefined,
  }
}

function isDimmed(edge: GraphEdge): boolean {
  return !!props.focusEdgeIds && !props.focusEdgeIds.includes(edge.id)
}

/** 拖拽中的临时连线：从源节点中心画到指针位置。 */
const pendingPath = computed(() => {
  if (!props.pending) return ''
  const source = nodeMap.value.get(props.pending.source)
  if (!source) return ''
  const from = anchorPoint(source, props.pending.side, props.pending.offset)
  const to = { x: props.pending.x, y: props.pending.y }
  return curvedPath(from, to)
})

/** 拖动连线端点时的预览：另一端保持不动，曲线跟着指针。 */
const reconnectPath = computed(() => {
  const state = props.reconnect
  if (!state) return ''
  const edge = props.edges.find((item) => item.id === state.edgeId)
  if (!edge) return ''
  const otherId = state.which === 'source' ? edge.target : edge.source
  const other = nodeMap.value.get(otherId)
  if (!other) return ''
  const anchor = resolveAnchor(state.which === 'source' ? edge.targetAnchor : edge.sourceAnchor)
  const fixed = anchorPoint(other, anchor?.side || 'left', anchor?.offset ?? 0.5)
  const moving = { x: state.x, y: state.y }
  return state.which === 'source' ? curvedPath(moving, fixed) : curvedPath(fixed, moving)
})

function curvedPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  if (dy >= dx) {
    const bend = Math.max(32, dy / 2)
    const dir = to.y >= from.y ? 1 : -1
    return (
      'M ' + from.x + ' ' + from.y +
      ' C ' + from.x + ' ' + (from.y + bend * dir) +
      ', ' + to.x + ' ' + (to.y - bend * dir) +
      ', ' + to.x + ' ' + to.y
    )
  }
  const bend = Math.max(40, dx / 2)
  const dir = to.x >= from.x ? 1 : -1
  return (
    'M ' + from.x + ' ' + from.y +
    ' C ' + (from.x + bend * dir) + ' ' + from.y +
    ', ' + (to.x - bend * dir) + ' ' + to.y +
    ', ' + to.x + ' ' + to.y
  )
}

function isSelected(id: string): boolean {
  return props.selectedEdgeIds.includes(id)
}

/** 悬停的连线也露出端点抓手，不用先点一下才找得到。 */
const hoveredId = ref<string | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

/** 指针从线体挪到端点手柄要跨一点空隙，延迟隐藏才够得着。 */
function setHover(id: string | null) {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  if (id) {
    hoveredId.value = id
    return
  }
  hoverTimer = setTimeout(() => {
    hoveredId.value = null
  }, 260)
}

function isActive(id: string): boolean {
  return isSelected(id) || hoveredId.value === id
}

// ---------- 标签编辑 ----------
const editingId = ref<string | null>(null)
const editingText = ref('')
const editingInput = ref<HTMLInputElement | null>(null)

async function startEdit(edge: GraphEdge) {
  editingId.value = edge.id
  editingText.value = edge.label
  await nextTick()
  editingInput.value?.focus()
  editingInput.value?.select()
}

function commitEdit() {
  if (!editingId.value) return
  emit('editLabel', editingId.value, editingText.value.trim())
  editingId.value = null
  editingText.value = ''
}
</script>

<template>
  <div class="ng-edge-layer">
    <svg class="ng-edges" width="1" height="1" aria-hidden="true">
      <defs>
        <marker id="ng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      <g v-for="item in rendered" :key="item.edge.id">
        <path
          class="ng-edge__hit"
          :d="item.path"
          @pointerdown.stop
          @click.stop="emit('selectEdge', item.edge.id)"
          @pointerenter="setHover(item.edge.id)"
          @pointerleave="setHover(null)"
        />
        <path
          class="ng-edge"
          :class="{
            'ng-edge--selected': isSelected(item.edge.id),
            'ng-edge--ghost': reconnect && reconnect.edgeId === item.edge.id,
            'ng-edge--dimmed': isDimmed(item.edge),
          }"
          :d="item.path"
          :style="edgeStyle(item.edge)"
          :marker-end="item.edge.style?.arrow === 'none' ? undefined : 'url(#ng-arrow)'"
          :marker-start="item.edge.style?.arrow === 'both' ? 'url(#ng-arrow)' : undefined"
        />
      </g>

      <path v-if="pendingPath" class="ng-edge ng-edge--pending" :d="pendingPath" />
      <path v-if="reconnectPath" class="ng-edge ng-edge--pending" :d="reconnectPath" />
    </svg>

    <!-- 选中连线后露出两端的抓手：拖到任意节点（含节点内部）即可重新连 -->
    <template v-for="item in rendered" :key="item.edge.id + '-port'">
      <button
        v-if="isActive(item.edge.id)"
        type="button"
        class="ng-edge-port"
        :style="{ left: item.points.from.x + 'px', top: item.points.from.y + 'px' }"
        :title="'拖动起点，改接到任意节点'"
        aria-label="拖动连线起点"
        @pointerdown.stop="emit('reconnectStart', item.edge.id, 'source', $event)"
        @pointerenter="setHover(item.edge.id)"
        @pointerleave="setHover(null)"
      ></button>
      <button
        v-if="isActive(item.edge.id)"
        type="button"
        class="ng-edge-port"
        :style="{ left: item.points.to.x + 'px', top: item.points.to.y + 'px' }"
        :title="'拖动终点，改接到任意节点'"
        aria-label="拖动连线终点"
        @pointerdown.stop="emit('reconnectStart', item.edge.id, 'target', $event)"
        @pointerenter="setHover(item.edge.id)"
        @pointerleave="setHover(null)"
      ></button>
    </template>

    <div
      v-for="item in rendered"
      :key="item.edge.id + '-label'"
      class="ng-edge-label"
      :class="{
        'ng-edge-label--selected': isSelected(item.edge.id),
        'ng-edge-label--empty': !item.edge.label,
      }"
      :style="item.label ? { left: item.label.x + 'px', top: item.label.y + 'px' } : undefined"
      @pointerdown.stop
      @click.stop="emit('selectEdge', item.edge.id)"
      @dblclick.stop="startEdit(item.edge)"
      @pointerenter="setHover(item.edge.id)"
      @pointerleave="setHover(null)"
    >
      <input
        v-if="editingId === item.edge.id"
        ref="editingInput"
        v-model="editingText"
        class="ng-edge-label__input"
        @pointerdown.stop
        @keydown.enter.prevent="commitEdit"
        @keydown.esc.prevent="editingId = null"
        @blur="commitEdit"
      />
      <!-- 没写标签时只给一个悬停提示，别让占位文字看起来像真内容。 -->
      <span v-else>{{ item.edge.label || '标签' }}</span>
    </div>
  </div>
</template>

<style scoped>
.ng-edge-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

/* SVG 只有 1×1，靠 overflow: visible 把世界坐标里的路径画出来。 */
.ng-edges {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}

.ng-edge {
  fill: none;
  stroke: #94a3b8;
  stroke-width: 1.6;
  pointer-events: none;
}

.ng-edge--selected {
  stroke: #2563eb;
  stroke-width: 2.2;
}

.ng-edge--pending {
  stroke: #2563eb;
  stroke-dasharray: 5 4;
}

/* 正在被拖动改接的那条线淡出，避免和预览线叠在一起 */
.ng-edge--ghost {
  opacity: 0.18;
}

/* 上下游追踪：不在链路里的连线让位给命中链路 */
.ng-edge--dimmed {
  opacity: 0.14;
}

.ng-edge__hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}

/* 选中连线两端的手柄：小圆点，拖到任意节点内部即可改接 */
.ng-edge-port {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid #2563eb;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  cursor: crosshair;
  pointer-events: auto;
  z-index: 4;
}

.ng-edge-port:hover {
  background: #2563eb;
}

.ng-edge-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.ng-edge-label--empty {
  opacity: 0;
  transition: opacity 0.12s ease;
}

.ng-edge-label--empty:hover,
.ng-edge-label--selected.ng-edge-label--empty {
  opacity: 1;
}

.ng-edge-label--selected {
  border-color: #2563eb;
  color: #2563eb;
}

.ng-edge-label__input {
  width: 90px;
  border: none;
  outline: none;
  font-size: 11px;
  text-align: center;
}
</style>
