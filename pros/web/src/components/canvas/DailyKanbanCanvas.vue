<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { DailyKanbanDocumentJSON, KanbanColumnId } from '../../types/canvas'
import { isDailyKanbanDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId } from '../../utils/classicCanvases'
import { FIVE_STEP_NEGATE, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'

const props = defineProps<{ doc: DailyKanbanDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const tones: Record<KanbanColumnId, FiveStepPalette> = {
  todo: FIVE_STEP_PALETTE.demand,
  doing: FIVE_STEP_PALETTE.business,
  blocked: FIVE_STEP_NEGATE,
  done: FIVE_STEP_PALETTE.growth,
}

function toneStyle(id: KanbanColumnId) {
  const tone = tones[id] || FIVE_STEP_PALETTE.demand
  return {
    '--col-header': tone.header,
    '--col-body': tone.body,
    '--col-topic': tone.topic,
  }
}

function move(cardId: string, direction: -1 | 1) {
  documentStore.mutateCanvas((doc) => {
    if (!isDailyKanbanDoc(doc)) return
    const from = doc.columns.findIndex((column) => column.cards.some((card) => card.id === cardId))
    const to = from + direction
    if (from < 0 || to < 0 || to >= doc.columns.length) return
    const card = doc.columns[from].cards.find((item) => item.id === cardId)
    if (!card) return
    doc.columns = doc.columns.map((column, index) => {
      if (index === from) return { ...column, cards: column.cards.filter((item) => item.id !== cardId) }
      if (index === to) return { ...column, cards: [...column.cards, card] }
      return column
    })
  })
}

function addCard(columnId: KanbanColumnId) {
  documentStore.mutateCanvas((doc) => {
    if (!isDailyKanbanDoc(doc)) return
    doc.columns = doc.columns.map((column) =>
      column.id === columnId
        ? { ...column, cards: [...column.cards, { id: newCanvasId('card'), text: '新卡片' }] }
        : column,
    )
  })
}

function editCard(cardId: string, text: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isDailyKanbanDoc(doc)) return
    doc.columns = doc.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => (card.id === cardId ? { ...card, text } : card)),
    }))
  })
}

function removeCard(cardId: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isDailyKanbanDoc(doc)) return
    doc.columns = doc.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId),
    }))
  })
}
</script>

<template>
  <div class="kanban" :style="chrome" aria-label="每日看板">
    <h2>{{ doc.title }}</h2>
    <div class="kanban-board">
      <section
        v-for="(column, index) in doc.columns"
        :key="column.id"
        :aria-label="column.title"
        :data-column="column.id"
        :style="toneStyle(column.id)"
      >
        <header>
          <strong>{{ column.title }}</strong>
          <span class="count">{{ column.cards.length }}</span>
          <button type="button" @click="addCard(column.id)">添加</button>
        </header>
        <div class="cards">
          <article v-for="card in column.cards" :key="card.id">
            <textarea :value="card.text" :aria-label="`${column.title}卡片`" @change="editCard(card.id, ($event.target as HTMLTextAreaElement).value)" />
            <div class="kanban-move">
              <button type="button" :disabled="index === 0" @click="move(card.id, -1)">左移</button>
              <button type="button" :disabled="index === doc.columns.length - 1" @click="move(card.id, 1)">右移</button>
              <button type="button" @click="removeCard(card.id)">删除</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kanban {
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
.kanban h2 { margin: 0 0 10px; font-size: 18px; flex: none; }
.kanban-board {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--col-body);
  border: 1px solid color-mix(in srgb, var(--col-header) 28%, #fff);
  border-radius: 12px;
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 10px;
  background: var(--col-header);
  color: #fff;
}
header strong { font-size: 15px; letter-spacing: 0.04em; }
.count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 12px;
  text-align: center;
}
header button {
  margin-left: auto;
  border: 0;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-radius: 6px;
  padding: 3px 8px;
}
.cards { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; }
article {
  background: #fff;
  border-left: 4px solid var(--col-header);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(60, 50, 20, 0.06);
}
textarea {
  width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
  resize: vertical;
  font: inherit;
  color: var(--col-topic);
}
.kanban-move { display: flex; gap: 4px; }
.kanban-move button {
  border: 1px solid color-mix(in srgb, var(--col-header) 35%, #fff);
  background: var(--col-body);
  color: var(--col-topic);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
}
.kanban-move button:disabled { opacity: 0.4; }
@media (max-width: 800px) {
  .kanban-board { grid-template-columns: repeat(4, minmax(160px, 1fr)); overflow: auto; }
}
</style>
