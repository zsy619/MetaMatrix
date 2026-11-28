<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { GoldenCircleBlockId, GoldenCircleDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: GoldenCircleDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: GoldenCircleBlockId[] = ['why', 'how', 'what']
const tones: Record<GoldenCircleBlockId, FiveStepPalette> = {
  why: FIVE_STEP_PALETTE.demand,
  how: FIVE_STEP_PALETTE.solution,
  what: FIVE_STEP_PALETTE.business,
}

function block(id: GoldenCircleBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="黄金圈">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>从内圈往外讲。先写为什么，再用怎么做证明它，最后才是别人看得到的做什么。</p>
    </header>
    <div class="rings">
      <section
        v-for="(id, index) in order"
        :key="id"
        class="ring"
        :data-block="id"
        :style="{ '--ring': tones[id].header, '--ring-body': tones[id].body, '--inset': `${(order.length - 1 - index) * 28}px` }"
      >
        <h3><span>{{ block(id)?.title }}</span></h3>
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
.rings { flex: 1 0 auto; min-height: 0; height: auto; display: grid; grid-template-rows: repeat(3, minmax(180px, 1fr)); }
.ring { min-height: 180px; height: auto; margin: 0 var(--inset); display: grid; grid-template-columns: 96px minmax(0, 1fr); background: var(--ring-body); border: 2px solid var(--ring); border-bottom-width: 0; overflow: visible; }
.ring:first-child { border-radius: 28px 28px 0 0; }
.ring:last-child { border-bottom-width: 2px; border-radius: 0 0 28px 28px; }
h3 { margin: 0; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 8px; background: var(--ring); color: #fff; font-size: 16px; letter-spacing: 0.08em; text-align: center; }
.rte-slot { min-height: min-content; height: auto; display: flex; }
@media (max-width: 800px) {
  .ring { margin: 0; grid-template-columns: 1fr; min-height: 220px; }
  h3 { min-height: 44px; }
}
</style>
