<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type {
  PmSolutionTriangleAxisId,
  PmSolutionTriangleBlock,
  PmSolutionTriangleDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: PmSolutionTriangleDocumentJSON
}>()

const documentStore = useDocumentStore()

// Sync before first render so axisBlocks are defined (v-if hosts).
documentStore.ensurePmSolutionTriangleBlocks()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

/**
 * 顺时针自顶：投入产出比ROI → 机会窗口 → 机会成本
 * （顶 / 右下 / 左下）
 */
const AXIS_ORDER: PmSolutionTriangleAxisId[] = [
  'roi',
  'opportunity_window',
  'opportunity_cost',
]

/** 底部滑块展示顺序 */
const SLIDER_ORDER: PmSolutionTriangleAxisId[] = [
  'roi',
  'opportunity_cost',
  'opportunity_window',
]

const AXIS_SHORT: Record<PmSolutionTriangleAxisId, string> = {
  roi: 'ROI',
  opportunity_cost: '机会成本',
  opportunity_window: '机会窗口',
}

/**
 * 三顶点固定分色（浅色底可读，色相彼此拉开）。
 * 圆点、顶点标签、底栏滑块共用同一色值。
 * ROI蓝 / 机会成本红 / 机会窗口绿
 */
const AXIS_COLOR: Record<PmSolutionTriangleAxisId, string> = {
  roi: '#1565C0',
  opportunity_cost: '#C62828',
  opportunity_window: '#137333',
}

function axisColor(axis: PmSolutionTriangleAxisId): string {
  return AXIS_COLOR[axis]
}

const blocksById = computed(() => {
  const map = new Map<PmSolutionTriangleAxisId, PmSolutionTriangleBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockOf(axis: PmSolutionTriangleAxisId): PmSolutionTriangleBlock | undefined {
  return blocksById.value.get(axis)
}

function titleOf(axis: PmSolutionTriangleAxisId): string {
  return props.doc.axes[axis]?.title || AXIS_SHORT[axis]
}

const axisBlocks = computed(() =>
  SLIDER_ORDER.map((axis) => ({
    axis,
    block: blockOf(axis),
    title: titleOf(axis),
  })),
)

/* ---- radar geometry (viewBox 800×720，更大三角） ---- */
const CX = 400
const CY = 380
const R = 290
const LEVELS = 4
const SCORE_MAX = 100

function clampScore(n: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(SCORE_MAX, Math.max(0, v))
}

function displayScore(n: number): number {
  return Math.round(clampScore(n))
}

function polar(i: number, r: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function ringPoints(level: number): string {
  const r = (R * level) / LEVELS
  return [0, 1, 2].map((i) => polar(i, r).join(',')).join(' ')
}

const bandLayers = computed(() => {
  const layers: { points: string; fill: string }[] = []
  for (let level = LEVELS; level >= 1; level--) {
    const fill = level % 2 === 0 ? '#f0f1f3' : '#ffffff'
    layers.push({ points: ringPoints(level), fill })
  }
  return layers
})

const ringOutlines = [1, 2, 3, 4].map((level) => ({
  level,
  points: ringPoints(level),
}))

const axisLines = [0, 1, 2].map((i) => {
  const [x, y] = polar(i, R)
  return { axis: AXIS_ORDER[i], x1: CX, y1: CY, x2: x, y2: y, i }
})

const scorePolygon = computed(() =>
  AXIS_ORDER.map((axis, i) => {
    const s = clampScore(props.doc.scores[axis])
    return polar(i, (R * s) / SCORE_MAX).join(',')
  }).join(' '),
)

const markers = computed(() =>
  AXIS_ORDER.map((axis, i) => {
    const s = clampScore(props.doc.scores[axis])
    const [x, y] = polar(i, (R * s) / SCORE_MAX)
    return { axis, i, score: s, x, y }
  }),
)

const labelMeta = computed(() =>
  AXIS_ORDER.map((axis, i) => {
    const [x, y] = polar(i, R + 52)
    const title = titleOf(axis)
    let anchor: 'middle' | 'start' | 'end' = 'middle'
    let dy = 0
    if (i === 0) {
      dy = -8
    } else if (i === 1) {
      anchor = 'start'
      dy = 16
    } else {
      anchor = 'end'
      dy = 16
    }
    return { axis, i, x, y, title, anchor, dy }
  }),
)

const sliderPanels = computed(() =>
  SLIDER_ORDER.map((axis) => ({
    axis,
    title: titleOf(axis),
    score: displayScore(props.doc.scores[axis]),
  })),
)

function setScore(axis: PmSolutionTriangleAxisId, value: number) {
  documentStore.updatePmSolutionTriangleScore(axis, clampScore(value))
}

function onSliderInput(axis: PmSolutionTriangleAxisId, event: Event) {
  const el = event.target as HTMLInputElement
  setScore(axis, Number(el.value))
}

/* ---- 顶点点击 → 全局 panel-maximize 全屏富文本 ---- */
const activeEditorAxis = ref<PmSolutionTriangleAxisId | null>(null)

const activeMaximizeKey = computed(() => {
  const axis = activeEditorAxis.value
  if (!axis) return 'pmst:idle'
  const b = blockOf(axis)
  return b ? panelMaximizeKey('block', b.id) : 'pmst:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(axis: PmSolutionTriangleAxisId) {
  documentStore.ensurePmSolutionTriangleBlocks()
  const b = blockOf(axis)
  if (!b) return
  activeEditorAxis.value = axis
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

function onLabelActivate(axis: PmSolutionTriangleAxisId, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  openEditor(axis)
}

watch(maximizedPanelKey, (key) => {
  if (!key && activeEditorAxis.value) {
    activeEditorAxis.value = null
  }
})

/* ---- pointer drag（短点按 = 打开最大化编辑器） ---- */
const dragging = ref<PmSolutionTriangleAxisId | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const dragStart = ref<{ x: number; y: number } | null>(null)
const dragMoved = ref(false)

function clientToSvg(clientX: number, clientY: number): [number, number] {
  const svg = svgRef.value
  if (!svg) return [clientX, clientY]
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return [clientX, clientY]
  const local = pt.matrixTransform(ctm.inverse())
  return [local.x, local.y]
}

function scoreFromPoint(axisIndex: number, x: number, y: number): number {
  const [ex, ey] = polar(axisIndex, R)
  const vx = ex - CX
  const vy = ey - CY
  const wx = x - CX
  const wy = y - CY
  const len2 = vx * vx + vy * vy
  if (len2 <= 0) return 0
  const t = (wx * vx + wy * vy) / len2
  const clamped = Math.min(1, Math.max(0, t))
  return Math.round(clamped * SCORE_MAX * 10) / 10
}

function onPointerDown(axis: PmSolutionTriangleAxisId, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragging.value = axis
  dragMoved.value = false
  dragStart.value = { x: event.clientX, y: event.clientY }
  const target = event.currentTarget as Element | null
  target?.setPointerCapture?.(event.pointerId)
  const i = AXIS_ORDER.indexOf(axis)
  const [x, y] = clientToSvg(event.clientX, event.clientY)
  setScore(axis, scoreFromPoint(i, x, y))
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  if (dragStart.value) {
    const dx = event.clientX - dragStart.value.x
    const dy = event.clientY - dragStart.value.y
    if (dx * dx + dy * dy > 25) dragMoved.value = true
  }
  const axis = dragging.value
  const i = AXIS_ORDER.indexOf(axis)
  const [x, y] = clientToSvg(event.clientX, event.clientY)
  setScore(axis, scoreFromPoint(i, x, y))
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  const axis = dragging.value
  const wasClick = !dragMoved.value
  const target = event.currentTarget as Element | null
  try {
    target?.releasePointerCapture?.(event.pointerId)
  } catch {
    /* ignore */
  }
  dragging.value = null
  dragStart.value = null
  if (wasClick) openEditor(axis)
}

function onWindowPointerUp() {
  dragging.value = null
  dragStart.value = null
}

onMounted(() => {
  documentStore.ensurePmSolutionTriangleBlocks()
})

if (typeof window !== 'undefined') {
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerUp)
}

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerUp)
  }
  if (
    activeEditorAxis.value &&
    maximizedPanelKey.value === activeMaximizeKey.value
  ) {
    maximizedPanelKey.value = null
  }
})
</script>

<template>
  <div
    class="pmst-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="项目管理方案评估三角形"
  >
    <header class="pmst-title-bar">
      <h1 class="pmst-title">项目管理方案评估三角形</h1>
    </header>

    <div class="pmst-stage">
      <svg
        ref="svgRef"
        class="pmst-radar"
        viewBox="0 0 800 720"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="方案评估三角雷达图"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <polygon
          v-for="(band, idx) in bandLayers"
          :key="`band-${idx}`"
          :points="band.points"
          :fill="band.fill"
          stroke="none"
        />
        <polygon
          v-for="ring in ringOutlines"
          :key="`ring-${ring.level}`"
          :points="ring.points"
          fill="none"
          stroke="#d0d4d9"
          stroke-width="1.2"
          opacity="0.95"
        />
        <line
          v-for="ln in axisLines"
          :key="`axis-${ln.axis}`"
          :x1="ln.x1"
          :y1="ln.y1"
          :x2="ln.x2"
          :y2="ln.y2"
          stroke="#c5c9ce"
          stroke-width="1.1"
          opacity="0.85"
        />
        <polygon
          :points="scorePolygon"
          fill="rgba(79, 195, 247, 0.38)"
          stroke="#29b6f6"
          stroke-width="2.2"
          stroke-linejoin="round"
        />

        <g
          v-for="m in markers"
          :key="`mk-${m.axis}`"
          class="pmst-handle"
          :class="{ dragging: dragging === m.axis }"
          style="cursor: grab"
          @pointerdown="onPointerDown(m.axis, $event)"
        >
          <rect
            :x="m.x - 8"
            :y="m.y - 8"
            width="16"
            height="16"
            rx="2"
            :fill="axisColor(m.axis)"
            stroke="#ffffff"
            stroke-width="1.5"
          />
          <title>
            {{ titleOf(m.axis) }}：{{ displayScore(m.score) }}（拖拽调分 / 点击最大化编辑）
          </title>
        </g>

        <g
          v-for="lb in labelMeta"
          :key="`lb-${lb.axis}`"
          class="pmst-vertex-label"
          role="button"
          tabindex="0"
          :style="{ '--axis': axisColor(lb.axis) }"
          :aria-label="`最大化编辑${lb.title}`"
          @click="onLabelActivate(lb.axis, $event)"
          @keydown.enter.prevent="openEditor(lb.axis)"
          @keydown.space.prevent="openEditor(lb.axis)"
        >
          <rect
            :x="lb.anchor === 'middle' ? lb.x - 86 : lb.anchor === 'start' ? lb.x - 4 : lb.x - 168"
            :y="lb.y + lb.dy - 20"
            width="172"
            height="32"
            rx="8"
            fill="rgba(255,255,255,0.94)"
            stroke="#e8eaed"
            stroke-width="1"
          />
          <text
            :x="lb.x"
            :y="lb.y + lb.dy"
            :text-anchor="lb.anchor"
            class="pmst-axis-label"
            dominant-baseline="middle"
          >
            {{ lb.title }}
          </text>
        </g>
      </svg>
    </div>

    <div class="pmst-sliders" role="group" aria-label="方案评估分值滑块">
      <label
        v-for="s in sliderPanels"
        :key="`slider-${s.axis}`"
        class="pmst-slider"
        :title="s.title"
        :style="{ '--axis': axisColor(s.axis) }"
      >
        <span class="pmst-slider-name">{{ s.title }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="s.score"
          :aria-label="`${s.title} 滑块`"
          @input="onSliderInput(s.axis, $event)"
        />
        <span class="pmst-slider-val">{{ s.score }}</span>
      </label>
    </div>

    <!--
      隐藏挂载三轴 YModelBlock：点击顶点时写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（panel-maximize 规则）。
    -->
    <div class="pmst-block-host" aria-hidden="true">
      <template v-for="item in axisBlocks" :key="item.axis">
        <YModelBlockCard
          v-if="item.block"
          :block="item.block"
          hide-title
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.pmst-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.pmst-title-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.pmst-title {
  margin: 0;
  font-size: clamp(16px, 1.8vw, 22px);
  font-weight: 800;
  color: #3c4043;
  letter-spacing: 0.04em;
  text-align: center;
}

.pmst-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 更大三角：占满中心可视区 */
.pmst-radar {
  width: min(100%, 920px);
  height: min(100%, 78vh, 700px);
  max-height: 100%;
  overflow: visible;
  touch-action: none;
  user-select: none;
}

.pmst-axis-label {
  fill: var(--axis, #1565c0);
  font-size: 18px;
  font-weight: 750;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.pmst-vertex-label {
  cursor: pointer;
  outline: none;
}

.pmst-vertex-label:hover rect {
  fill: #ffffff;
  stroke: var(--axis, #1565c0);
}

.pmst-vertex-label:focus-visible rect {
  stroke: var(--axis, #1565c0);
  stroke-width: 2;
}

.pmst-handle {
  touch-action: none;
}

.pmst-handle.dragging {
  cursor: grabbing;
}

.pmst-handle:hover rect {
  stroke-width: 2.5;
}

.pmst-sliders {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
  padding: 8px 4px 2px;
  border-top: 1px solid #e8eaed;
}

.pmst-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(244, 245, 247, 0.95);
  border: 1px solid #e8eaed;
  box-sizing: border-box;
}

.pmst-slider-name {
  flex: 0 1 auto;
  max-width: 46%;
  font-size: 12px;
  font-weight: 700;
  color: var(--axis, #1565c0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pmst-slider input[type='range'] {
  flex: 1 1 auto;
  min-width: 0;
  height: 4px;
  accent-color: var(--axis, #1565c0);
  cursor: pointer;
}

.pmst-slider-val {
  flex: 0 0 auto;
  min-width: 2em;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 800;
  color: var(--axis, #1565c0);
  text-align: right;
}

/* 离屏挂载源块：最大化由 YModelBlock Teleport 承担 */
.pmst-block-host {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
  padding: 0;
  margin: -1px;
}

@media (max-width: 900px) {
  .pmst-sliders {
    grid-template-columns: 1fr;
  }

  .pmst-radar {
    width: min(100%, 640px);
    height: min(100%, 52vh, 480px);
  }

  .pmst-axis-label {
    font-size: 15px;
  }
}
</style>
