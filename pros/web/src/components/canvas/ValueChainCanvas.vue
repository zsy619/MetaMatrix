<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { ValueChainBlockId, ValueChainDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: ValueChainDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const support: ValueChainBlockId[] = ['infrastructure', 'hr', 'technology', 'procurement']
const primary: ValueChainBlockId[] = ['inbound', 'operations', 'outbound', 'marketing', 'service']
const tones: Record<ValueChainBlockId, FiveStepPalette> = {
  infrastructure: { header: '#3E5A78', body: '#EEF2F6', topic: '#2C4258' },
  hr: FIVE_STEP_PALETTE.demand,
  technology: FIVE_STEP_PALETTE.solution,
  procurement: FIVE_STEP_PALETTE.hypothesis,
  inbound: FIVE_STEP_PALETTE.business,
  operations: FIVE_STEP_PALETTE.growth,
  outbound: FIVE_STEP_PALETTE.moat,
  marketing: { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  service: FIVE_STEP_PALETTE.solution,
}

function block(id: ValueChainBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="价值链">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>上面是支持活动，下面是直接交给客户的五段。看成本和优势落在哪一段。</p>
    </header>
    <div class="chain">
      <div class="row row--support">
        <section v-for="id in support" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
          <h3>{{ block(id)?.title }}</h3>
          <div v-if="block(id)" class="rte-slot">
            <FiveStepPanel chrome="fill" density="compact" :block="block(id)!" :header="block(id)!.title" :palette="tones[id]" :topic-placeholder="block(id)!.hint || '主题'" />
          </div>
        </section>
      </div>
      <div class="row row--primary">
        <section v-for="id in primary" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
          <h3>{{ block(id)?.title }}</h3>
          <div v-if="block(id)" class="rte-slot">
            <FiveStepPanel chrome="fill" density="compact" :block="block(id)!" :header="block(id)!.title" :palette="tones[id]" :topic-placeholder="block(id)!.hint || '主题'" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.chain { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: 0.72fr 1.15fr; gap: 10px; }
.row { display: grid; gap: 8px; min-height: 0; }
.row--support { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.row--primary { grid-template-columns: repeat(5, minmax(0, 1fr)); }
section { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 36px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; font-size: 13px; letter-spacing: 0.04em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
