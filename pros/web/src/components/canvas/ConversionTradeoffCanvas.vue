<script setup lang="ts">
import { computed } from 'vue'
import type {
  ConversionTradeoffCellKey,
  ConversionTradeoffDocumentJSON,
  ConversionTradeoffRow,
  QuadrantItem,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: ConversionTradeoffDocumentJSON
}>()

const documentStore = useDocumentStore()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const COLUMNS: { key: ConversionTradeoffCellKey; labelKey: 'drive' | 'resistance' | 'touchpoint' }[] = [
  { key: 'drive', labelKey: 'drive' },
  { key: 'resistance', labelKey: 'resistance' },
  { key: 'touchpoint', labelKey: 'touchpoint' },
]

function cellBlockId(rowId: string, cell: ConversionTradeoffCellKey): string {
  return `${rowId}:${cell}`
}

function cellAsBlock(row: ConversionTradeoffRow, cell: ConversionTradeoffCellKey) {
  return {
    id: cellBlockId(row.id, cell),
    title: '',
    items: row[cell] as QuadrantItem[],
  }
}

function onPriorityInput(rowId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  documentStore.updateConversionTradeoffPriorityLabel(rowId, value)
}

function onAddRow() {
  documentStore.addConversionTradeoffRow()
}

function onRemoveRow(rowId: string) {
  documentStore.removeConversionTradeoffRow(rowId)
}
</script>

<template>
  <div class="ct-canvas" :style="{ backgroundColor: bgColor }">
    <div class="ct-table" role="table" aria-label="转化率取舍画布">
      <div class="ct-col-headers" role="row">
        <div class="ct-col-header ct-col-priority" role="columnheader">
          {{ doc.columnLabels.priority }}
        </div>
        <div
          v-for="col in COLUMNS"
          :key="col.key"
          class="ct-col-header"
          role="columnheader"
        >
          {{ doc.columnLabels[col.labelKey] }}
        </div>
        <div class="ct-col-header ct-col-header--actions" aria-hidden="true" />
      </div>

      <div class="ct-body">
        <div
          v-for="row in doc.rows"
          :key="row.id"
          class="ct-row"
          role="row"
        >
          <div class="ct-priority" role="cell">
            <input
              class="ct-priority-input"
              type="text"
              :value="row.priorityLabel"
              placeholder="优先级…"
              maxlength="32"
              :aria-label="`优先级：${row.priorityLabel || '未命名'}`"
              @input="onPriorityInput(row.id, $event)"
              @click.stop
            />
          </div>
          <section
            v-for="col in COLUMNS"
            :key="col.key"
            class="ct-cell"
            role="cell"
          >
            <YModelBlockCard
              :block="cellAsBlock(row, col.key)"
              hide-title
            />
          </section>
          <div class="ct-row-actions">
            <button
              type="button"
              class="ct-row-delete"
              title="删除本行"
              :disabled="doc.rows.length <= 1"
              @click="onRemoveRow(row.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="ct-add-row">
      <button type="button" class="ct-add-btn" @click="onAddRow">
        + 添加行
      </button>
    </div>
  </div>
</template>

<style scoped>
.ct-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border-radius: 2px;
  border: 1px solid #dadce0;
}



.ct-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ct-col-headers {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(88px, 0.55fr) repeat(3, minmax(0, 1.15fr)) 36px;
  background: #fff8e1;
  border-bottom: 1px solid #dadce0;
}

.ct-col-header {
  padding: 10px 12px;
  text-align: center;
  font-size: clamp(13px, 1.35vw, 16px);
  font-weight: 700;
  color: #202124;
  border-right: 1px solid #dadce0;
  letter-spacing: 0.04em;
}

.ct-col-priority {
  text-align: center;
}

.ct-col-header--actions {
  border-right: none;
  padding: 0;
}

.ct-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.ct-body::-webkit-scrollbar {
  width: 6px;
}

.ct-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.35);
  border-radius: 999px;
}

.ct-row {
  display: grid;
  grid-template-columns: minmax(88px, 0.55fr) repeat(3, minmax(0, 1.15fr)) 36px;
  min-height: 140px;
  border-bottom: 1px solid #dadce0;
}

.ct-priority {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  box-sizing: border-box;
  border-right: 1px solid #dadce0;
  background: #fff;
}

.ct-priority-input {
  width: 100%;
  max-width: 100%;
  border: none;
  border-bottom: 1.5px solid transparent;
  background: transparent;
  text-align: center;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #202124;
  padding: 4px 2px;
  outline: none;
  box-sizing: border-box;
}

.ct-priority-input:hover {
  border-bottom-color: #dadce0;
}

.ct-priority-input:focus {
  border-bottom-color: #1a73e8;
}

.ct-priority-input::placeholder {
  color: #b0b4b8;
  font-weight: 600;
}

.ct-cell {
  min-width: 0;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
  border-right: 1px solid #dadce0;
  display: flex;
  flex-direction: column;
}

.ct-cell :deep(.ym-block) {
  flex: 1;
  min-height: 110px;
  background: rgba(248, 249, 250, 0.55);
}

.ct-row-actions {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12px;
}

.ct-row-delete {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9aa0a6;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.ct-row-delete:hover:not(:disabled) {
  background: #fce8e6;
  color: #d93025;
}

.ct-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ct-add-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 12px;
  border-top: 1px dashed #dadce0;
  background: #fafafa;
}

.ct-add-btn {
  border: 1px dashed #9aa0a6;
  border-radius: 6px;
  background: #fff;
  color: #5f6368;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 16px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.ct-add-btn:hover {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #1a73e8;
}

@media (max-width: 720px) {
  .ct-canvas {
    overflow-y: auto;
  }

  .ct-col-headers,
  .ct-row {
    grid-template-columns: 1fr;
  }

  .ct-col-header--actions,
  .ct-row-actions {
    display: none;
  }

  .ct-priority,
  .ct-cell {
    border-right: none;
    border-bottom: 1px solid #eee;
  }

  .ct-priority {
    min-height: 48px;
  }

  .ct-cell :deep(.ym-block) {
    min-height: 96px;
  }
}
</style>
