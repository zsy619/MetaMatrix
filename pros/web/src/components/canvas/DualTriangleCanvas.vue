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
  DualTriangleBlock,
  DualTriangleBlockId,
  DualTriangleDocumentJSON,
} from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'
import DualTriangleBlockCard from './DualTriangleBlock.vue'
import DualTriangleCenter from './DualTriangleCenter.vue'

const props = defineProps<{
  doc: DualTriangleDocumentJSON
}>()

const selection = useSelectionStore()

const byId = computed(() => {
  const map = new Map<DualTriangleBlockId, DualTriangleBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: DualTriangleBlockId): DualTriangleBlock | undefined {
  return byId.value.get(id)
}

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

type LinkMode = 'to-right' | 'to-left' | 'to-down'

const LINK_SPECS: { id: DualTriangleBlockId; mode: LinkMode }[] = [
  { id: 'innovation', mode: 'to-right' },
  { id: 'scenario', mode: 'to-left' },
  { id: 'aesthetics', mode: 'to-right' },
  { id: 'data', mode: 'to-left' },
  { id: 'system', mode: 'to-down' },
  { id: 'basics', mode: 'to-down' },
]

interface DrawnLink {
  id: DualTriangleBlockId
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

const rootRef = ref<HTMLElement | null>(null)
const hoverId = ref<string | null>(null)
const vb = ref({ w: 1, h: 1 })
const rawLinks = ref<DrawnLink[]>([])

const links = computed(() =>
  rawLinks.value.map((ln) => ({
    ...ln,
    hot: hoverId.value === ln.id || selection.blockId === ln.id,
  })),
)

function hot(id: DualTriangleBlockId): boolean {
  return hoverId.value === id || selection.blockId === id
}

function onCardEnter(id: DualTriangleBlockId) {
  hoverId.value = id
}

function onCardLeave(id: DualTriangleBlockId) {
  if (hoverId.value === id) hoverId.value = null
}

function onCenterHover(id: string | null) {
  hoverId.value = id
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  cy: number
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

function boxOf(
  el: Element,
  rootRect: DOMRect,
  sx: number,
  sy: number,
): Box {
  const r = el.getBoundingClientRect()
  const left = (r.left - rootRect.left) * sx
  const top = (r.top - rootRect.top) * sy
  const right = (r.right - rootRect.left) * sx
  const bottom = (r.bottom - rootRect.top) * sy
  return {
    left,
    right,
    top,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  }
}

function measure() {
  const root = rootRef.value
  if (!root) return
  const rootRect = root.getBoundingClientRect()
  if (rootRect.width < 2 || rootRect.height < 2) return
  const sx = root.clientWidth / rootRect.width
  const sy = root.clientHeight / rootRect.height
  vb.value = { w: root.clientWidth, h: root.clientHeight }

  const next: DrawnLink[] = []
  for (const spec of LINK_SPECS) {
    const cardEl = root.querySelector(`[data-dt-card="${spec.id}"]`)
    const kwEl = root.querySelector(`[data-dt-kw="${spec.id}"]`)
    if (!cardEl || !kwEl) continue
    const card = boxOf(cardEl, rootRect, sx, sy)
    const kw = boxOf(kwEl, rootRect, sx, sy)
    const color = block(spec.id)?.accentColor || '#c5c9ce'
    let x1 = 0
    let y1 = 0
    let x2 = 0
    let y2 = 0
    if (spec.mode === 'to-right') {
      y2 = kw.cy
      y1 = clamp(y2, card.top + 12, card.bottom - 12)
      x1 = card.right
      x2 = kw.left - 5
    } else if (spec.mode === 'to-left') {
      y2 = kw.cy
      y1 = clamp(y2, card.top + 12, card.bottom - 12)
      x1 = kw.right + 5
      x2 = card.left
    } else {
      x1 = kw.cx
      y1 = kw.bottom + 3
      x2 = clamp(x1, card.left + 16, card.right - 16)
      y2 = card.top
    }
    if (Math.hypot(x2 - x1, y2 - y1) < 4) continue
    next.push({ id: spec.id, x1, y1, x2, y2, color })
  }
  rawLinks.value = next
}

let ro: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  measure()
  requestAnimationFrame(measure)
  if (rootRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(rootRef.value)
  }
  document.fonts?.ready.then(() => measure()).catch(() => {})
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

watch(
  () => props.doc.blocks.map((b) => `${b.keyword}:${b.accentColor}`).join('|'),
  () => nextTick(measure),
)
</script>

<template>
  <div
    ref="rootRef"
    class="dual-triangle-canvas"
    :style="chrome"
    aria-label="双三角构建梳理"
  >
    <div class="dt-grid">
      <div
        class="cell cell-innovation"
        data-dt-card="innovation"
        :class="{ 'is-hot': hot('innovation') }"
        @mouseenter="onCardEnter('innovation')"
        @mouseleave="onCardLeave('innovation')"
      >
        <DualTriangleBlockCard
          v-if="block('innovation')"
          :block="block('innovation')!"
        />
      </div>
      <div class="cell cell-center">
        <DualTriangleCenter
          :center="doc.center"
          :blocks="doc.blocks"
          @hover="onCenterHover"
        />
      </div>
      <div
        class="cell cell-scenario"
        data-dt-card="scenario"
        :class="{ 'is-hot': hot('scenario') }"
        @mouseenter="onCardEnter('scenario')"
        @mouseleave="onCardLeave('scenario')"
      >
        <DualTriangleBlockCard
          v-if="block('scenario')"
          :block="block('scenario')!"
        />
      </div>
      <div
        class="cell cell-aesthetics"
        data-dt-card="aesthetics"
        :class="{ 'is-hot': hot('aesthetics') }"
        @mouseenter="onCardEnter('aesthetics')"
        @mouseleave="onCardLeave('aesthetics')"
      >
        <DualTriangleBlockCard
          v-if="block('aesthetics')"
          :block="block('aesthetics')!"
        />
      </div>
      <div
        class="cell cell-system"
        data-dt-card="system"
        :class="{ 'is-hot': hot('system') }"
        @mouseenter="onCardEnter('system')"
        @mouseleave="onCardLeave('system')"
      >
        <DualTriangleBlockCard
          v-if="block('system')"
          :block="block('system')!"
        />
      </div>
      <div
        class="cell cell-basics"
        data-dt-card="basics"
        :class="{ 'is-hot': hot('basics') }"
        @mouseenter="onCardEnter('basics')"
        @mouseleave="onCardLeave('basics')"
      >
        <DualTriangleBlockCard
          v-if="block('basics')"
          :block="block('basics')!"
        />
      </div>
      <div
        class="cell cell-data"
        data-dt-card="data"
        :class="{ 'is-hot': hot('data') }"
        @mouseenter="onCardEnter('data')"
        @mouseleave="onCardLeave('data')"
      >
        <DualTriangleBlockCard v-if="block('data')" :block="block('data')!" />
      </div>
    </div>

    <svg
      class="dt-links"
      :viewBox="`0 0 ${vb.w} ${vb.h}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        v-for="ln in links"
        :key="ln.id"
        :x1="ln.x1"
        :y1="ln.y1"
        :x2="ln.x2"
        :y2="ln.y2"
        :stroke="ln.hot ? ln.color : '#aeb4bb'"
        :stroke-width="ln.hot ? 1.8 : 1.35"
        stroke-linecap="round"
        stroke-dasharray="1.2 3.4"
      />
    </svg>
  </div>
</template>

<style scoped>
.dual-triangle-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 16px 12px;
}

/**
 * 对照参考图：
 * [创新]                 [场景]
 *        [双三角 + 关键词]
 * [审美]   [体系] [基本功]  [数据]
 * 审美/数据更高，体系/基本功贴底，三角压在中缝上。
 */
.dt-grid {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns:
    minmax(0, 1.16fr) minmax(0, 0.84fr) minmax(0, 0.84fr) minmax(0, 1.16fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 0.42fr) minmax(0, 0.96fr);
  grid-template-areas:
    'innovation center center scenario'
    'aesthetics center center data'
    'aesthetics system basics data';
  gap: 12px 14px;
}

.cell {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cell-innovation {
  grid-area: innovation;
}

.cell-scenario {
  grid-area: scenario;
}

.cell-center {
  grid-area: center;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  overflow: visible;
}

.cell-center > :deep(*) {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.cell-aesthetics {
  grid-area: aesthetics;
}

.cell-system {
  grid-area: system;
}

.cell-basics {
  grid-area: basics;
}

.cell-data {
  grid-area: data;
}

.dt-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  overflow: visible;
}

@media (max-width: 960px) {
  .dual-triangle-canvas {
    overflow: auto;
  }

  .dt-grid {
    min-height: 980px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: 240px 340px 240px 220px;
    grid-template-areas:
      'innovation scenario'
      'center center'
      'aesthetics data'
      'system basics';
    gap: 10px;
  }
}
</style>
