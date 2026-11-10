<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { DailyKanbanDocumentJSON, KanbanColumnId } from '../../types/canvas'
import { isDailyKanbanDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { newCanvasId } from '../../utils/classicCanvases'

const props = defineProps<{ doc: DailyKanbanDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const order: KanbanColumnId[] = ['todo', 'doing', 'blocked', 'done']

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
</script>

<template>
  <div class="kanban" :style="chrome" aria-label="每日看板">
    <h2>{{ doc.title }}</h2>
    <div class="kanban-board">
      <section v-for="(column, index) in doc.columns" :key="column.id" :aria-label="column.title">
        <header>
          <strong>{{ column.title }}</strong>
          <button type="button" @click="addCard(column.id)">添加</button>
        </header>
        <article v-for="card in column.cards" :key="card.id">
          <textarea :value="card.text" :aria-label="`${column.title}卡片`" @change="editCard(card.id, ($event.target as HTMLTextAreaElement).value)" />
          <div class="kanban-move">
            <button type="button" :disabled="index === 0" @click="move(card.id, -1)">左移</button>
            <button type="button" :disabled="index === order.length - 1" @click="move(card.id, 1)">右移</button>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kanban { height: 100%; overflow: auto; padding: 16px; color: #202124; }
.kanban h2 { margin: 0 0 12px; font-size: 18px; }
.kanban-board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
section { background: #fff; border: 1px solid #ececec; border-radius: 12px; padding: 8px; min-height: 240px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
article { background: #f8f9fa; border-radius: 8px; padding: 6px; margin-bottom: 8px; }
textarea { width: 100%; min-height: 48px; border: 0; background: transparent; resize: vertical; font: inherit; }
button { border: 1px solid #dadce0; background: #fff; border-radius: 6px; }
.kanban-move { display: flex; gap: 4px; }
</style>
