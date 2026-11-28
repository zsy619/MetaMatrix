<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { JourneyBlockId, JourneyDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: JourneyDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: JourneyBlockId[] = ['aware', 'consider', 'buy', 'use', 'loyal']
const tones: Record<JourneyBlockId, FiveStepPalette> = {
  aware: FIVE_STEP_PALETTE.business,
  consider: FIVE_STEP_PALETTE.hypothesis,
  buy: FIVE_STEP_PALETTE.demand,
  use: FIVE_STEP_PALETTE.solution,
  loyal: FIVE_STEP_PALETTE.growth,
}

function block(id: JourneyBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="客户旅程">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>从第一次知道，到考虑、购买、使用、再来。每段写接触点、痛点和可以改的地方。</p>
    </header>
    <div class="grid">
      <section v-for="id in order" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
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
.sheet-top p { max-width: 46em; color: #3c4043; font-size: 15px; line-height: 1.55; }
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
section { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 8px 10px; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.04em; text-align: center; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
@media (max-width: 1100px) {
  .grid.grid { grid-template-columns: 1fr; }
  section { min-height: 220px; height: auto; }
}
</style>
