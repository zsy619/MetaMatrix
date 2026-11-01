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
import type { IpoBlock, IpoBlockId, IpoDocumentJSON } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: IpoDocumentJSON
}>()

const documentStore = useDocumentStore()

/** Sync before first render so hidden YModelBlock hosts have real ids (v-if). */
documentStore.ensureIpoBlocks()

const BLOCK_ORDER: IpoBlockId[] = [
  'input',
  'process',
  'output',
  'goal',
  'pattern',
  'feedback',
]

const EN_LABEL: Record<IpoBlockId, string> = {
  input: 'Input',
  process: 'Process',
  output: 'Output',
  goal: 'Goal',
  pattern: 'Pattern',
  feedback: 'Feedback',
}

const DEFAULT_CN: Record<IpoBlockId, string> = {
  input: '输入',
  process: '处理',
  output: '输出',
  goal: '目标',
  pattern: '模型',
  feedback: '反馈',
}

const byId = computed(() => {
  const map = new Map<IpoBlockId, IpoBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: IpoBlockId): IpoBlock | undefined {
  return byId.value.get(id)
}

function titleOf(id: IpoBlockId): string {
  return block(id)?.title || DEFAULT_CN[id]
}

const hostBlocks = computed(() =>
  BLOCK_ORDER.map((id) => ({
    id,
    block: block(id),
  })),
)

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

/* ---- 节点点击 → 全局 panel-maximize 全屏富文本 ---- */
const activeEditorId = ref<IpoBlockId | null>(null)

const activeMaximizeKey = computed(() => {
  const id = activeEditorId.value
  if (!id) return 'ipo:idle'
  const b = block(id)
  return b ? panelMaximizeKey('block', b.id) : 'ipo:idle'
})

const { maximizedPanelKey } = usePanelMaximize(activeMaximizeKey)

function openEditor(id: IpoBlockId) {
  documentStore.ensureIpoBlocks()
  const b = block(id)
  if (!b) return
  activeEditorId.value = id
  const key = panelMaximizeKey('block', b.id)
  nextTick(() => {
    maximizedPanelKey.value = key
  })
}

function onNodeActivate(id: IpoBlockId, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  openEditor(id)
}

watch(maximizedPanelKey, (key) => {
  if (!key && activeEditorId.value) {
    activeEditorId.value = null
  }
})

onMounted(() => {
  documentStore.ensureIpoBlocks()
})

onBeforeUnmount(() => {
  if (
    activeEditorId.value &&
    maximizedPanelKey.value === activeMaximizeKey.value
  ) {
    maximizedPanelKey.value = null
  }
})
</script>

<template>
  <div class="ipo-canvas" :style="chrome" aria-label="IPO梳理画布">
    <div class="ipo-grid">
      <!-- Feedback loop tracks the compact diagram bounds (Output → down → left → up into Input) -->
      <svg
        class="ipo-feedback-svg"
        viewBox="0 0 1000 560"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="ipo-fb-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#A84562" />
          </marker>
        </defs>
        <path
          d="M 870 250 L 870 500 L 130 500 L 130 250"
          fill="none"
          stroke="#A84562"
          stroke-width="4"
          stroke-linejoin="round"
          stroke-linecap="round"
          marker-end="url(#ipo-fb-arrow)"
        />
      </svg>
      <!-- Goal: upper right, box left of label -->
      <section
        v-show="block('goal')"
        class="ipo-node ipo-node--goal ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('goal')}`"
        @click="onNodeActivate('goal', $event)"
        @keydown.enter.prevent="openEditor('goal')"
        @keydown.space.prevent="openEditor('goal')"
      >
        <div class="ipo-box ipo-box--wide" aria-hidden="true" />
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ titleOf('goal') }}</span>
          <span class="ipo-en">{{ EN_LABEL.goal }}</span>
        </div>
      </section>

      <!-- Bidirectional Goal ↔ Output -->
      <div class="ipo-vlink ipo-vlink--goal" aria-hidden="true">
        <span class="ipo-varrow">▲</span>
        <span class="ipo-vshaft" />
        <span class="ipo-varrow">▼</span>
      </div>

      <!-- Input -->
      <section
        v-show="block('input')"
        class="ipo-node ipo-node--input ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('input')}`"
        @click="onNodeActivate('input', $event)"
        @keydown.enter.prevent="openEditor('input')"
        @keydown.space.prevent="openEditor('input')"
      >
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ titleOf('input') }}</span>
          <span class="ipo-en">{{ EN_LABEL.input }}</span>
        </div>
        <div class="ipo-box" aria-hidden="true" />
      </section>

      <!-- Red arrow Input → Process -->
      <div class="ipo-harrow ipo-harrow--ip" aria-hidden="true">
        <span class="ipo-hshaft" />
        <span class="ipo-htip">▶</span>
      </div>

      <!-- Process -->
      <section
        v-show="block('process')"
        class="ipo-node ipo-node--process ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('process')}`"
        @click="onNodeActivate('process', $event)"
        @keydown.enter.prevent="openEditor('process')"
        @keydown.space.prevent="openEditor('process')"
      >
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ titleOf('process') }}</span>
          <span class="ipo-en">{{ EN_LABEL.process }}</span>
        </div>
        <div class="ipo-box" aria-hidden="true" />
      </section>

      <!-- Red arrow Process → Output -->
      <div class="ipo-harrow ipo-harrow--po" aria-hidden="true">
        <span class="ipo-hshaft" />
        <span class="ipo-htip">▶</span>
      </div>

      <!-- Output -->
      <section
        v-show="block('output')"
        class="ipo-node ipo-node--output ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('output')}`"
        @click="onNodeActivate('output', $event)"
        @keydown.enter.prevent="openEditor('output')"
        @keydown.space.prevent="openEditor('output')"
      >
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ titleOf('output') }}</span>
          <span class="ipo-en">{{ EN_LABEL.output }}</span>
        </div>
        <div class="ipo-box" aria-hidden="true" />
      </section>

      <!-- Bidirectional Process ↔ Pattern -->
      <div class="ipo-vlink ipo-vlink--pattern" aria-hidden="true">
        <span class="ipo-varrow">▲</span>
        <span class="ipo-vshaft" />
        <span class="ipo-varrow">▼</span>
      </div>

      <!-- Pattern: below Process -->
      <section
        v-show="block('pattern')"
        class="ipo-node ipo-node--pattern ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('pattern')}`"
        @click="onNodeActivate('pattern', $event)"
        @keydown.enter.prevent="openEditor('pattern')"
        @keydown.space.prevent="openEditor('pattern')"
      >
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ titleOf('pattern') }}</span>
          <span class="ipo-en">{{ EN_LABEL.pattern }}</span>
        </div>
        <div class="ipo-box" aria-hidden="true" />
      </section>

      <!-- Feedback: bottom, label left of wide box -->
      <section
        v-show="block('feedback')"
        class="ipo-node ipo-node--feedback ipo-node--clickable"
        role="button"
        tabindex="0"
        :aria-label="`最大化编辑${titleOf('feedback')}`"
        @click="onNodeActivate('feedback', $event)"
        @keydown.enter.prevent="openEditor('feedback')"
        @keydown.space.prevent="openEditor('feedback')"
      >
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ titleOf('feedback') }}</span>
          <span class="ipo-en">{{ EN_LABEL.feedback }}</span>
        </div>
        <div class="ipo-box ipo-box--wide" aria-hidden="true" />
      </section>
    </div>

    <!--
      隐藏挂载六块 YModelBlock：点击节点时写入全局 maximizedPanelKey，
      由块内 Teleport .pm-overlay 铺满文档视口（panel-maximize 规则）。
      必须用 v-if（非 v-show），避免空 id 挂载崩溃。
    -->
    <div class="ipo-block-host" aria-hidden="true">
      <template v-for="item in hostBlocks" :key="item.id">
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
.ipo-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 28px 32px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  background: #f7f5f0;
  scrollbar-gutter: stable;
}

.ipo-canvas::-webkit-scrollbar {
  width: 8px;
}

.ipo-canvas::-webkit-scrollbar-thumb {
  background: rgba(32, 33, 36, 0.22);
  border-radius: 999px;
}

.ipo-grid {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  width: min(100%, 920px);
  max-width: 920px;
  min-height: 0;
  display: grid;
  /* Modest flowchart columns — boxes stay ~240px, not full-bleed fr tracks */
  grid-template-columns: 240px 44px 240px 44px 240px;
  grid-template-rows:
    auto
    22px
    auto
    22px
    auto
    auto;
  grid-template-areas:
    '.       .    .       .    goal'
    '.       .    .       .    vgoal'
    'input   aip  process apo  output'
    '.       .    vpat    .    .'
    '.       .    pattern .    .'
    'feedback feedback feedback feedback feedback';
  align-items: start;
  justify-items: stretch;
  justify-content: center;
  column-gap: 0;
  row-gap: 10px;
  place-content: center;
  margin: 0 auto;
}

.ipo-feedback-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}

.ipo-node {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

.ipo-node--clickable {
  cursor: pointer;
  outline: none;
  border-radius: 8px;
}

.ipo-node--clickable:hover .ipo-box {
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.18);
}

.ipo-node--clickable:focus-visible .ipo-box {
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.28);
}

.ipo-node--clickable:hover .ipo-cn {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ipo-node--goal {
  grid-area: goal;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 0;
  justify-self: end;
  width: 100%;
}

.ipo-node--input {
  grid-area: input;
  flex-direction: column;
  gap: 6px;
}

.ipo-node--process {
  grid-area: process;
  flex-direction: column;
  gap: 6px;
}

.ipo-node--output {
  grid-area: output;
  flex-direction: column;
  gap: 6px;
}

.ipo-node--pattern {
  grid-area: pattern;
  flex-direction: column;
  gap: 6px;
  justify-self: center;
  width: 240px;
}

.ipo-node--feedback {
  grid-area: feedback;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 0;
  z-index: 3;
  width: 100%;
}

.ipo-label {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  align-items: flex-start;
  gap: 1px;
}

.ipo-cn {
  font-size: clamp(16px, 1.6vw, 22px);
  font-weight: 800;
  font-style: italic;
  letter-spacing: 0.03em;
}

.ipo-en {
  font-size: 11px;
  font-weight: 500;
  color: #5f6368;
  letter-spacing: 0.04em;
  text-transform: none;
}

.ipo-label--accent .ipo-cn {
  color: #A84562;
}

.ipo-label--dark .ipo-cn {
  color: #202124;
  font-size: clamp(15px, 1.4vw, 18px);
  font-style: italic;
}

/* Modest click targets — do NOT flex-grow into leftover viewport */
.ipo-box {
  flex: 0 0 auto;
  width: 100%;
  height: 120px;
  max-height: 120px;
  min-width: 0;
  box-sizing: border-box;
  display: block;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(32, 33, 36, 0.06);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ipo-box--wide {
  flex: 0 0 auto;
  height: 56px;
  max-height: 56px;
  min-height: 56px;
}

.ipo-node--goal .ipo-box--wide {
  flex: 1 1 auto;
  width: auto;
  min-width: 140px;
  max-width: 200px;
  height: 56px;
  max-height: 56px;
  background: #fff;
  border-color: #b0b4b8;
}

.ipo-node--feedback .ipo-box--wide {
  flex: 0 1 auto;
  width: min(100%, 420px);
  max-width: 420px;
  height: 56px;
  max-height: 56px;
  background: #fff;
  border-color: #b0b4b8;
  box-shadow: 0 1px 3px rgba(32, 33, 36, 0.08);
}

.ipo-node--input .ipo-box,
.ipo-node--process .ipo-box,
.ipo-node--output .ipo-box,
.ipo-node--pattern .ipo-box {
  border-color: var(--cv-frame, #ececec);
  box-shadow: 0 1px 3px rgba(32, 33, 36, 0.07);
}

.ipo-node--process .ipo-box {
  border-color: #A84562;
  border-width: 1.5px;
  background: #FBEFF2;
}

/* Horizontal red arrows — sit mid of the box (offset past CN/EN label) */
.ipo-harrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  color: #A84562;
  align-self: start;
  height: 120px;
  margin-top: 28px; /* ~label stack so shaft hits box center */
  box-sizing: border-box;
  z-index: 2;
}

.ipo-harrow--ip {
  grid-area: aip;
}

.ipo-harrow--po {
  grid-area: apo;
}

.ipo-hshaft {
  display: block;
  flex: 1;
  height: 3px;
  background: #A84562;
  border-radius: 2px;
  min-width: 8px;
}

.ipo-htip {
  font-size: 12px;
  line-height: 1;
  margin-left: -1px;
  transform: scaleX(0.95);
}

.ipo-vlink {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: #202124;
  font-size: 9px;
  line-height: 1;
  padding: 0;
  height: 100%;
  z-index: 2;
}

.ipo-vlink--goal {
  grid-area: vgoal;
  justify-self: center;
}

.ipo-vlink--pattern {
  grid-area: vpat;
  justify-self: center;
}

.ipo-vshaft {
  display: block;
  width: 2px;
  flex: 1;
  min-height: 8px;
  background: #202124;
  border-radius: 1px;
}

.ipo-varrow {
  font-size: 8px;
  line-height: 1;
  color: #202124;
}

.ipo-block-host {
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
  .ipo-grid {
    width: min(100%, 760px);
    grid-template-columns: minmax(180px, 1fr) 36px minmax(180px, 1fr) 36px minmax(180px, 1fr);
  }

  .ipo-node--pattern {
    width: 100%;
  }

  .ipo-box {
    height: 108px;
    max-height: 108px;
  }

  .ipo-harrow {
    height: 108px;
  }
}

@media (max-width: 720px) {
  .ipo-canvas {
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px;
    justify-content: flex-start;
  }

  .ipo-feedback-svg,
  .ipo-harrow,
  .ipo-vlink {
    display: none;
  }

  .ipo-grid {
    width: 100%;
    max-width: 420px;
    min-height: 0;
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-template-areas:
      'goal'
      'input'
      'process'
      'output'
      'pattern'
      'feedback';
    gap: 14px;
    row-gap: 14px;
  }

  .ipo-node--goal,
  .ipo-node--feedback {
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    gap: 6px;
    justify-self: stretch;
    width: 100%;
  }

  .ipo-node--goal .ipo-box--wide,
  .ipo-node--feedback .ipo-box--wide {
    max-width: none;
    width: 100%;
  }

  .ipo-node--pattern {
    width: 100%;
  }

  .ipo-node--input,
  .ipo-node--process,
  .ipo-node--output,
  .ipo-node--pattern {
    padding: 0;
  }

  .ipo-box {
    height: 100px;
    max-height: 100px;
  }
}
</style>
