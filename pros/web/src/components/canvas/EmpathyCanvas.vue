<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { EmpathyBlockId, EmpathyDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_NEGATE, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: EmpathyDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: EmpathyBlockId[] = ['says', 'thinks', 'does', 'feels', 'pains', 'gains']
const tones: Record<EmpathyBlockId, FiveStepPalette> = {
  says: FIVE_STEP_PALETTE.business,
  thinks: FIVE_STEP_PALETTE.hypothesis,
  does: FIVE_STEP_PALETTE.solution,
  feels: FIVE_STEP_PALETTE.demand,
  pains: FIVE_STEP_NEGATE,
  gains: FIVE_STEP_PALETTE.growth,
}

function block(id: EmpathyBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="同理心地图">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>只写一个具体的人。先记他说了什么、做了什么，再推断他在想什么。</p>
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
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
section { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 40px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; letter-spacing: 0.06em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
