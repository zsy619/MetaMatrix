<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { SevenSBlockId, SevenSDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: SevenSDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: SevenSBlockId[] = ['strategy', 'structure', 'systems', 'shared', 'style', 'staff', 'skills']
const tones: Record<SevenSBlockId, FiveStepPalette> = {
  strategy: FIVE_STEP_PALETTE.demand,
  structure: FIVE_STEP_PALETTE.business,
  systems: FIVE_STEP_PALETTE.solution,
  shared: FIVE_STEP_PALETTE.moat,
  style: FIVE_STEP_PALETTE.hypothesis,
  staff: FIVE_STEP_PALETTE.growth,
  skills: { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
}

function block(id: SevenSBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="麦肯锡 7S">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>共同价值观是大家真正相信的。另外六项如果互相打架，战略就落不下去。</p>
    </header>
    <div class="grid">
      <section
        v-for="id in order"
        :key="id"
        :class="{ shared: id === 'shared' }"
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
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 0.8fr 1fr; gap: 8px; }
.shared { grid-column: 1 / -1; }
section { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 0 8px; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.04em; text-align: center; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
@media (max-width: 800px) {
  .grid.grid { grid-template-columns: 1fr; grid-template-rows: none; }
  section { min-height: 220px; height: auto; }
}
</style>
