<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { LeanBlockId, LeanCanvasDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_NEGATE_WARM, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: LeanCanvasDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: LeanBlockId[] = ['problem', 'solution', 'metrics', 'uvp', 'advantage', 'channels', 'segments', 'cost', 'revenue']
const tones: Record<LeanBlockId, FiveStepPalette> = {
  problem: FIVE_STEP_NEGATE_WARM,
  solution: FIVE_STEP_PALETTE.solution,
  metrics: { header: '#6A7818', body: '#F4F6E6', topic: '#4E5A10' },
  uvp: FIVE_STEP_PALETTE.demand,
  advantage: FIVE_STEP_PALETTE.hypothesis,
  channels: FIVE_STEP_PALETTE.business,
  segments: FIVE_STEP_PALETTE.moat,
  cost: { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  revenue: FIVE_STEP_PALETTE.growth,
}

function block(id: LeanBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="精益画布">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>先写问题和客户，再写独特价值。用来检验一个还没被证实的想法。</p>
    </header>
    <div class="lean-grid">
      <section
        v-for="id in order"
        :key="id"
        :class="`lean-cell lean-cell--${id}`"
        :data-block="id"
        :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }"
      >
        <h3>{{ block(id)?.title }}</h3>
        <div v-if="block(id)" class="rte-slot">
          <FiveStepPanel
            chrome="fill"
            density="compact"
            :block="block(id)!"
            :header="block(id)!.title"
            :palette="tones[id]"
            :topic-placeholder="block(id)!.hint || '主题'"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; overflow: auto; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.lean-grid { flex: 1 1 auto; min-height: 0; min-width: 860px; display: grid; grid-template-columns: 1fr 1fr 1.15fr 1fr 1fr; grid-template-rows: 1fr 1fr 0.72fr; background: #fff; border: 1px solid var(--cv-frame, #ececec); }
.lean-cell { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--col-body); box-shadow: inset -1px -1px 0 rgba(60, 50, 20, 0.08); }
.lean-cell--problem { grid-area: 1 / 1 / 3 / 2; }
.lean-cell--solution { grid-area: 1 / 2 / 2 / 3; }
.lean-cell--metrics { grid-area: 2 / 2 / 3 / 3; }
.lean-cell--uvp { grid-area: 1 / 3 / 3 / 4; }
.lean-cell--advantage { grid-area: 1 / 4 / 2 / 5; }
.lean-cell--channels { grid-area: 2 / 4 / 3 / 5; }
.lean-cell--segments { grid-area: 1 / 5 / 3 / 6; }
.lean-cell--cost { grid-area: 3 / 1 / 4 / 3; }
.lean-cell--revenue { grid-area: 3 / 3 / 4 / 6; }
h3 { margin: 0; min-height: 36px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; font-size: 14px; letter-spacing: 0.04em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
