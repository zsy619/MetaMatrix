<script setup lang="ts">
import { computed } from 'vue'
import type { IpoBlock, IpoBlockId, IpoDocumentJSON } from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: IpoDocumentJSON
}>()

const EN_LABEL: Record<IpoBlockId, string> = {
  input: 'Input',
  process: 'Process',
  output: 'Output',
  goal: 'Goal',
  pattern: 'Pattern',
  feedback: 'Feedback',
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

const bgColor = computed(
  () => props.doc.theme.background.color || '#f7f5f0',
)
</script>

<template>
  <div class="ipo-canvas" :style="{ backgroundColor: bgColor }" aria-label="IPO梳理画布">
    <!-- Thick red feedback loop (Output → down → left → up into Input) -->
    <svg
      class="ipo-feedback-svg"
      viewBox="0 0 1000 720"
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
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#d32f2f" />
        </marker>
      </defs>
      <path
        d="M 820 400 L 820 655 L 180 655 L 180 400"
        fill="none"
        stroke="#d32f2f"
        stroke-width="4.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        marker-end="url(#ipo-fb-arrow)"
      />
    </svg>

    <div class="ipo-grid">
      <!-- Goal: upper right, box left of label -->
      <section v-show="block('goal')" class="ipo-node ipo-node--goal">
        <div class="ipo-box ipo-box--wide">
          <YModelBlockCard :block="block('goal')!" hide-title />
        </div>
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ block('goal')!.title }}</span>
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
      <section v-show="block('input')" class="ipo-node ipo-node--input">
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ block('input')!.title }}</span>
          <span class="ipo-en">{{ EN_LABEL.input }}</span>
        </div>
        <div class="ipo-box">
          <YModelBlockCard :block="block('input')!" hide-title />
        </div>
      </section>

      <!-- Red arrow Input → Process -->
      <div class="ipo-harrow ipo-harrow--ip" aria-hidden="true">
        <span class="ipo-hshaft" />
        <span class="ipo-htip">▶</span>
      </div>

      <!-- Process -->
      <section v-show="block('process')" class="ipo-node ipo-node--process">
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ block('process')!.title }}</span>
          <span class="ipo-en">{{ EN_LABEL.process }}</span>
        </div>
        <div class="ipo-box">
          <YModelBlockCard :block="block('process')!" hide-title />
        </div>
      </section>

      <!-- Red arrow Process → Output -->
      <div class="ipo-harrow ipo-harrow--po" aria-hidden="true">
        <span class="ipo-hshaft" />
        <span class="ipo-htip">▶</span>
      </div>

      <!-- Output -->
      <section v-show="block('output')" class="ipo-node ipo-node--output">
        <div class="ipo-label ipo-label--accent">
          <span class="ipo-cn">{{ block('output')!.title }}</span>
          <span class="ipo-en">{{ EN_LABEL.output }}</span>
        </div>
        <div class="ipo-box">
          <YModelBlockCard :block="block('output')!" hide-title />
        </div>
      </section>

      <!-- Bidirectional Process ↔ Pattern -->
      <div class="ipo-vlink ipo-vlink--pattern" aria-hidden="true">
        <span class="ipo-varrow">▲</span>
        <span class="ipo-vshaft" />
        <span class="ipo-varrow">▼</span>
      </div>

      <!-- Pattern: below Process -->
      <section v-show="block('pattern')" class="ipo-node ipo-node--pattern">
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ block('pattern')!.title }}</span>
          <span class="ipo-en">{{ EN_LABEL.pattern }}</span>
        </div>
        <div class="ipo-box">
          <YModelBlockCard :block="block('pattern')!" hide-title />
        </div>
      </section>

      <!-- Feedback: bottom, label left of wide box -->
      <section v-show="block('feedback')" class="ipo-node ipo-node--feedback">
        <div class="ipo-label ipo-label--dark">
          <span class="ipo-cn">{{ block('feedback')!.title }}</span>
          <span class="ipo-en">{{ EN_LABEL.feedback }}</span>
        </div>
        <div class="ipo-box ipo-box--wide">
          <YModelBlockCard :block="block('feedback')!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ipo-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f7f5f0;
}

.ipo-feedback-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.ipo-grid {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr) 44px minmax(0, 1fr);
  grid-template-rows:
    minmax(64px, 0.48fr)
    18px
    minmax(0, 1.25fr)
    18px
    minmax(0, 0.9fr)
    minmax(58px, 0.48fr);
  grid-template-areas:
    '.       .    .       .    goal'
    '.       .    .       .    vgoal'
    'input   aip  process apo  output'
    '.       .    vpat    .    .'
    '.       .    pattern .    .'
    'feedback feedback feedback feedback feedback';
  align-items: stretch;
  justify-items: stretch;
}

.ipo-node {
  display: flex;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

.ipo-node--goal {
  grid-area: goal;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding-right: 2px;
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
}

.ipo-node--feedback {
  grid-area: feedback;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 6px 14% 0;
  z-index: 3;
}

.ipo-label {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  align-items: flex-start;
}

.ipo-cn {
  font-size: clamp(18px, 2.1vw, 28px);
  font-weight: 800;
  font-style: italic;
  letter-spacing: 0.04em;
}

.ipo-en {
  font-size: clamp(10px, 1vw, 12px);
  font-weight: 500;
  color: #3c4043;
  letter-spacing: 0.02em;
  margin-top: 1px;
}

.ipo-label--accent .ipo-cn {
  color: #d32f2f;
}

.ipo-label--dark .ipo-cn {
  color: #202124;
  font-size: clamp(16px, 1.8vw, 24px);
}

.ipo-box {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1.5px dashed #9aa0a6;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.62);
  overflow: hidden;
}

.ipo-box--wide {
  flex: 1 1 auto;
  min-height: 52px;
}

.ipo-node--goal .ipo-box--wide {
  flex: 1 1 0;
  min-width: 0;
}

.ipo-node--feedback .ipo-box--wide {
  flex: 1 1 auto;
  max-width: 480px;
  min-height: 48px;
  background: rgba(255, 255, 255, 0.85);
}

.ipo-box :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.ipo-box :deep(.ym-block.selected) {
  outline: 2px solid #1a73e8;
  outline-offset: -2px;
}

/* Horizontal red arrows in gutters */
.ipo-harrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  color: #d32f2f;
  align-self: center;
  height: 100%;
  padding-top: 22px;
  box-sizing: border-box;
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
  height: 2.5px;
  background: #d32f2f;
  border-radius: 1px;
  min-width: 8px;
}

.ipo-htip {
  font-size: 11px;
  line-height: 1;
  margin-left: -2px;
  transform: scaleX(0.9);
}

/* Vertical black bidirectional links */
.ipo-vlink {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  color: #202124;
  font-size: 8px;
  line-height: 1;
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
  width: 1.5px;
  flex: 1;
  min-height: 4px;
  background: #202124;
}

.ipo-varrow {
  font-size: 7px;
  line-height: 1;
  color: #202124;
}

@media (max-width: 720px) {
  .ipo-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ipo-feedback-svg,
  .ipo-harrow,
  .ipo-vlink {
    display: none;
  }

  .ipo-grid {
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
  }

  .ipo-node--goal,
  .ipo-node--feedback {
    flex-direction: column;
    align-items: stretch;
    padding: 0;
  }

  .ipo-node--feedback .ipo-box--wide {
    max-width: none;
  }

  .ipo-box {
    min-height: 120px;
  }
}
</style>
