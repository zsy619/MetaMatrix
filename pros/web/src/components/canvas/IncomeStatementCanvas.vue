<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { IncomeSectionId, IncomeStatementDocumentJSON } from '../../types/canvas'
import { isIncomeStatementDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId, sumAmounts } from '../../utils/classicCanvases'
import { FIVE_STEP_NEGATE_WARM, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'

const props = defineProps<{ doc: IncomeStatementDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const tones: Record<IncomeSectionId, FiveStepPalette> = {
  revenue: FIVE_STEP_PALETTE.growth,
  cost: FIVE_STEP_NEGATE_WARM,
  expense: FIVE_STEP_PALETTE.business,
}

function total(id: IncomeSectionId): number {
  return sumAmounts(props.doc.sections.find((section) => section.id === id)?.lines || [])
}

const gross = computed(() => total('revenue') - total('cost'))
const operating = computed(() => gross.value - total('expense'))

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

function patch(mutator: (doc: IncomeStatementDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isIncomeStatementDoc(doc)) return
    mutator(doc)
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="利润表">
    <header class="sheet-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p>收入、成本、费用都填正数。毛利 = 收入 − 成本，营业利润 = 毛利 − 费用。</p>
      </div>
      <div class="totals">
        <strong :class="amountClass(gross)" :aria-label="`毛利 ${gross}`">毛利 {{ formatAmount(gross) }}</strong>
        <strong :class="amountClass(operating)" :aria-label="`营业利润 ${operating}`">营业利润 {{ formatAmount(operating) }}</strong>
      </div>
    </header>
    <div class="columns">
      <section v-for="section in doc.sections" :key="section.id" :data-section="section.id" :style="{ '--col-header': tones[section.id].header, '--col-body': tones[section.id].body, '--col-topic': tones[section.id].topic }">
        <h3>{{ section.title }}</h3>
        <div class="lines">
          <div v-for="line in section.lines" :key="line.id" class="line">
            <input :value="line.label" aria-label="项目" @change="patch((doc) => { const row = doc.sections.find((item) => item.id === section.id)?.lines.find((item) => item.id === line.id); if (row) row.label = ($event.target as HTMLInputElement).value })" />
            <input type="number" min="0" :value="line.amount" aria-label="金额" @change="patch((doc) => { const row = doc.sections.find((item) => item.id === section.id)?.lines.find((item) => item.id === line.id); if (row) row.amount = Math.abs(Number(($event.target as HTMLInputElement).value) || 0) })" />
            <button type="button" :disabled="section.lines.length <= 1" aria-label="删除项目" @click="patch((doc) => { const target = doc.sections.find((item) => item.id === section.id); if (target && target.lines.length > 1) target.lines = target.lines.filter((item) => item.id !== line.id) })">×</button>
          </div>
        </div>
        <footer>
          <button type="button" @click="patch((doc) => { const target = doc.sections.find((item) => item.id === section.id); if (target) target.lines = [...target.lines, { id: newCanvasId('line'), label: '新项目', amount: 0 }] })">添加一行</button>
          <strong>{{ total(section.id) }}</strong>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.totals { display: flex; gap: 8px; }
.totals strong { padding: 6px 12px; border-radius: 999px; background: #fff; }
.columns { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
section { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--col-body); border-radius: 12px; overflow: hidden; }
h3 { margin: 0; min-height: 44px; display: flex; align-items: center; padding: 0 12px; background: var(--col-header); color: #fff; letter-spacing: 0.04em; }
.lines { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.line { display: grid; grid-template-columns: 1fr 108px 28px; gap: 6px; }
input { border: 1px solid transparent; background: #fff; border-radius: 8px; padding: 6px 8px; color: var(--col-topic); }
footer { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #fff; }
button { border: 1px solid #dadce0; background: #fff; border-radius: 8px; color: var(--col-topic); }
.is-in { background: #e7f6ef; color: #125c3b; }
.is-out { background: #fdecea; color: #9b1c1c; }
.is-zero { color: #5f6368; }
</style>
