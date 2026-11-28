<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { AnsoffBlockId, AnsoffDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: AnsoffDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: AnsoffBlockId[] = ['penetration', 'product', 'market', 'diversification']
const tones: Record<AnsoffBlockId, FiveStepPalette> = {
  penetration: FIVE_STEP_PALETTE.growth,
  product: FIVE_STEP_PALETTE.business,
  market: FIVE_STEP_PALETTE.demand,
  diversification: { header: '#C5221F', body: '#FDECEA', topic: '#9B1C1C' },
}

function block(id: AnsoffBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="安索夫矩阵">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>左上风险最低，右下最高。先写清卖给谁、卖什么，再选一条路。</p>
    </header>
    <div class="axis">
      <span class="axis-y"><span>现有市场</span><span>新市场</span></span>
      <div class="grid">
        <section v-for="id in order" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
          <h3>{{ block(id)?.title }}</h3>
          <div v-if="block(id)" class="rte-slot">
            <FiveStepPanel chrome="fill" density="compact" :block="block(id)!" :header="block(id)!.title" :palette="tones[id]" :topic-placeholder="block(id)!.hint || '主题'" />
          </div>
        </section>
      </div>
      <span class="axis-x">现有产品 ← → 新产品</span>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 8px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.axis { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 28px 1fr; grid-template-rows: 1fr auto; gap: 6px; }
.axis-y { display: flex; flex-direction: column; justify-content: space-around; align-items: center; color: #5f6368; font-size: 12px; line-height: 1.2; text-align: center; }
.axis-x { grid-column: 2; text-align: center; color: #5f6368; font-size: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; min-height: 0; }
section { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 40px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; letter-spacing: 0.04em; }
.rte-slot { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
