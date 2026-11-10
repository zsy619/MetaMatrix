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

function score(item: RiceItem): number {
  const effort = Number(item.effort)
  if (!Number.isFinite(effort) || effort <= 0) return 0
  const value = (Number(item.reach) * Number(item.impact) * (Number(item.confidence) / 100)) / effort
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0
}

const ranked = computed(() =>
  [...props.doc.items].map((item) => ({ item, score: score(item) })).sort((a, b) => b.score - a.score),
)

function patch(mutator: (doc: RiceDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isRiceDoc(doc)) return
    mutator(doc)
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="RICE 排序">
    <header class="sheet-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p>分数 = 触达 × 影响 × 信心 ÷ 投入。影响用 0.25、0.5、1、2、3，信心填 0 到 100。</p>
      </div>
      <button type="button" @click="patch((doc) => { doc.items = [...doc.items, { id: newCanvasId('rice'), name: '新事项', reach: 100, impact: 1, confidence: 80, effort: 1 }] })">添加事项</button>
    </header>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>排名</th><th>事项</th><th>触达</th><th>影响</th><th>信心 %</th><th>投入</th><th>分数</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in ranked" :key="row.item.id">
            <td>{{ ranked.findIndex((item) => item.item.id === row.item.id) + 1 }}</td>
            <td><input :value="row.item.name" aria-label="事项" @change="patch((doc) => { const item = doc.items.find((entry) => entry.id === row.item.id); if (item) item.name = ($event.target as HTMLInputElement).value })" /></td>
            <td><input type="number" min="0" :value="row.item.reach" aria-label="触达" @change="patch((doc) => { const item = doc.items.find((entry) => entry.id === row.item.id); if (item) item.reach = Number(($event.target as HTMLInputElement).value) || 0 })" /></td>
            <td><input type="number" min="0.25" step="0.25" :value="row.item.impact" aria-label="影响" @change="patch((doc) => { const item = doc.items.find((entry) => entry.id === row.item.id); if (item) item.impact = Number(($event.target as HTMLInputElement).value) || 0 })" /></td>
            <td><input type="number" min="0" max="100" :value="row.item.confidence" aria-label="信心" @change="patch((doc) => { const item = doc.items.find((entry) => entry.id === row.item.id); if (item) item.confidence = Math.max(0, Math.min(100, Number(($event.target as HTMLInputElement).value) || 0)) })" /></td>
            <td><input type="number" min="0.1" step="0.1" :value="row.item.effort" aria-label="投入" @change="patch((doc) => { const item = doc.items.find((entry) => entry.id === row.item.id); if (item) item.effort = Number(($event.target as HTMLInputElement).value) || 0 })" /></td>
            <td class="score">{{ row.score }}</td>
            <td><button type="button" :disabled="doc.items.length <= 1" @click="patch((doc) => { doc.items = doc.items.filter((entry) => entry.id !== row.item.id) })">删除</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
.sheet-top h2, .sheet-top p { margin: 0; }
.sheet-top p { color: #5f6368; font-size: 13px; }
.sheet-top button, td button { border: 1px solid #dadce0; background: #fff; border-radius: 8px; padding: 4px 8px; }
.table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; background: #fff; border: 1px solid #ececec; border-radius: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px; border-bottom: 1px solid #f1f3f4; text-align: left; font-size: 13px; }
th { position: sticky; top: 0; background: #2a649f; color: #fff; }
input { width: 100%; box-sizing: border-box; border: 1px solid #e0e0e0; border-radius: 6px; padding: 4px 6px; }
.score { font-weight: 700; color: #125c3b; }
</style>
