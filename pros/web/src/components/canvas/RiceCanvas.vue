<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { RiceDocumentJSON, RiceItem } from '../../types/canvas'
import { isRiceDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId } from '../../utils/classicCanvases'

const props = defineProps<{ doc: RiceDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const impacts = [3, 2, 1, 0.5, 0.25]

function score(item: RiceItem): number {
  const effort = Number(item.effort)
  if (!Number.isFinite(effort) || effort <= 0) return 0
  const confidence = Math.max(0, Math.min(100, Number(item.confidence) || 0)) / 100
  const raw = ((Number(item.reach) || 0) * (Number(item.impact) || 0) * confidence) / effort
  return Math.round(raw * 10) / 10
}

const ranked = computed(() => [...props.doc.items].sort((a, b) => score(b) - score(a)))

function patch(mutator: (doc: RiceDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isRiceDoc(doc)) return
    mutator(doc)
  })
}

function update(id: string, field: 'name' | 'reach' | 'impact' | 'confidence' | 'effort', value: string) {
  patch((doc) => {
    const item = doc.items.find((row) => row.id === id)
    if (!item) return
    if (field === 'name') item.name = value
    else if (field === 'reach') item.reach = Number(value) || 0
    else if (field === 'impact') item.impact = Number(value) || 0
    else if (field === 'confidence') item.confidence = Number(value) || 0
    else item.effort = Number(value) || 0
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="RICE 排序">
    <header class="sheet-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p class="hint">分数 = 覆盖人数 × 影响 × 信心 ÷ 工作量。影响取 3、2、1、0.5、0.25，信心填 0 到 100。</p>
      </div>
      <button type="button" @click="patch((doc) => { doc.items = [...doc.items, { id: newCanvasId('rice'), name: '新事项', reach: 0, impact: 1, confidence: 80, effort: 1 }] })">添加事项</button>
    </header>
    <div class="table">
      <div class="head"><span></span><span>事项</span><span>覆盖</span><span>影响</span><span>信心 %</span><span>工作量</span><span>分数</span><span></span></div>
      <div v-for="(item, index) in ranked" :key="item.id" class="row" :class="{ 'is-top': index === 0 }" :data-score="score(item)">
        <span class="rank">{{ index + 1 }}</span>
        <input class="name" :value="item.name" aria-label="事项" @change="update(item.id, 'name', ($event.target as HTMLInputElement).value)" />
        <label class="field">
          <span>覆盖</span>
          <input type="number" min="0" :value="item.reach" aria-label="覆盖人数" @change="update(item.id, 'reach', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field">
          <span>影响</span>
          <select :value="item.impact" aria-label="影响" @change="update(item.id, 'impact', ($event.target as HTMLSelectElement).value)">
            <option v-for="impact in impacts" :key="impact" :value="impact">{{ impact }}</option>
          </select>
        </label>
        <label class="field">
          <span>信心 %</span>
          <input type="number" min="0" max="100" :value="item.confidence" aria-label="信心" @change="update(item.id, 'confidence', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field">
          <span>工作量</span>
          <input type="number" min="0.1" step="0.1" :value="item.effort" aria-label="工作量" @change="update(item.id, 'effort', ($event.target as HTMLInputElement).value)" />
        </label>
        <strong class="score">{{ score(item) }}</strong>
        <button type="button" :disabled="doc.items.length <= 1" aria-label="删除事项" @click="patch((doc) => { doc.items = doc.items.filter((row) => row.id !== item.id) })">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; overflow: auto; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.hint { max-width: 42em; color: #3c4043; font-size: 15px; line-height: 1.55; }
button { border: 1px solid #dadce0; background: #fff; border-radius: 999px; min-height: 40px; padding: 4px 14px; font: inherit; font-size: 15px; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
.table { flex: 1 1 auto; min-height: 0; overflow: auto; background: #fff; border: 1px solid #ececec; border-radius: 12px; }
.head, .row { display: grid; grid-template-columns: 36px minmax(0, 1.6fr) repeat(5, minmax(72px, 0.7fr)) auto; gap: 8px; align-items: center; padding: 8px 12px; }
.head { position: sticky; top: 0; z-index: 1; min-height: 44px; background: #2a649f; color: #fff; font-size: 14px; font-weight: 700; }
.field { display: contents; }
.field > span { display: none; }
.row { min-height: 56px; border-top: 1px solid #f1f3f4; }
.row.is-top { background: #f3faf6; }
.rank { font-variant-numeric: tabular-nums; font-weight: 700; color: #5f6368; text-align: center; }
input, select { width: 100%; min-width: 0; box-sizing: border-box; min-height: 40px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; }
input[type='number'] { appearance: textfield; text-align: right; }
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.score { justify-self: end; min-width: 64px; padding: 4px 10px; border-radius: 999px; background: #e8f0fe; color: #174ea6; font-variant-numeric: tabular-nums; font-size: 16px; text-align: center; }
.row.is-top .score { background: #ceead6; color: #125c3b; }
@media (max-width: 800px) {
  .table { overflow: visible; background: transparent; border: 0; }
  .head { display: none; }
  .row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    margin: 0 0 10px;
    border: 1px solid #e4ddd2;
    border-radius: 12px;
    background: #fff;
  }
  .rank { grid-column: 1; grid-row: 1; }
  .name { grid-column: 2; grid-row: 1; }
  .score { grid-column: 3; grid-row: 1; }
  .field { display: grid; grid-column: 1 / -1; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 8px; }
  .field > span { display: block; font-size: 14px; color: #3c4043; }
  .row > button { grid-column: 1 / -1; justify-self: start; }
}
</style>
