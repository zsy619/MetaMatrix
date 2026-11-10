<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { CashFlowDocumentJSON } from '../../types/canvas'
import { isCashFlowDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId, sumAmounts } from '../../utils/classicCanvases'

const props = defineProps<{ doc: CashFlowDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const sectionTotal = (id: string) => sumAmounts(props.doc.sections.find((section) => section.id === id)?.lines || [])
const net = computed(() => props.doc.sections.reduce((sum, section) => sum + sumAmounts(section.lines), 0))

function patchLine(sectionId: string, lineId: string, patch: { label?: string; amount?: number }) {
  documentStore.mutateCanvas((doc) => {
    if (!isCashFlowDoc(doc)) return
    doc.sections = doc.sections.map((section) =>
      section.id !== sectionId
        ? section
        : {
            ...section,
            lines: section.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
          },
    )
  })
}

function addLine(sectionId: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isCashFlowDoc(doc)) return
    doc.sections = doc.sections.map((section) =>
      section.id === sectionId
        ? { ...section, lines: [...section.lines, { id: newCanvasId('line'), label: '新项目', amount: 0 }] }
        : section,
    )
  })
}
</script>

<template>
  <div class="cash" :style="chrome" aria-label="现金流量">
    <header>
      <h2>{{ doc.title }}</h2>
      <p>流入填正数，流出填负数。净额 = 经营 + 投资 + 筹资。</p>
      <strong :aria-label="`净额 ${net}`">净额 {{ net }}</strong>
    </header>
    <div class="cash-grid">
      <section v-for="section in doc.sections" :key="section.id" :aria-label="section.title">
        <h3>{{ section.title }} <span>{{ sectionTotal(section.id) }}</span></h3>
        <div v-for="line in section.lines" :key="line.id" class="cash-line">
          <input :value="line.label" aria-label="项目" @change="patchLine(section.id, line.id, { label: ($event.target as HTMLInputElement).value })" />
          <input type="number" :value="line.amount" aria-label="金额" @change="patchLine(section.id, line.id, { amount: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <button type="button" @click="addLine(section.id)">添加一行</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cash { height: 100%; overflow: auto; padding: 16px; color: #202124; }
header { display: flex; gap: 16px; align-items: baseline; margin-bottom: 12px; }
header h2, header p { margin: 0; }
header p { color: #5f6368; font-size: 13px; }
.cash-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
section { background: #fff; border: 1px solid #ececec; border-radius: 12px; padding: 10px; }
h3 { display: flex; justify-content: space-between; margin: 0 0 8px; font-size: 15px; }
.cash-line { display: grid; grid-template-columns: 1fr 96px; gap: 6px; margin-bottom: 6px; }
input { border: 1px solid #e0e0e0; border-radius: 6px; padding: 4px 6px; }
button { border: 1px solid #dadce0; background: #fff; border-radius: 8px; }
</style>
