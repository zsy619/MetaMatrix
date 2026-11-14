<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { SwotBlockId, SwotDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_NEGATE, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: SwotDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: SwotBlockId[] = ['strengths', 'weaknesses', 'opportunities', 'threats']
const tones: Record<SwotBlockId, FiveStepPalette> = {
  strengths: FIVE_STEP_PALETTE.growth,
  weaknesses: FIVE_STEP_NEGATE,
  opportunities: FIVE_STEP_PALETTE.business,
  threats: FIVE_STEP_PALETTE.demand,
}

function block(id: SwotBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="SWOT 分析">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>内部看优势和劣势，外部看机会和威胁。</p>
    </header>
    <div class="swot-grid">
      <section
        v-for="id in order"
        :key="id"
        :data-block="id"
        :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body, '--col-topic': tones[id].topic }"
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
.sheet-top p { max-width: 42em; color: #3c4043; font-size: 15px; line-height: 1.55; }
.swot-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
section { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.06em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
@media (max-width: 800px) {
  .swot-grid.swot-grid { grid-template-columns: 1fr; grid-template-rows: none; }
  section { min-height: 240px; height: auto; }
}
</style>
