<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  YModelBlock,
  YModelBlockId,
  YModelDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { FIVE_STEP_PALETTE } from './fiveStepPalette'
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

/** Step2：我的 ____ 认知 */
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
    pageTitle: l.pageTitle || '一堂Y模型：无限进步画布',
    theory: l.theory || '理论',
    facts: l.facts || '事实',
    unity: l.unity || '知行合一',
    step1: l.step1 || 'Step1',
    step2: l.step2 || 'Step2',
    step3: l.step3 || 'Step3',
    step4: l.step4 || 'Step4',
    arrowTheoryOut: l.arrowTheoryOut || '提炼建模',
    arrowFactsOut: l.arrowFactsOut || '假设驱动',
  }
})
</script>

<template>
  <div class="y-model-canvas" :style="chrome" aria-label="一堂Y模型">
    <header class="ym-lead">
      <div>
        <h2>{{ labels.pageTitle }}</h2>
        <p>从最底下的问题写起。中间写成你的认知，左边用理论校正，右边用事实检验，最后配上能执行的工具。</p>
      </div>
      <ol class="ym-steps">
        <li><b>{{ labels.step1 }}</b>写问题</li>
        <li><b>{{ labels.step2 }}</b>写认知</li>
        <li><b>{{ labels.step3 }}</b>校正</li>
        <li><b>{{ labels.step4 }}</b>配工具</li>
      </ol>
    </header>

    <div class="ym-board">
      <h3 class="arm-label arm-label--theory">{{ labels.theory }} · {{ labels.arrowTheoryOut }}</h3>
      <h3 class="arm-label arm-label--facts">{{ labels.facts }} · {{ labels.arrowFactsOut }}</h3>

      <div class="cell cell-existing lane-theory">
        <YModelBlockCard v-if="block('theory_existing')" editor="card" :accent="FIVE_STEP_PALETTE.demand.header" :block="block('theory_existing')!" />
      </div>
      <div class="cell cell-build lane-theory">
        <YModelBlockCard v-if="block('theory_build')" editor="card" :accent="FIVE_STEP_PALETTE.demand.header" :block="block('theory_build')!" />
      </div>

      <section class="hub" aria-label="我的认知">
        <span class="step-tag">{{ labels.step2 }}</span>
        <div class="hub-title-row">
          <span class="hub-prefix">{{ centerPrefix }}</span>
          <input
            v-model="centerBlank"
            class="hub-blank"
            type="text"
            maxlength="24"
            placeholder="领域"
            aria-label="填写认知领域"
          />
          <span class="hub-suffix">{{ centerSuffix }}</span>
        </div>
        <p class="hub-note">{{ labels.unity }}。两边的格子往这里汇合。</p>
      </section>

      <div class="cell cell-hypothesis lane-facts">
        <YModelBlockCard v-if="block('facts_hypothesis')" editor="card" :accent="FIVE_STEP_PALETTE.solution.header" :block="block('facts_hypothesis')!" />
      </div>
      <div class="cell cell-analysis lane-facts">
        <YModelBlockCard v-if="block('facts_analysis')" editor="card" :accent="FIVE_STEP_PALETTE.solution.header" :block="block('facts_analysis')!" />
      </div>

      <div class="cell cell-cause lane-mind">
        <YModelBlockCard v-if="block('cognition_cause')" editor="card" :accent="FIVE_STEP_PALETTE.business.header" :block="block('cognition_cause')!" />
      </div>
      <div class="cell cell-effect lane-mind">
        <YModelBlockCard v-if="block('cognition_effect')" editor="card" :accent="FIVE_STEP_PALETTE.business.header" :block="block('cognition_effect')!" />
      </div>

      <section class="band band-problem">
        <span class="step-tag">{{ labels.step1 }}</span>
        <div class="cell lane-problem">
          <YModelBlockCard v-if="block('scope') || block('problem')" editor="card" :accent="FIVE_STEP_PALETTE.moat.header" :block="(block('scope') || block('problem'))!" />
        </div>
      </section>

      <section class="band band-tools">
        <span class="step-tag">{{ labels.step4 }}</span>
        <div class="cell lane-tools">
          <YModelBlockCard v-if="block('tools')" editor="card" :accent="FIVE_STEP_PALETTE.growth.header" :block="block('tools')!" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.y-model-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #202124;
}

.ym-lead {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
}

.ym-lead h2,
.ym-lead p {
  margin: 0;
}

.ym-lead h2 {
  font-size: 20px;
  letter-spacing: 0.01em;
}

.ym-lead p {
  margin-top: 4px;
  max-width: 62ch;
  color: #5c574e;
  font-size: 13px;
  line-height: 1.5;
}

.ym-steps {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  flex-shrink: 0;
}

.ym-steps li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #3c4043;
  font-size: 12px;
  white-space: nowrap;
}

.ym-steps b {
  color: #1c4c7c;
  font-weight: 700;
}

.ym-board {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(168px, 0.9fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1.05fr) minmax(0, 0.9fr) minmax(120px, 0.82fr) minmax(108px, 0.74fr);
  gap: 10px 8px;
}

.arm-label {
  margin: 0;
  align-self: end;
  font-size: 13px;
  letter-spacing: 0.08em;
}

.arm-label--theory {
  grid-column: 1 / 3;
  color: #7a5c00;
}

.arm-label--facts {
  grid-column: 4 / 6;
  color: #0b6b66;
  text-align: right;
}

.cell {
  min-width: 0;
  min-height: 0;
  display: flex;
}

.cell :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.94);
}

.cell-existing { grid-column: 1; grid-row: 2; }
.cell-build { grid-column: 2; grid-row: 2; }
.cell-hypothesis { grid-column: 4; grid-row: 2; }
.cell-analysis { grid-column: 5; grid-row: 2; }
.cell-cause { grid-column: 1 / 3; grid-row: 3; }
.cell-effect { grid-column: 4 / 6; grid-row: 3; }

.hub {
  grid-column: 3;
  grid-row: 2 / 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 12px 10px;
  border-radius: 16px;
  background:
    linear-gradient(#f7f4ee, #f7f4ee) padding-box,
    linear-gradient(180deg, #a67c00, #1c4c7c 55%, #0e8a84) border-box;
  border: 2px solid transparent;
}

.hub-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}

.hub-prefix,
.hub-suffix {
  font-size: clamp(20px, 2vw, 28px);
  font-weight: 800;
  letter-spacing: 0.06em;
}

.hub-blank {
  width: 5.2em;
  border: none;
  border-bottom: 2px solid #8a8175;
  background: transparent;
  text-align: center;
  font-size: clamp(18px, 1.8vw, 24px);
  font-weight: 800;
  color: #1c4c7c;
  outline: none;
}

.hub-blank:focus {
  border-bottom-color: #1c4c7c;
}

.hub-note {
  margin: 0;
  max-width: 16em;
  color: #5c574e;
  font-size: 12px;
  line-height: 1.45;
}

.band {
  grid-column: 1 / -1;
  min-height: 0;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
}

.band-problem { grid-row: 4; }
.band-tools { grid-row: 5; }

.step-tag {
  align-self: center;
  justify-self: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #5f6368;
}

.cell :deep(.ym-block--card) {
  width: 100%;
}

@media (max-width: 980px) {
  .y-model-canvas {
    overflow: auto;
  }

  .ym-lead {
    flex-direction: column;
    align-items: flex-start;
  }

  .ym-steps {
    flex-wrap: wrap;
  }

  .ym-board {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto auto auto auto auto;
    height: auto;
    flex: none;
  }

  .arm-label--theory { grid-column: 1 / -1; grid-row: 1; text-align: left; }
  .arm-label--facts { grid-column: 1 / -1; grid-row: 3; text-align: left; }
  .cell-existing, .cell-build { grid-row: 2; }
  .cell-existing { grid-column: 1; }
  .cell-build { grid-column: 2; }
  .cell-hypothesis, .cell-analysis { grid-row: 4; }
  .cell-hypothesis { grid-column: 1; }
  .cell-analysis { grid-column: 2; }
  .hub { grid-column: 1 / -1; grid-row: 5; }
  .cell-cause, .cell-effect { grid-row: 6; }
  .cell-cause { grid-column: 1; }
  .cell-effect { grid-column: 2; }
  .band-problem { grid-row: 7; }
  .band-tools { grid-row: 8; }
  .cell { min-height: 140px; }
}


</style>
