<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { OkrDocumentJSON } from '../../types/canvas'
import { isOkrDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId } from '../../utils/classicCanvases'

const props = defineProps<{ doc: OkrDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

function average(progresses: number[]): number {
  if (!progresses.length) return 0
  return Math.round(progresses.reduce((sum, value) => sum + (Number(value) || 0), 0) / progresses.length)
}

function patch(mutator: (doc: OkrDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isOkrDoc(doc)) return
    mutator(doc)
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="OKR">
    <header class="sheet-top">
      <div>
        <input class="title" :value="doc.title" aria-label="OKR 标题" @change="patch((doc) => { doc.title = ($event.target as HTMLInputElement).value })" />
        <input class="period" :value="doc.period" aria-label="周期" @change="patch((doc) => { doc.period = ($event.target as HTMLInputElement).value })" />
      </div>
      <button type="button" @click="patch((doc) => { doc.objectives = [...doc.objectives, { id: newCanvasId('obj'), name: '新目标', keyResults: [{ id: newCanvasId('kr'), name: '关键结果', target: '', progress: 0 }] }] })">添加目标</button>
    </header>
    <div class="objectives">
      <section v-for="(objective, index) in doc.objectives" :key="objective.id" :data-objective="objective.id">
        <header>
          <span class="index">O{{ index + 1 }}</span>
          <input :value="objective.name" aria-label="目标" @change="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id); if (item) item.name = ($event.target as HTMLInputElement).value })" />
          <strong>{{ average(objective.keyResults.map((item) => item.progress)) }}%</strong>
          <button type="button" @click="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id); if (item) item.keyResults = [...item.keyResults, { id: newCanvasId('kr'), name: '关键结果', target: '', progress: 0 }] })">添加关键结果</button>
          <button type="button" :disabled="doc.objectives.length <= 1" @click="patch((doc) => { doc.objectives = doc.objectives.filter((row) => row.id !== objective.id) })">删除</button>
        </header>
        <div v-for="kr in objective.keyResults" :key="kr.id" class="kr">
          <input :value="kr.name" aria-label="关键结果" @change="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id)?.keyResults.find((row) => row.id === kr.id); if (item) item.name = ($event.target as HTMLInputElement).value })" />
          <input :value="kr.target" aria-label="目标值" placeholder="如何衡量" @change="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id)?.keyResults.find((row) => row.id === kr.id); if (item) item.target = ($event.target as HTMLInputElement).value })" />
          <input type="range" min="0" max="100" :value="kr.progress" :aria-label="`${kr.name}进度`" @input="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id)?.keyResults.find((row) => row.id === kr.id); if (item) item.progress = Number(($event.target as HTMLInputElement).value) })" />
          <span>{{ kr.progress }}%</span>
          <button type="button" :disabled="objective.keyResults.length <= 1" @click="patch((doc) => { const item = doc.objectives.find((row) => row.id === objective.id); if (item) item.keyResults = item.keyResults.filter((row) => row.id !== kr.id) })">删除</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 12px 14px 14px; background: var(--cv-page, #f7f7f7); color: #202124; }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
.title { font-size: 18px; font-weight: 700; border: 1px solid transparent; background: transparent; border-radius: 6px; }
.period { margin-left: 8px; border: 1px solid #dadce0; border-radius: 8px; padding: 4px 8px; }
.sheet-top button, .kr button, header button { border: 1px solid #dadce0; background: #fff; border-radius: 999px; min-height: 36px; padding: 4px 12px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.objectives { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
section { background: #fff; border: 1px solid #ececec; border-radius: 12px; overflow: hidden; }
header { display: flex; gap: 8px; align-items: center; min-height: 52px; padding: 8px 12px; background: #2a649f; color: #fff; }
header input { flex: 1; border: 0; background: transparent; color: #fff; font: inherit; font-size: 16px; font-weight: 700; }
header strong { font-variant-numeric: tabular-nums; font-size: 18px; }
.index { font-weight: 700; letter-spacing: 0.04em; }
header button { color: #1c4c7c; }
.kr { display: grid; grid-template-columns: 1.4fr 1fr minmax(140px, 180px) 48px auto; gap: 8px; align-items: center; min-height: 52px; padding: 8px 12px; border-top: 1px solid #f1f3f4; }
.kr input[type='text'], .kr input:not([type]) { border: 1px solid #e0e0e0; border-radius: 8px; min-height: 36px; padding: 6px 8px; font: inherit; }
.kr input[type='range'] { width: 100%; height: 28px; accent-color: #1a73e8; }
.kr span { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }
</style>
