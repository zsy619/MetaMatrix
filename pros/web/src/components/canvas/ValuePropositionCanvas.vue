<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { ValuePropositionBlockId, ValuePropositionDocumentJSON } from '../../types/canvas'
import { isValuePropositionDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { FIVE_STEP_NEGATE, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'

const props = defineProps<{ doc: ValuePropositionDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const valueIds: ValuePropositionBlockId[] = ['products', 'relievers', 'creators']
const customerIds: ValuePropositionBlockId[] = ['jobs', 'pains', 'gains']
const tones: Record<ValuePropositionBlockId, FiveStepPalette> = {
  products: FIVE_STEP_PALETTE.solution,
  relievers: FIVE_STEP_PALETTE.business,
  creators: FIVE_STEP_PALETTE.growth,
  jobs: FIVE_STEP_PALETTE.demand,
  pains: FIVE_STEP_NEGATE,
  gains: FIVE_STEP_PALETTE.hypothesis,
}

function block(id: ValuePropositionBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}

function update(id: ValuePropositionBlockId, text: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isValuePropositionDoc(doc)) return
    doc.blocks = doc.blocks.map((item) => (item.id === id ? { ...item, text } : item))
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="价值主张画布">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>左边是我们提供的价值，右边是客户真正要完成的事、痛点和收益。两边对上才算契合。</p>
    </header>
    <div class="vpc">
      <section class="side" aria-label="价值图">
        <h3 class="side-title">价值图</h3>
        <div class="stack">
          <article v-for="id in valueIds" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
            <h4>{{ block(id)?.title }}</h4>
            <textarea :value="block(id)?.text || ''" :placeholder="block(id)?.hint" :aria-label="block(id)?.title" @change="update(id, ($event.target as HTMLTextAreaElement).value)" />
          </article>
        </div>
      </section>
      <section class="side" aria-label="客户画像">
        <h3 class="side-title side-title--customer">客户画像</h3>
        <div class="stack">
          <article v-for="id in customerIds" :key="id" :data-block="id" :style="{ '--col-header': tones[id].header, '--col-body': tones[id].body }">
            <h4>{{ block(id)?.title }}</h4>
            <textarea :value="block(id)?.text || ''" :placeholder="block(id)?.hint" :aria-label="block(id)?.title" @change="update(id, ($event.target as HTMLTextAreaElement).value)" />
          </article>
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
.vpc { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.side-title { margin: 0 0 8px; text-align: center; color: #0e8a84; letter-spacing: 0.08em; }
.side-title--customer { color: #a67c00; }
.stack { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: 1fr 1fr 1fr; gap: 8px; }
article { display: flex; flex-direction: column; min-height: 0; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h4 { margin: 0; min-height: 36px; display: flex; align-items: center; justify-content: center; background: var(--col-header); color: #fff; font-size: 14px; }
textarea { flex: 1 1 auto; min-height: 0; border: 0; resize: none; background: transparent; padding: 8px 10px; font: inherit; }
textarea:focus { outline: none; }
</style>
