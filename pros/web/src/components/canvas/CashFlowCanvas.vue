<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { CashFlowDocumentJSON, CashFlowSectionId } from '../../types/canvas'
import { isCashFlowDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId, sumAmounts } from '../../utils/classicCanvases'
import { FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'

const props = defineProps<{ doc: CashFlowDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const tones: Record<CashFlowSectionId, FiveStepPalette> = {
  operating: FIVE_STEP_PALETTE.growth,
  investing: FIVE_STEP_PALETTE.demand,
  financing: FIVE_STEP_PALETTE.business,
}

function toneStyle(id: string) {
  const tone = tones[id as CashFlowSectionId] || FIVE_STEP_PALETTE.business
  return {
    '--col-header': tone.header,
    '--col-body': tone.body,
    '--col-topic': tone.topic,
  }
}

const sectionTotal = (id: string) => sumAmounts(props.doc.sections.find((section) => section.id === id)?.lines || [])
const net = computed(() => props.doc.sections.reduce((sum, section) => sum + sumAmounts(section.lines), 0))

function formatAmount(value: number): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0'
  const text = Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100)
  return amount > 0 ? `+${text}` : text
}

function amountClass(value: number): string {
  if (value > 0) return 'is-in'
  if (value < 0) return 'is-out'
  return 'is-zero'
}

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

function removeLine(sectionId: string, lineId: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isCashFlowDoc(doc)) return
    doc.sections = doc.sections.map((section) => {
      if (section.id !== sectionId || section.lines.length <= 1) return section
      return { ...section, lines: section.lines.filter((line) => line.id !== lineId) }
    })
  })
}
</script>

<template>
  <div class="cash" :style="chrome" aria-label="现金流量">
    <header class="cash-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p>流入填正数，流出填负数。净额 = 经营 + 投资 + 筹资。</p>
      </div>
      <strong class="net" :class="amountClass(net)" :aria-label="`净额 ${net}`">净额 {{ formatAmount(net) }}</strong>
    </header>
    <div class="cash-grid">
      <section v-for="section in doc.sections" :key="section.id" :aria-label="section.title" :data-section="section.id" :style="toneStyle(section.id)">
        <h3>{{ section.title }}</h3>
        <div class="lines">
          <div v-for="line in section.lines" :key="line.id" class="cash-line">
            <input :value="line.label" aria-label="项目" @change="patchLine(section.id, line.id, { label: ($event.target as HTMLInputElement).value })" />
            <input
              type="number"
              :class="amountClass(Number(line.amount))"
              :value="line.amount"
              aria-label="金额"
              @change="patchLine(section.id, line.id, { amount: Number(($event.target as HTMLInputElement).value) })"
            />
            <button type="button" :disabled="section.lines.length <= 1" aria-label="删除项目" @click="removeLine(section.id, line.id)">×</button>
          </div>
        </div>
        <footer>
          <button type="button" @click="addLine(section.id)">添加一行</button>
          <strong :class="amountClass(sectionTotal(section.id))">{{ formatAmount(sectionTotal(section.id)) }}</strong>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cash {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px 14px;
  color: #202124;
  background: var(--cv-page, #f7f7f7);
}
.cash-top { flex: none; display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 10px; }
.cash-top h2, .cash-top p { margin: 0; }
.cash-top p { color: #5f6368; font-size: 13px; }
.net { font-size: 18px; padding: 6px 12px; border-radius: 999px; background: #fff; }
.cash-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--col-body);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--col-header) 28%, #fff);
}
h3 {
  flex: none;
  margin: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--col-header);
  color: #fff;
  font-size: 15px;
  letter-spacing: 0.04em;
}
.lines { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.cash-line { display: grid; grid-template-columns: 1fr 108px 28px; gap: 6px; align-items: center; }
input { border: 1px solid transparent; background: #fff; border-radius: 8px; padding: 6px 8px; color: var(--col-topic); }
input:focus { border-color: var(--col-header); outline: none; }
footer {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #fff;
  border-top: 1px solid color-mix(in srgb, var(--col-header) 24%, #fff);
}
footer button, .cash-line button { border: 1px solid color-mix(in srgb, var(--col-header) 30%, #fff); background: #fff; color: var(--col-topic); border-radius: 8px; }
.cash-line button:disabled { opacity: 0.35; }
.is-in { color: #137333; }
.is-out { color: #c5221f; }
.is-zero { color: #5f6368; }
.net.is-in { background: #e7f6ef; color: #125c3b; }
.net.is-out { background: #fdecea; color: #9b1c1c; }
@media (max-width: 800px) {
  .cash-grid { grid-template-columns: repeat(3, minmax(200px, 1fr)); overflow: auto; }
}
</style>
