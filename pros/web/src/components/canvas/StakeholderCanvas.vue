<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { StakeholderBlockId, StakeholderDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: StakeholderDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: StakeholderBlockId[] = ['satisfy', 'manage', 'monitor', 'inform']
const tones: Record<StakeholderBlockId, FiveStepPalette> = {
  manage: FIVE_STEP_PALETTE.moat,
  satisfy: FIVE_STEP_PALETTE.demand,
  inform: FIVE_STEP_PALETTE.business,
  monitor: FIVE_STEP_PALETTE.solution,
}

function block(id: StakeholderBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet quad-sheet" :style="chrome" aria-label="干系人地图">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>按权力和利益分成四格：重点管理、保持满意、随时告知、监督即可。再写下一步怎么接触。</p>
    </header>
    <div class="axis">
      <span class="axis-y">权力高</span>
      <div class="grid">
        <section v-for="id in order" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
          <h3>{{ block(id)?.title }}</h3>
          <div v-if="block(id)" class="rte-slot">
            <FiveStepPanel chrome="fill" density="compact" :block="block(id)!" :header="block(id)!.title" :palette="tones[id]" :topic-placeholder="block(id)!.hint || '主题'" />
          </div>
        </section>
      </div>
      <span class="axis-x">利益低 ← → 利益高</span>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 8px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.axis { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 40px 1fr; grid-template-rows: 1fr auto; gap: 8px; }
.axis-y { writing-mode: vertical-rl; text-align: center; color: #3c3424; font-size: 14px; font-weight: 700; letter-spacing: 0.16em; }
.axis-x { grid-column: 2; text-align: center; color: #3c3424; font-size: 14px; font-weight: 700; letter-spacing: 0.08em; }
.grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; min-height: 0; }
section { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 6px 8px; background: var(--col-header); color: #fff; font-size: 16px; letter-spacing: 0.02em; }
.axis-y, .axis-x { font-size: 16px; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>

<style>
@media (max-width: 720px) {
  .canvas-viewport .quad-sheet[aria-label='干系人地图'] > .axis {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .canvas-viewport .quad-sheet[aria-label='干系人地图'] > .axis .axis-y,
  .canvas-viewport .quad-sheet[aria-label='干系人地图'] > .axis .axis-x {
    display: none;
  }

  .canvas-viewport .quad-sheet[aria-label='干系人地图'] > .axis .grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .canvas-viewport .quad-sheet[aria-label='干系人地图'] > .axis .grid > section {
    min-height: 240px;
  }
}
</style>
