<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { FiveForcesBlockId, FiveForcesDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_NEGATE, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: FiveForcesDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: FiveForcesBlockId[] = ['entrants', 'suppliers', 'rivalry', 'buyers', 'substitutes']
const tones: Record<FiveForcesBlockId, FiveStepPalette> = {
  entrants: FIVE_STEP_PALETTE.hypothesis,
  suppliers: FIVE_STEP_PALETTE.demand,
  rivalry: FIVE_STEP_NEGATE,
  buyers: FIVE_STEP_PALETTE.business,
  substitutes: FIVE_STEP_PALETTE.solution,
}

function block(id: FiveForcesBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="波特五力">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>写行业里大家怎么抢，以及谁会把利润拿走。</p>
    </header>
    <div class="forces">
      <section
        v-for="id in order"
        :key="id"
        :class="`force force--${id}`"
        :data-block="id"
        :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }"
      >
        <h3>{{ block(id)?.title }}</h3>
        <div v-if="block(id)" class="rte-slot">
          <FiveStepPanel chrome="fill" density="compact" :block="block(id)!" :header="block(id)!.title" :palette="tones[id]" :topic-placeholder="block(id)!.hint || '主题'" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; overflow: auto; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { max-width: 42em; color: #3c4043; font-size: 15px; line-height: 1.55; }
.forces { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1.25fr 1fr; grid-template-rows: 0.85fr 1.2fr 0.85fr; gap: 10px; }
.force { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
.force--entrants { grid-area: 1 / 2 / 2 / 3; }
.force--suppliers { grid-area: 2 / 1 / 3 / 2; }
.force--rivalry { grid-area: 2 / 2 / 3 / 3; }
.force--buyers { grid-area: 2 / 3 / 3 / 4; }
.force--substitutes { grid-area: 3 / 2 / 4 / 3; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.04em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
@media (max-width: 800px) {
  .forces.forces { display: flex; flex-direction: column; }
  .force,
  .force--entrants,
  .force--suppliers,
  .force--rivalry,
  .force--buyers,
  .force--substitutes { grid-area: auto; min-height: 240px; height: auto; }
}
</style>
