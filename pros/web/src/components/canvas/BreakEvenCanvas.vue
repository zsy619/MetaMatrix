<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BreakEvenDocumentJSON } from '../../types/canvas'
import { isBreakEvenDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ doc: BreakEvenDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const contribution = computed(() => Number(props.doc.price) - Number(props.doc.variableCost))
const units = computed(() => (contribution.value > 0 ? Number(props.doc.fixedCost) / contribution.value : null))
const revenue = computed(() => (units.value == null ? null : units.value * Number(props.doc.price)))

function format(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '无法覆盖'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function amountClass(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'is-out'
  return 'is-in'
}

function setField(field: 'price' | 'variableCost' | 'fixedCost', raw: string) {
  const value = Math.max(0, Number(raw) || 0)
  documentStore.mutateCanvas((doc) => {
    if (!isBreakEvenDoc(doc)) return
    doc[field] = value
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="盈亏平衡">
    <header class="sheet-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p>盈亏平衡销量 = 固定成本 ÷（单价 − 单位变动成本）。单价不高于变动成本时，卖得越多亏得越多。</p>
      </div>
      <div class="results">
        <strong :class="amountClass(contribution)" :aria-label="`单位贡献 ${format(contribution)}`">贡献 {{ format(contribution) }}</strong>
        <strong :class="amountClass(units)" :aria-label="`盈亏平衡销量 ${format(units)}`">销量 {{ format(units) }}</strong>
        <strong :class="amountClass(revenue)" :aria-label="`盈亏平衡收入 ${format(revenue)}`">收入 {{ format(revenue) }}</strong>
      </div>
    </header>
    <div class="grid">
      <section>
        <h3>单价</h3>
        <input type="number" min="0" :value="doc.price" aria-label="单价" @change="setField('price', ($event.target as HTMLInputElement).value)" />
      </section>
      <section>
        <h3>单位变动成本</h3>
        <input type="number" min="0" :value="doc.variableCost" aria-label="单位变动成本" @change="setField('variableCost', ($event.target as HTMLInputElement).value)" />
      </section>
      <section>
        <h3>固定成本</h3>
        <input type="number" min="0" :value="doc.fixedCost" aria-label="固定成本" @change="setField('fixedCost', ($event.target as HTMLInputElement).value)" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; overflow: auto; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { max-width: 42em; color: #3c4043; font-size: 15px; line-height: 1.55; }
.results { display: flex; flex-wrap: wrap; gap: 8px; }
.results strong { min-height: 44px; display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 999px; font-size: 16px; font-variant-numeric: tabular-nums; }
.is-in { background: #e7f6ef; color: #125c3b; }
.is-out { background: #fdecea; color: #9b1c1c; }
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
section { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 0; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #ececec; }
h3 { margin: 0; width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: center; background: #2a649f; color: #fff; font-size: 16px; }
input { margin: 28px 16px 0; width: min(240px, calc(100% - 32px)); box-sizing: border-box; min-height: 72px; border: 1px solid #dadce0; border-radius: 12px; padding: 12px; font: inherit; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: center; appearance: textfield; }
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input:focus { outline: none; border-color: #1a73e8; }
@media (max-width: 800px) {
  .grid.grid { grid-template-columns: 1fr; }
  section { min-height: 180px; height: auto; }
}
</style>
