<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BreakEvenDocumentJSON } from '../../types/canvas'
import { isBreakEvenDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ doc: BreakEvenDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const contribution = computed(() => Number(props.doc.price) - Number(props.doc.variable))
const units = computed(() => (contribution.value > 0 ? props.doc.fixed / contribution.value : null))
const revenue = computed(() => (units.value == null ? null : units.value * Number(props.doc.price)))

function format(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '算不出'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function setField(field: 'fixed' | 'price' | 'variable', raw: string) {
  const amount = Math.abs(Number(raw) || 0)
  documentStore.mutateCanvas((doc) => {
    if (!isBreakEvenDoc(doc)) return
    doc[field] = amount
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="盈亏平衡">
    <header class="sheet-top">
      <h2>{{ doc.title }}</h2>
      <p>单价要高于单位变动成本。盈亏平衡销量 = 固定成本 ÷（单价 − 单位变动成本）。</p>
    </header>
    <div class="grid">
      <section class="field">
        <h3>固定成本</h3>
        <input type="number" min="0" :value="doc.fixed" aria-label="固定成本" @change="setField('fixed', ($event.target as HTMLInputElement).value)" />
      </section>
      <section class="field">
        <h3>单价</h3>
        <input type="number" min="0" :value="doc.price" aria-label="单价" @change="setField('price', ($event.target as HTMLInputElement).value)" />
      </section>
      <section class="field">
        <h3>单位变动成本</h3>
        <input type="number" min="0" :value="doc.variable" aria-label="单位变动成本" @change="setField('variable', ($event.target as HTMLInputElement).value)" />
      </section>
      <section class="result">
        <h3>要卖多少才不亏</h3>
        <p class="figure" :aria-label="`盈亏平衡销量 ${format(units)}`">{{ format(units) }} 件</p>
        <p>单位贡献 {{ format(contribution) }} · 对应收入 {{ format(revenue) }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: 1fr 1fr; gap: 10px; }
section { display: flex; flex-direction: column; justify-content: center; gap: 12px; min-height: 0; border-radius: 12px; padding: 18px; }
.field { background: #e8f1fa; }
.field:nth-child(2) { background: #e7f6ef; }
.field:nth-child(3) { background: #fff4ec; }
.result { grid-column: 1 / -1; background: #202124; color: #fff; }
h3 { margin: 0; font-size: 16px; }
input { font-size: 28px; border: 0; border-radius: 10px; padding: 10px 12px; width: 100%; box-sizing: border-box; }
.figure { margin: 0; font-size: 40px; font-weight: 700; }
.result p:last-child { margin: 0; color: #e8eaed; }
</style>
