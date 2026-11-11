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
  YModelBlock,
  YModelBlockId,
  YModelDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: YModelDocumentJSON
}>()

const documentStore = useDocumentStore()

const byId = computed(() => {
  const map = new Map<YModelBlockId, YModelBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  if (!map.has('scope') && map.has('problem')) {
    map.set('scope', map.get('problem')!)
  }
  return map
})

function block(id: YModelBlockId): YModelBlock | undefined {
  return byId.value.get(id)
}

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const centerPrefix = computed(() => props.doc.center.prefix || '我的')
const centerSuffix = computed(() => props.doc.center.suffix || '认知')
const centerBlank = computed({
  get: () => props.doc.center.blank ?? '',
  set: (v: string) => {
    if (!props.doc.center) return
    props.doc.center.blank = v
    documentStore.markDirty()
  },
})

const labels = computed(() => {
  const l = props.doc.labels
  return {
    theory: l.theory || '理论',
    facts: l.facts || '事实',
    step1: l.step1 || 'Step1',
    step2: l.step2 || 'Step2',
    step3: l.step3 || 'Step3',
    step4: l.step4 || 'Step4',
  }
})

interface Pt {
  x: number
  y: number
}

interface Stroke {
  x1: number
  y1: number
  x2: number
  y2: number
}

const rootRef = ref<HTMLElement | null>(null)
const vb = ref({ w: 1, h: 1 })
const strokes = ref<Stroke[]>([])

function boxOf(el: Element, rootRect: DOMRect, sx: number, sy: number) {
  const r = el.getBoundingClientRect()
  const left = (r.left - rootRect.left) * sx
  const top = (r.top - rootRect.top) * sy
  const right = (r.right - rootRect.left) * sx
  const bottom = (r.bottom - rootRect.top) * sy
  return {
    left,
    top,
    right,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  }
}

function parallel(a: Pt, b: Pt, dist: number): Stroke {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * dist
  const oy = (dx / len) * dist
  return { x1: a.x + ox, y1: a.y + oy, x2: b.x + ox, y2: b.y + oy }
}

function measure() {
  const root = rootRef.value
  if (!root) return
  const rootRect = root.getBoundingClientRect()
  if (rootRect.width < 2 || rootRect.height < 2) return
  const sx = root.clientWidth / rootRect.width
  const sy = root.clientHeight / rootRect.height
  vb.value = { w: root.clientWidth, h: root.clientHeight }
  const forkEl = root.querySelector('[data-ym="fork"]')
  const leftEl = root.querySelector('[data-ym="left-tip"]')
  const rightEl = root.querySelector('[data-ym="right-tip"]')
  const stemEl = root.querySelector('[data-ym="stem"]')
  if (!forkEl || !leftEl || !rightEl || !stemEl) return
  const fork = boxOf(forkEl, rootRect, sx, sy)
  const left = boxOf(leftEl, rootRect, sx, sy)
  const right = boxOf(rightEl, rootRect, sx, sy)
  const stem = boxOf(stemEl, rootRect, sx, sy)
  const joint = { x: fork.cx, y: fork.top - 10 }
  const leftTip = { x: left.cx, y: left.cy }
  const rightTip = { x: right.cx, y: right.cy }
  const stemTop = { x: fork.cx, y: fork.bottom + 8 }
  const stemEnd = { x: fork.cx, y: Math.max(stem.top - 8, stemTop.y + 24) }
  const gap = 3.5
  strokes.value = [
    parallel(leftTip, joint, -gap),
    parallel(leftTip, joint, gap),
    parallel(rightTip, joint, -gap),
    parallel(rightTip, joint, gap),
    parallel(stemTop, stemEnd, -gap),
    parallel(stemTop, stemEnd, gap),
  ]
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

watch(centerBlank, () => nextTick(measure))
</script>

<template>
  <div class="y-model-canvas" :style="chrome" aria-label="一堂Y模型">
    <div ref="rootRef" class="ym-sheet">
    <div class="ym-grid">
      <span class="step step-3">{{ labels.step3 }}</span>
      <div class="cell cell-existing">
        <YModelBlockCard v-if="block('theory_existing')" editor="card" :block="block('theory_existing')!" />
      </div>
      <h2 class="word word-theory">{{ labels.theory }}</h2>
      <div class="cell cell-build">
        <YModelBlockCard v-if="block('theory_build')" editor="card" :block="block('theory_build')!" />
      </div>
      <div class="cell cell-hypothesis">
        <YModelBlockCard v-if="block('facts_hypothesis')" editor="card" :block="block('facts_hypothesis')!" />
      </div>
      <h2 class="word word-facts">{{ labels.facts }}</h2>
      <div class="cell cell-analysis">
        <YModelBlockCard v-if="block('facts_analysis')" editor="card" :block="block('facts_analysis')!" />
      </div>

      <span class="tip tip-left" data-ym="left-tip"></span>
      <span class="tip tip-right" data-ym="right-tip"></span>

      <span class="step step-2">{{ labels.step2 }}</span>
      <div class="hub" data-ym="fork">
        <span class="hub-prefix">{{ centerPrefix }}</span>
        <input
          v-model="centerBlank"
          class="hub-blank"
          type="text"
          maxlength="12"
          placeholder="____"
          aria-label="填写认知领域"
        />
        <span class="hub-suffix">{{ centerSuffix }}</span>
      </div>
      <div class="cell cell-cause">
        <YModelBlockCard v-if="block('cognition_cause')" editor="card" :block="block('cognition_cause')!" />
      </div>

      <div class="cell cell-effect">
        <YModelBlockCard v-if="block('cognition_effect')" editor="card" :block="block('cognition_effect')!" />
      </div>

      <span class="step step-1">{{ labels.step1 }}</span>
      <div class="cell cell-problem" data-ym="stem">
        <YModelBlockCard v-if="block('scope') || block('problem')" editor="card" :block="(block('scope') || block('problem'))!" />
      </div>
    </div>

    <section class="ym-tools" :aria-label="labels.step4">
      <span class="step">{{ labels.step4 }}</span>
      <div class="cell">
        <YModelBlockCard v-if="block('tools')" editor="card" :block="block('tools')!" />
      </div>
    </section>

    <svg class="ym-links" :viewBox="`0 0 ${vb.w} ${vb.h}`" aria-hidden="true">
      <defs>
        <marker id="ym-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="#6b645c" />
        </marker>
      </defs>
      <line
        v-for="(ln, index) in strokes"
        :key="index"
        :x1="ln.x1"
        :y1="ln.y1"
        :x2="ln.x2"
        :y2="ln.y2"
        stroke="#6b645c"
        stroke-width="1.6"
        stroke-linecap="round"
        marker-start="url(#ym-head)"
        marker-end="url(#ym-head)"
      />
    </svg>
    </div>
  </div>
</template>

<style scoped>
.y-model-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 18px 14px;
  overflow: auto;
  color: #202124;
}

.ym-sheet {
  position: relative;
  flex: 1 1 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.ym-grid {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 680px;
  min-width: 980px;
  display: grid;
  grid-template-columns: 64px minmax(180px, 1.15fr) auto minmax(140px, 0.8fr) minmax(140px, 0.8fr) auto minmax(180px, 1.15fr) minmax(180px, 0.95fr);
  grid-template-rows: 96px minmax(150px, 1fr) auto minmax(110px, 0.7fr) auto;
  gap: 12px 14px;
  align-items: stretch;
}

.step {
  color: #5f6368;
  font-size: 16px;
  font-weight: 650;
  align-self: center;
}

.step-3 { grid-column: 1; grid-row: 2; }
.step-2 { grid-column: 1; grid-row: 3; }
.step-1 { grid-column: 1; grid-row: 5; }

.word {
  margin: 0;
  align-self: center;
  font-size: clamp(26px, 2.6vw, 36px);
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1;
  white-space: nowrap;
}

.word-theory { grid-column: 3; grid-row: 2; justify-self: end; }
.word-facts { grid-column: 6; grid-row: 2; justify-self: start; }

.cell { min-width: 0; min-height: 0; display: flex; }
.cell :deep(.ym-block) { width: 100%; height: 100%; }
.cell :deep(.ym-block-body) { overflow: auto; }
.cell :deep(.ym-block--card) {
  border-radius: 2px;
  border: 1.5px dashed #b7b1a8;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: none;
}
.cell :deep(.ym-block--card .ym-block-header) {
  min-height: 28px;
  padding: 4px 8px;
  background: transparent;
}
.cell :deep(.ym-block--card .ym-block-title) {
  color: #8b9096;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
}
.cell :deep(.ym-block--card .pm-max-btn) {
  color: #5f6368;
  background: transparent;
}
.cell :deep(.pa-root:has(.pa-empty)) { display: none; }

.cell-existing { grid-column: 2; grid-row: 2; }
.cell-build { grid-column: 4; grid-row: 1; }
.cell-hypothesis { grid-column: 5; grid-row: 1; }
.cell-analysis { grid-column: 7; grid-row: 2; }
.cell-cause { grid-column: 7 / 9; grid-row: 3; }
.cell-effect { grid-column: 7 / 9; grid-row: 4; }
.cell-cause :deep(.ym-block-title),
.cell-effect :deep(.ym-block-title) {
  white-space: normal;
  line-height: 1.3;
}
.cell-problem { grid-column: 4 / 6; grid-row: 5; justify-content: center; }
.cell-problem :deep(.ym-block) { max-width: 420px; }

.tip { width: 8px; height: 8px; }
.tip-left { grid-column: 4; grid-row: 2; justify-self: start; align-self: start; }
.tip-right { grid-column: 5; grid-row: 2; justify-self: end; align-self: start; }

.hub {
  grid-column: 3 / 7;
  grid-row: 3;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  padding: 8px 0 4px;
}

.hub-prefix,
.hub-suffix {
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 900;
  letter-spacing: 0.04em;
  line-height: 1;
}

.hub-blank {
  width: 4.2em;
  border: none;
  border-bottom: 3px solid #c5221f;
  background: transparent;
  text-align: center;
  font-size: clamp(26px, 2.8vw, 40px);
  font-weight: 900;
  color: #202124;
  outline: none;
}

.ym-tools {
  position: relative;
  z-index: 1;
  flex: none;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  min-height: 120px;
  margin-top: 14px;
  padding: 12px;
  background: #eceae6;
}

.ym-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  overflow: visible;
}
</style>
