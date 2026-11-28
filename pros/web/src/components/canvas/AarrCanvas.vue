<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { AarrBlockId, AarrDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: AarrDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: AarrBlockId[] = ['acquisition', 'activation', 'retention', 'referral', 'revenue']
const tones: Record<AarrBlockId, FiveStepPalette> = {
  acquisition: FIVE_STEP_PALETTE.business,
  activation: FIVE_STEP_PALETTE.solution,
  retention: FIVE_STEP_PALETTE.demand,
  referral: FIVE_STEP_PALETTE.hypothesis,
  revenue: FIVE_STEP_PALETTE.growth,
}

function block(id: AarrBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="海盗指标 AARRR">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>从获得到收入走一遍。哪一段掉得最多，就先改那一段。</p>
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
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
section { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; letter-spacing: 0.04em; font-size: 14px; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
