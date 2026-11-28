<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { VrioBlockId, VrioDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: VrioDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: VrioBlockId[] = ['value', 'rarity', 'imitability', 'organization']
const tones: Record<VrioBlockId, FiveStepPalette> = {
  value: FIVE_STEP_PALETTE.business,
  rarity: FIVE_STEP_PALETTE.hypothesis,
  imitability: FIVE_STEP_PALETTE.moat,
  organization: FIVE_STEP_PALETTE.growth,
}

function block(id: VrioBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="VRIO">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>一项资源要依次问过这四关。有一项答不上，就还不是持续优势。</p>
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
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
section { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 8px 10px; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.04em; text-align: center; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
@media (max-width: 1000px) {
  .grid.grid { grid-template-columns: 1fr; }
  section { min-height: 220px; height: auto; }
}
</style>
