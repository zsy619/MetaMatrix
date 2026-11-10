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
        <strong :aria-label="`盈亏平衡销量 ${format(units)}`">销量 {{ format(units) }}</strong>
        <strong :aria-label="`盈亏平衡收入 ${format(revenue)}`">收入 {{ format(revenue) }}</strong>
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
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.results { display: flex; gap: 8px; }
.results strong { padding: 8px 12px; border-radius: 999px; background: #e7f6ef; color: #125c3b; }
.grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
section { display: flex; flex-direction: column; min-height: 0; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #ececec; }
h3 { margin: 0; min-height: 48px; display: flex; align-items: center; justify-content: center; background: #2a649f; color: #fff; }
input { margin: auto; width: min(220px, 80%); border: 1px solid #dadce0; border-radius: 10px; padding: 12px; font-size: 22px; text-align: center; }
</style>
