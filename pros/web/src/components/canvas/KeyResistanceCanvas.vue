<script setup lang="ts">
import { computed } from 'vue'
import type {
  KeyResistanceCellKey,
  KeyResistanceDocumentJSON,
  KeyResistanceRow,
  QuadrantItem,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: KeyResistanceDocumentJSON
}>()

const documentStore = useDocumentStore()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const COLUMNS: { key: KeyResistanceCellKey; label: string }[] = [
  { key: 'resistance', label: '阻力假设' },
  { key: 'eliminate', label: '消除假设' },
  { key: 'notes', label: '备注/具体策略和文案' },
]

function cellBlockId(rowId: string, cell: KeyResistanceCellKey): string {
  return `${rowId}:${cell}`
}

function cellAsBlock(row: KeyResistanceRow, cell: KeyResistanceCellKey) {
  return {
    id: cellBlockId(row.id, cell),
    title: '',
    items: row[cell] as QuadrantItem[],
  }
}

function onRateInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  documentStore.updateKeyResistanceRateLabel(value)
}

function onAddRow() {
  documentStore.addKeyResistanceRow()
}

function onRemoveRow(rowId: string) {
  documentStore.removeKeyResistanceRow(rowId)
}
</script>

<template>
  <div class="key-resistance-canvas" :style="{ backgroundColor: bgColor }">
    <header class="kr-header">
      <span class="kr-header-fixed">关键阻力分析画布：</span>
      <input
        class="kr-rate-input"
        type="text"
        :value="doc.rateLabel"
        placeholder="______"
        maxlength="24"
        aria-label="率指标，如转化"
        @input="onRateInput"
      />
      <span class="kr-header-suffix">率</span>
    </header>

    <div class="kr-table" role="table" aria-label="关键阻力分析画布">
      <div class="kr-col-headers" role="row">
        <div
          v-for="(col, colIndex) in COLUMNS"
          :key="col.key"
          class="kr-col-header"
          role="columnheader"
          :style="toneVars(colIndex)"
        >
          {{ col.label }}
        </div>
        <div class="kr-col-header kr-col-header--actions" aria-hidden="true" />
      </div>

      <div class="kr-body">
        <div
          v-for="row in doc.rows"
          :key="row.id"
          class="kr-row"
          role="row"
        >
          <section
            v-for="(col, colIndex) in COLUMNS"
            :key="col.key"
            class="kr-cell tbl-tone"
            role="cell"
            :style="toneVars(colIndex)"
          >
            <YModelBlockCard
              :block="cellAsBlock(row, col.key)"
              hide-title
            />
          </section>
          <div class="kr-row-actions">
            <button
              type="button"
              class="kr-row-delete"
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

    <div class="kr-add-row">
      <button type="button" class="kr-add-btn" @click="onAddRow">
        + 添加行
      </button>
    </div>

    <footer class="kr-footer">
      <p class="kr-tips-title">{{ doc.tipsTitle }}</p>
      <ul class="kr-tips">
        <li v-for="(tip, i) in doc.tips" :key="i">{{ tip }}</li>
      </ul>
    </footer>
  </div>
</template>

<style scoped>
.key-resistance-canvas {
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

.kr-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 12px 16px;
  background: #fff9c4;
  border-bottom: 1px solid #e0e0e0;
  font-size: clamp(16px, 1.8vw, 20px);
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.kr-header-fixed,
.kr-header-suffix {
  flex-shrink: 0;
}

.kr-rate-input {
  width: 5.5em;
  min-width: 3.2em;
  max-width: 10em;
  border: none;
  border-bottom: 2px solid #9aa0a6;
  background: transparent;
  text-align: center;
  font: inherit;
  font-weight: 700;
  color: #202124;
  padding: 0 4px 1px;
  outline: none;
}

.kr-rate-input::placeholder {
  color: #b0b4b8;
  letter-spacing: 0.08em;
}

.kr-rate-input:focus {
  border-bottom-color: #1a73e8;
}

.kr-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kr-col-headers {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) 36px;
  background: transparent;
  border-bottom: 1px solid #dadce0;
}

.kr-col-header {
  padding: 10px 12px;
  text-align: center;
  font-size: clamp(13px, 1.3vw, 15px);
  font-weight: 700;
  color: #fff;
  background: var(--tbl-header, #5f6368);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  border-right: 1px solid #dadce0;
  letter-spacing: 0.02em;
}

.kr-col-header--actions {
  border-right: none;
  padding: 0;
  background: #e8eaed;
  text-shadow: none;
}

.kr-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.kr-body::-webkit-scrollbar {
  width: 6px;
}

.kr-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.35);
  border-radius: 999px;
}

.kr-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) 36px;
  min-height: 400px;
  border-bottom: 1px solid #dadce0;
}

.kr-cell {
  min-width: 0;
  min-height: 400px;
  padding: 8px;
  box-sizing: border-box;
  border-right: 1px solid #dadce0;
  display: flex;
  flex-direction: column;
  background: var(--tbl-body, #fff);
}

.kr-cell :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

.kr-row-actions {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
}

.kr-row-delete {
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

.kr-row-delete:hover:not(:disabled) {
  background: #fce8e6;
  color: #d93025;
}

.kr-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.kr-add-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 12px;
  border-top: 1px dashed #dadce0;
  background: #fafafa;
}

.kr-add-btn {
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

.kr-add-btn:hover {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #1a73e8;
}

.kr-footer {
  flex-shrink: 0;
  padding: 10px 16px 12px;
  border-top: 1px solid #eceff1;
  background: #fff;
}

.kr-tips-title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: #5f6368;
}

.kr-tips {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kr-tips li {
  font-size: 12px;
  color: #c75b3a;
  line-height: 1.45;
  opacity: 0.92;
}

@media (max-width: 720px) {
  .key-resistance-canvas {
    overflow-y: auto;
  }

  .kr-col-headers,
  .kr-row {
    grid-template-columns: 1fr;
  }

  .kr-col-header--actions,
  .kr-row-actions {
    display: none;
  }

  .kr-row {
    min-height: 0;
  }

  .kr-cell {
    border-right: none;
    border-bottom: 1px solid #eee;
    min-height: 400px;
  }
}
</style>
