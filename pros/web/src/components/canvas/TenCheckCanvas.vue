<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { TenCheckDocumentJSON, TenCheckRow, TenCheckRowId } from '../../types/canvas'
import { isTenCheckDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import TenCheckCell from './TenCheckCell.vue'
import tenCheckTemplate from '../../templates/ten-check-v1.json'
import { itemTextToHtml, looksLikeHtml, normalizeHtmlForCompare } from '../../utils/itemsHtml'

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

type NoteField = 'answer' | 'judges' | 'fail'

const seedRows = (tenCheckTemplate as TenCheckDocumentJSON).rows

function noteKey(field: NoteField): 'answer' | 'judgeNote' | 'failNote' {
  if (field === 'judges') return 'judgeNote'
  if (field === 'fail') return 'failNote'
  return 'answer'
}

function guideKey(field: NoteField): 'prompt' | 'judges' | 'fail' {
  if (field === 'answer') return 'prompt'
  return field
}

/** 说明始终留在格子上。正文若曾写进说明字段，改从富文本里读。 */
function guideText(item: TenCheckRow, field: NoteField): string {
  const key = guideKey(field)
  const raw = item[key] ?? ''
  if (!looksLikeHtml(raw)) return raw
  return seedRows.find((row) => row.id === item.id)?.[key] ?? ''
}

function cellHtml(item: TenCheckRow, field: NoteField): string {
  const note = item[noteKey(field)] ?? ''
  if (note.trim()) return itemTextToHtml(note)
  if (field !== 'answer' && looksLikeHtml(item[field])) return item[field]
  return '<p></p>'
}

function write(id: TenCheckRowId, field: NoteField, html: string) {
  const current = props.doc.rows.find((entry) => entry.id === id)
  if (!current) return
  if (normalizeHtmlForCompare(cellHtml(current, field)) === normalizeHtmlForCompare(html)) return
  const key = noteKey(field)
  patch((doc) => {
    const item = doc.rows.find((entry) => entry.id === id)
    if (item) item[key] = html
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
  <div class="sheet ten-check-sheet" :style="chrome" aria-label="十格自检">
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
        <TenCheckCell
          :label="`${item.name} · 你要填什么`"
          :note="guideText(item, 'answer')"
          :panel-id="`ten:${item.id}:fill`"
          :model-value="cellHtml(item, 'answer')"
          @update:model-value="write(item.id, 'answer', $event)"
        />
        <TenCheckCell
          :label="`${item.name} · 它帮你判断`"
          :note="guideText(item, 'judges')"
          :panel-id="`ten:${item.id}:judge`"
          :model-value="cellHtml(item, 'judges')"
          @update:model-value="write(item.id, 'judges', $event)"
        />
        <TenCheckCell
          fail
          :label="`${item.name} · 不合格的信号`"
          :note="guideText(item, 'fail')"
          :panel-id="`ten:${item.id}:fail`"
          :model-value="cellHtml(item, 'fail')"
          @update:model-value="write(item.id, 'fail', $event)"
        />
        <div class="marks">
          <button type="button" :aria-pressed="item.passed === true" @click="mark(item.id, true)">过</button>
          <button type="button" class="no" :aria-pressed="item.passed === false" @click="mark(item.id, false)">不过</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; padding: 0 18px 14px; overflow: auto; color: #202124; background: var(--cv-page, #f4f0e8); }
.sheet-top { flex: none; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 12px; padding-top: 16px; }
.sheet-top h2, .sheet-top p, .kicker { margin: 0; }
.kicker { color: #a84562; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.sheet-top h2 { margin-top: 4px; font-size: 22px; }
.sheet-top p { margin-top: 4px; max-width: 68ch; color: #5c574e; font-size: 13px; line-height: 1.5; }
.score { margin: 0; padding: 8px 12px; border-radius: 999px; background: #fff; color: #3c4043; font-size: 13px; white-space: nowrap; }
.score strong { color: #125c3b; font-size: 18px; }
.table { flex: none; min-width: 980px; background: #fffdf8; border: 1px solid rgba(62, 48, 28, 0.08); border-radius: 14px; }
.head, .row { display: grid; grid-template-columns: 42px 112px minmax(220px, 1.3fr) minmax(180px, 1fr) minmax(180px, 1fr) 92px; gap: 8px; align-items: stretch; }
.head { position: sticky; top: 0; z-index: 4; align-items: center; min-height: 40px; padding: 0 12px; border-radius: 14px 14px 0 0; background: #3e3428; color: #fff; font-size: 13px; font-weight: 700; }
.row { height: 200px; min-height: 200px; max-height: 200px; padding: 0 8px; border-top: 1px solid #f1ebe3; overflow: hidden; }
.row[data-pass='false'] { background: #fff6f6; }
.row[data-pass='true'] { background: #f4fbf6; }
.num, .row > strong { display: flex; align-items: center; min-width: 0; }
.row > strong { font-size: 14px; line-height: 1.35; }
.num { color: #8a8175; font-weight: 700; }
.marks { display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 6px; }
.marks button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; padding: 4px 8px; cursor: pointer; }
.marks button[aria-pressed='true'] { background: #187a4e; border-color: #187a4e; color: #fff; }
.marks button.no[aria-pressed='true'] { background: #c5221f; border-color: #c5221f; color: #fff; }
</style>

<style>
/* 全局润色把表格裁成 overflow:hidden，粘性表头会跟着整页一起滚走。 */
.canvas-viewport .sheet.ten-check-sheet {
  padding: 0 20px 20px;
}
.canvas-viewport .sheet.ten-check-sheet .table {
  overflow: visible;
}
</style>
