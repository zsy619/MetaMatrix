<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  PmCompetencyAxisId,
  PmCompetencyBlock,
  PmCompetencyDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: PmCompetencyDocumentJSON
}>()

const documentStore = useDocumentStore()

// Sync before first render so axisBlocks are defined (v-if hosts).
documentStore.ensurePmCompetencyBlocks()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

/**
 * 顺时针自顶：意识 → 做复盘 → 管执行 → 拆计划 → 定方案
 * （与参考雷达图一致）
 */
const AXIS_ORDER: PmCompetencyAxisId[] = [
  'awareness',
  'review',
  'execution',
  'plan',
  'proposal',
]

/** 底部滑块展示顺序（与雷达轴顺序一致） */
const SLIDER_ORDER: PmCompetencyAxisId[] = [
  'awareness',
  'proposal',
  'plan',
  'execution',
  'review',
]

const AXIS_SHORT: Record<PmCompetencyAxisId, string> = {
  awareness: '项目管理意识',
  proposal: '基本功1：定方案',
  plan: '基本功2：拆计划',
  execution: '基本功3：管执行',
  review: '基本功4：做复盘',
}

/**
 * 五轴固定分色（浅色底可读，色相彼此拉开）。
 * 圆点、顶点标签、底栏滑块共用同一色值。
 * 意识蓝 / 定方案琥珀 / 拆计划红 / 管执行绿 / 做复盘紫
 */
const AXIS_COLOR: Record<PmCompetencyAxisId, string> = {
  awareness: '#2A649F',
  proposal: '#A67C00',
  plan: '#A84562',
  execution: '#187A4E',
  review: '#6B4C9A',
}

function axisColor(axis: PmCompetencyAxisId): string {
  return AXIS_COLOR[axis]
}

const blocksById = computed(() => {
  const map = new Map<PmCompetencyAxisId, PmCompetencyBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockOf(axis: PmCompetencyAxisId): PmCompetencyBlock | undefined {
  return blocksById.value.get(axis)
}

function titleOf(axis: PmCompetencyAxisId): string {
  return props.doc.axes[axis]?.title || AXIS_SHORT[axis]
}

const axisBlocks = computed(() =>
  SLIDER_ORDER.map((axis) => ({
    axis,
    block: blockOf(axis),
    title: titleOf(axis),
  })),
)

/* ---- radar geometry (viewBox 800×720，更大五边形） ---- */
const CX = 400
const CY = 370
const R = 270
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
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function ringPoints(level: number): string {
  const r = (R * level) / LEVELS
  return [0, 1, 2, 3, 4].map((i) => polar(i, r).join(',')).join(' ')
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

const axisLines = [0, 1, 2, 3, 4].map((i) => {
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
    const [x, y] = polar(i, R + 48)
    const title = titleOf(axis)
    let anchor: 'middle' | 'start' | 'end' = 'middle'
    let dy = 0
    if (i === 0) {
      dy = -6
    } else if (i === 1 || i === 2) {
      anchor = 'start'
      dy = i === 2 ? 10 : 0
    } else {
      anchor = 'end'
      dy = i === 3 ? 10 : 0
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

function setScore(axis: PmCompetencyAxisId, value: number) {
  documentStore.updatePmCompetencyScore(axis, clampScore(value))
}

function onSliderInput(axis: PmCompetencyAxisId, event: Event) {
  const el = event.target as HTMLInputElement
  setScore(axis, Number(el.value))
}

/* ---- 顶点点击 → 全局 panel-maximize 全屏富文本 ---- */
const activeEditorAxis = ref<PmCompetencyAxisId | null>(null)

const activeMaximizeKey = computed(() => {
  const axis = activeEditorAxis.value
  if (!axis) return 'pmc:idle'
  const b = blockOf(axis)
  return b ? panelMaximizeKey('block', b.id) : 'pmc:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(axis: PmCompetencyAxisId) {
  documentStore.ensurePmCompetencyBlocks()
  const b = blockOf(axis)
  if (!b) return
  activeEditorAxis.value = axis
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

function onLabelActivate(axis: PmCompetencyAxisId, event: Event) {
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
const dragging = ref<PmCompetencyAxisId | null>(null)
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

function onPointerDown(axis: PmCompetencyAxisId, event: PointerEvent) {
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
  documentStore.ensurePmCompetencyBlocks()
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
    class="pmc-canvas"
    :style="chrome"
    aria-label="项目管理竞争力测评"
  >
    <header class="pmc-title-bar">
      <h1 class="pmc-title">项目管理竞争力测评</h1>
    </header>

    <div class="pmc-stage">
      <svg
        ref="svgRef"
        class="pmc-radar"
        viewBox="0 0 800 720"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="项目管理竞争力五维雷达图"
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
          fill="rgba(100, 181, 246, 0.32)"
          stroke="#42a5f5"
          stroke-width="2.2"
          stroke-linejoin="round"
        />

        <g
          v-for="m in markers"
          :key="`mk-${m.axis}`"
          class="pmc-handle"
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
          class="pmc-vertex-label"
          role="button"
          tabindex="0"
          :style="{ '--axis': axisColor(lb.axis) }"
          :aria-label="`最大化编辑${lb.title}`"
          @click="onLabelActivate(lb.axis, $event)"
          @keydown.enter.prevent="openEditor(lb.axis)"
          @keydown.space.prevent="openEditor(lb.axis)"
        >
          <rect
            :x="lb.anchor === 'middle' ? lb.x - 90 : lb.anchor === 'start' ? lb.x - 4 : lb.x - 176"
            :y="lb.y + lb.dy - 20"
            width="180"
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
            class="pmc-axis-label"
            dominant-baseline="middle"
          >
            {{ lb.title }}
          </text>
        </g>
      </svg>
    </div>

    <div class="pmc-sliders" role="group" aria-label="竞争力分值滑块">
      <label
        v-for="s in sliderPanels"
        :key="`slider-${s.axis}`"
        class="pmc-slider"
        :title="s.title"
        :style="{ '--axis': axisColor(s.axis) }"
      >
        <span class="pmc-slider-name">{{ s.title }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="s.score"
          :aria-label="`${s.title} 滑块`"
          @input="onSliderInput(s.axis, $event)"
        />
        <span class="pmc-slider-val">{{ s.score }}</span>
      </label>
    </div>

    <!--
      隐藏挂载五轴 YModelBlock：点击顶点时写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（panel-maximize 规则）。
    -->
    <div class="pmc-block-host" aria-hidden="true">
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
.pmc-canvas {
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

.pmc-title-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.pmc-title {
  margin: 0;
  font-size: clamp(16px, 1.8vw, 22px);
  font-weight: 800;
  color: #3c4043;
  letter-spacing: 0.04em;
  text-align: center;
}

.pmc-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 更大五边形：占满中心可视区 */
.pmc-radar {
  width: min(100%, 920px);
  height: min(100%, 78vh, 700px);
  max-height: 100%;
  overflow: visible;
  touch-action: none;
  user-select: none;
}

.pmc-axis-label {
  fill: var(--axis, #1565c0);
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.pmc-vertex-label {
  cursor: pointer;
  outline: none;
}

.pmc-vertex-label:hover rect {
  fill: #ffffff;
  stroke: var(--axis, #1565c0);
}

.pmc-vertex-label:focus-visible rect {
  stroke: var(--axis, #1565c0);
  stroke-width: 2;
}

.pmc-handle {
  touch-action: none;
}

.pmc-handle.dragging {
  cursor: grabbing;
}

.pmc-handle:hover rect {
  stroke-width: 2.5;
}

.pmc-sliders {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px 10px;
  padding: 8px 4px 2px;
  border-top: 1px solid #e8eaed;
}

.pmc-slider {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(244, 245, 247, 0.95);
  border: 1px solid #e8eaed;
  box-sizing: border-box;
}

.pmc-slider-name {
  flex: 0 1 auto;
  max-width: 48%;
  font-size: 11px;
  font-weight: 700;
  color: var(--axis, #1565c0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pmc-slider input[type='range'] {
  flex: 1 1 auto;
  min-width: 0;
  height: 4px;
  accent-color: var(--axis, #1565c0);
  cursor: pointer;
}

.pmc-slider-val {
  flex: 0 0 auto;
  min-width: 2em;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 800;
  color: var(--axis, #1565c0);
  text-align: right;
}

/* 离屏挂载源块：最大化由 YModelBlock Teleport 承担 */
.pmc-block-host {
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

@media (max-width: 1100px) {
  .pmc-sliders {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .pmc-sliders {
    grid-template-columns: 1fr;
  }

  .pmc-radar {
    width: min(100%, 640px);
    height: min(100%, 52vh, 480px);
  }

  .pmc-axis-label {
    font-size: 13px;
  }
}
</style>
