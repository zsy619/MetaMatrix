<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { TenCheckDocumentJSON, TenCheckRowId } from '../../types/canvas'
import { isTenCheckDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ doc: TenCheckDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const passedCount = computed(() => props.doc.rows.filter((row) => row.passed === true).length)
const failedCount = computed(() => props.doc.rows.filter((row) => row.passed === false).length)

function patch(mutator: (doc: TenCheckDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isTenCheckDoc(doc)) return
    mutator(doc)
  })
}

function row(id: TenCheckRowId) {
  return props.doc.rows.find((item) => item.id === id)
}

function write(id: TenCheckRowId, answer: string) {
  patch((doc) => {
    const item = doc.rows.find((entry) => entry.id === id)
    if (item) item.answer = answer
  })
}

function mark(id: TenCheckRowId, passed: boolean) {
  patch((doc) => {
    const item = doc.rows.find((entry) => entry.id === id)
    if (!item) return
    item.passed = item.passed === passed ? null : passed
  })
}
</script>

<template>
  <div class="sheet" :style="chrome" aria-label="十格自检">
    <header class="sheet-top">
      <div>
        <p class="kicker">可带走的那张表</p>
        <h2>{{ doc.title }}</h2>
        <p>拿一件想交给别人或交给 AI 的事，逐格写事实。出现不合格信号，这一格先不过。</p>
      </div>
      <p class="score" :data-passed="passedCount" :data-failed="failedCount">
        过了 <strong>{{ passedCount }}</strong> / {{ doc.rows.length }}
        <span v-if="failedCount"> · {{ failedCount }} 格不过</span>
      </p>
    </header>
    <div class="table">
      <div class="head">
        <span>#</span>
        <span>格子</span>
        <span>你要填什么</span>
        <span>它帮你判断</span>
        <span>不合格的信号</span>
        <span>这一格</span>
      </div>
      <div v-for="(item, index) in doc.rows" :key="item.id" class="row" :data-row="item.id" :data-pass="item.passed">
        <span class="num">{{ index + 1 }}</span>
        <strong>{{ item.name }}</strong>
        <label>
          <span>{{ item.prompt }}</span>
          <textarea
            :value="row(item.id)?.answer || ''"
            :aria-label="item.name"
            rows="2"
            @change="write(item.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <p>{{ item.judges }}</p>
        <p class="fail">{{ item.fail }}</p>
        <div class="marks">
          <button type="button" :aria-pressed="item.passed === true" @click="mark(item.id, true)">过</button>
          <button type="button" class="no" :aria-pressed="item.passed === false" @click="mark(item.id, false)">不过</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 16px 18px 14px; overflow: auto; color: #202124; background: var(--cv-page, #f4f0e8); }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 12px; }
.sheet-top h2, .sheet-top p, .kicker { margin: 0; }
.kicker { color: #a84562; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.sheet-top h2 { margin-top: 4px; font-size: 22px; }
.sheet-top p { margin-top: 4px; max-width: 68ch; color: #5c574e; font-size: 13px; line-height: 1.5; }
.score { margin: 0; padding: 8px 12px; border-radius: 999px; background: #fff; color: #3c4043; font-size: 13px; white-space: nowrap; }
.score strong { color: #125c3b; font-size: 18px; }
.table { flex: 1 1 auto; min-height: 0; overflow: auto; background: #fffdf8; border: 1px solid rgba(62, 48, 28, 0.08); border-radius: 14px; }
.head, .row { display: grid; grid-template-columns: 42px 128px minmax(220px, 1.4fr) minmax(140px, 0.8fr) minmax(160px, 0.9fr) 92px; gap: 10px; align-items: start; padding: 10px 12px; }
.head { position: sticky; top: 0; z-index: 1; background: #3e3428; color: #fff; font-size: 12px; font-weight: 700; }
.row { border-top: 1px solid #f1ebe3; }
.row[data-pass='false'] { background: #fff6f6; }
.row[data-pass='true'] { background: #f4fbf6; }
.num { color: #8a8175; font-weight: 700; }
label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
label span, .row p { margin: 0; color: #5c574e; font-size: 13px; line-height: 1.45; }
.fail { color: #9b1c1c; }
textarea { width: 100%; box-sizing: border-box; border: 1px solid #e4ddd2; border-radius: 8px; padding: 8px; font: inherit; resize: vertical; background: #fff; }
textarea:focus { outline: 2px solid #1c4c7c; border-color: transparent; }
.marks { display: flex; gap: 6px; }
.marks button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; padding: 4px 8px; cursor: pointer; }
.marks button[aria-pressed='true'] { background: #187a4e; border-color: #187a4e; color: #fff; }
.marks button.no[aria-pressed='true'] { background: #c5221f; border-color: #c5221f; color: #fff; }
</style>
