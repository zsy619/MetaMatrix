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
  color: string
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

function pair(a: Pt, b: Pt, color: string): Stroke[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * 3.5
  const oy = (dx / len) * 3.5
  return [-1, 1].map((side) => ({
    x1: a.x + ox * side,
    y1: a.y + oy * side,
    x2: b.x + ox * side,
    y2: b.y + oy * side,
    color,
  }))
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
  strokes.value = [
    ...pair(leftTip, joint, '#A67C00'),
    ...pair(rightTip, joint, '#0E8A84'),
    ...pair(stemTop, stemEnd, '#2A649F'),
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
    <ol class="path">
      <li class="path-1"><b>1</b>先写问题</li>
      <li class="path-2"><b>2</b>收成认知</li>
      <li class="path-theory"><b>3</b>理论校正</li>
      <li class="path-facts"><b>3</b>事实检验</li>
      <li class="path-4"><b>4</b>配上工具</li>
    </ol>
    <div class="ym-grid">
      <span class="step step-3"><b>3</b>校正</span>
      <div class="cell cell-existing lane-theory">
        <YModelBlockCard v-if="block('theory_existing')" editor="card" :block="block('theory_existing')!" />
      </div>
      <h2 class="word word-theory">{{ labels.theory }}</h2>
      <div class="cell cell-build lane-theory">
        <YModelBlockCard v-if="block('theory_build')" editor="card" :block="block('theory_build')!" />
      </div>
      <div class="cell cell-hypothesis lane-facts">
        <YModelBlockCard v-if="block('facts_hypothesis')" editor="card" :block="block('facts_hypothesis')!" />
      </div>
      <h2 class="word word-facts">{{ labels.facts }}</h2>
      <div class="cell cell-analysis lane-facts">
        <YModelBlockCard v-if="block('facts_analysis')" editor="card" :block="block('facts_analysis')!" />
      </div>

      <span class="tip tip-left" data-ym="left-tip"></span>
      <span class="tip tip-right" data-ym="right-tip"></span>

      <span class="step step-2"><b>2</b>认知</span>
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
      <div class="cell cell-cause lane-mind">
        <YModelBlockCard v-if="block('cognition_cause')" editor="card" :block="block('cognition_cause')!" />
      </div>

      <div class="cell cell-effect lane-mind">
        <YModelBlockCard v-if="block('cognition_effect')" editor="card" :block="block('cognition_effect')!" />
      </div>

      <span class="step step-1"><b>1</b>问题</span>
      <div class="cell cell-problem lane-problem" data-ym="stem">
        <YModelBlockCard v-if="block('scope') || block('problem')" editor="card" :block="(block('scope') || block('problem'))!" />
      </div>
    </div>

    <section class="ym-tools" :aria-label="labels.step4">
      <span class="step step-4"><b>4</b>工具</span>
      <div class="cell lane-tools">
        <YModelBlockCard v-if="block('tools')" editor="card" :block="block('tools')!" />
      </div>
    </section>

    <svg class="ym-links" :viewBox="`0 0 ${vb.w} ${vb.h}`" aria-hidden="true">
      <line
        v-for="(ln, index) in strokes"
        :key="index"
        :x1="ln.x1"
        :y1="ln.y1"
        :x2="ln.x2"
        :y2="ln.y2"
        :stroke="ln.color"
        stroke-width="2"
        stroke-linecap="round"
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

.path {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.path li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 5px 12px;
  border-radius: 999px;
  background: #fff;
  font-size: 15px;
  font-weight: 650;
}

.path b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
}

.path-1 { color: #84344c; }
.path-1 b { background: #a84562; }
.path-2 { color: #1c4c7c; }
.path-2 b { background: #2a649f; }
.path-theory { color: #7a5c00; }
.path-theory b { background: #a67c00; }
.path-facts { color: #0b6b66; }
.path-facts b { background: #0e8a84; }
.path-4 { color: #125c3b; }
.path-4 b { background: #187a4e; }

.ym-grid {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 680px;
  min-width: 980px;
  display: grid;
  grid-template-columns: 76px minmax(180px, 1.15fr) auto minmax(140px, 0.8fr) minmax(140px, 0.8fr) auto minmax(180px, 1.15fr) minmax(200px, 0.95fr);
  grid-template-rows: 96px minmax(150px, 1fr) auto minmax(110px, 0.7fr) auto;
  gap: 12px 14px;
  align-items: stretch;
}

.step {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #5f6368;
  font-size: 13px;
  font-weight: 700;
  align-self: center;
  white-space: nowrap;
}

.step b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
}

.step-1 { color: #84344c; }
.step-1 b { background: #a84562; }
.step-2 { color: #1c4c7c; }
.step-2 b { background: #2a649f; }
.step-3 { color: #7a5c00; }
.step-3 b { background: #a67c00; }
.step-4 { color: #125c3b; }
.step-4 b { background: #187a4e; }

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

.word-theory { grid-column: 3; grid-row: 2; justify-self: end; color: #7a5c00; }
.word-facts { grid-column: 6; grid-row: 2; justify-self: start; color: #0b6b66; }

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

.lane-theory :deep(.ym-block--card) { border-color: #c4a35a; background: #fffdf6; }
.lane-theory :deep(.ym-block-title) { color: #7a5c00; }
.lane-facts :deep(.ym-block--card) { border-color: #7ec8c4; background: #f4fbfa; }
.lane-facts :deep(.ym-block-title) { color: #0b6b66; }
.lane-mind :deep(.ym-block--card) { border-color: #9bb6d6; background: #f5f8fc; }
.lane-mind :deep(.ym-block-title) { color: #1c4c7c; }
.lane-problem :deep(.ym-block--card) { border-color: #d7a3b4; background: #fff7f9; }
.lane-problem :deep(.ym-block-title) { color: #84344c; }
.lane-tools :deep(.ym-block--card) { border-color: #8fbfa4; background: #fff; }
.lane-tools :deep(.ym-block-title) { color: #125c3b; }

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
  grid-template-columns: 76px minmax(0, 1fr);
  border: 1px solid #cfe3d6;
  border-radius: 12px;
  gap: 12px;
  align-items: stretch;
  min-height: 120px;
  margin: 14px 0 18px;
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

@media (max-width: 1100px) {
  .ym-sheet { flex: 0 0 auto; min-height: max-content; }
  .ym-grid.ym-grid {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: max-content;
  }
  .ym-links,
  .tip { display: none; }
  .step-1,
  .step-2,
  .step-3,
  .word-theory,
  .word-facts,
  .hub,
  .cell-existing,
  .cell-build,
  .cell-hypothesis,
  .cell-analysis,
  .cell-cause,
  .cell-effect,
  .cell-problem {
    grid-column: auto;
    grid-row: auto;
    justify-self: stretch;
    align-self: stretch;
    max-width: none;
  }
  .cell { width: 100%; min-height: 180px; }
  .cell-problem :deep(.ym-block) { max-width: none; }
  .word { font-size: 22px; letter-spacing: 0.08em; }
  .step { font-size: 15px; }
  .hub { flex-wrap: nowrap; justify-content: flex-start; align-items: baseline; gap: 6px; min-width: 0; padding: 4px 0 8px; }
  .hub-prefix,
  .hub-suffix { flex: none; font-size: 26px; }
  .hub-blank { width: 4.6em; min-width: 0; min-height: 44px; font-size: 26px; }
  .ym-tools { grid-template-columns: 1fr; }
  .step-1 { order: 1; }
  .cell-problem { order: 2; }
  .step-2 { order: 3; }
  .hub { order: 4; }
  .cell-cause { order: 5; }
  .cell-effect { order: 6; }
  .step-3 { order: 7; }
  .word-theory { order: 8; }
  .cell-existing { order: 9; }
  .cell-build { order: 10; }
  .word-facts { order: 11; }
  .cell-hypothesis { order: 12; }
  .cell-analysis { order: 13; }
}
</style>
