<script setup lang="ts">
import { computed } from 'vue'
import type {
  GrowthAssumptionsCellKey,
  GrowthAssumptionsDocumentJSON,
  GrowthAssumptionsRow,
  QuadrantItem,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: GrowthAssumptionsDocumentJSON
}>()

const documentStore = useDocumentStore()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const COLUMNS: { key: GrowthAssumptionsCellKey; label: string }[] = [
  { key: 'assumption', label: '关键假设' },
  { key: 'proposer', label: '提出者' },
  { key: 'proposedAt', label: '提出时间' },
  { key: 'owner', label: '项目负责人' },
  { key: 'result', label: '验证结果' },
]

function cellBlockId(rowId: string, cell: GrowthAssumptionsCellKey): string {
  return `${rowId}:${cell}`
}

function cellAsBlock(row: GrowthAssumptionsRow, cell: GrowthAssumptionsCellKey) {
  return {
    id: cellBlockId(row.id, cell),
    title: COLUMNS.find((c) => c.key === cell)?.label || '',
    items: row[cell] as QuadrantItem[],
  }
}

function onAddRow() {
  documentStore.addGrowthAssumptionsRow()
}

function onRemoveRow(rowId: string) {
  documentStore.removeGrowthAssumptionsRow(rowId)
}
</script>

<template>
  <div
    class="ga-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="增长假设清单"
  >
    <div class="ga-table" role="table" aria-label="增长假设清单">
      <div class="ga-col-headers" role="row">
        <div
          v-for="(col, colIndex) in COLUMNS"
          :key="col.key"
          class="ga-col-header"
          role="columnheader"
          :style="toneVars(colIndex)"
        >
          {{ col.label }}
        </div>
        <div class="ga-col-header ga-col-header--actions" aria-hidden="true" />
      </div>

      <div class="ga-body">
        <div
          v-for="row in doc.rows"
          :key="row.id"
          class="ga-row"
          role="row"
        >
          <section
            v-for="(col, colIndex) in COLUMNS"
            :key="col.key"
            class="ga-cell tbl-tone"
            role="cell"
            :style="toneVars(colIndex)"
          >
            <YModelBlockCard
              :block="cellAsBlock(row, col.key)"
              hide-title
            />
          </section>
          <div class="ga-row-actions">
            <button
              type="button"
              class="ga-row-delete"
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

    <div class="ga-add-row">
      <button type="button" class="ga-add-btn" @click="onAddRow">
        + 添加行
      </button>
    </div>
  </div>
</template>

<style scoped>
.ga-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 16px 18px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
}

.ga-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid #111111;
  background: #ffffff;
}

.ga-col-headers {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1.4fr 0.85fr 0.85fr 0.95fr 1.1fr 36px;
  background: transparent;
  border-bottom: 2px solid #111111;
}

.ga-col-header {
  padding: 12px 10px;
  text-align: center;
  font-size: clamp(14px, 1.4vw, 17px);
  font-weight: 800;
  color: #fff;
  background: var(--tbl-header, #90949c);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  border-right: 2px solid #111111;
  letter-spacing: 0.04em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.ga-col-header--actions {
  border-right: none;
  padding: 0;
  background: #e8eaed;
  text-shadow: none;
}

.ga-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.ga-body::-webkit-scrollbar {
  width: 6px;
}

.ga-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.35);
  border-radius: 999px;
}

.ga-row {
  display: grid;
  grid-template-columns: 1.4fr 0.85fr 0.85fr 0.95fr 1.1fr 36px;
  min-height: 400px;
  border-bottom: 2px solid #111111;
  background: #fff;
}

.ga-row:last-child {
  border-bottom: none;
}

.ga-cell {
  min-width: 0;
  min-height: 400px;
  padding: 6px;
  box-sizing: border-box;
  border-right: 2px solid #111111;
  display: flex;
  flex-direction: column;
  background: var(--tbl-body, #ffffff);
}

.ga-cell :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.ga-cell :deep(.ym-block-toolbar) {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ga-cell:hover :deep(.ym-block-toolbar),
.ga-cell :deep(.ym-block.selected .ym-block-toolbar) {
  opacity: 1;
}

.ga-row-actions {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
  background: #ffffff;
}

.ga-row-delete {
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

.ga-row-delete:hover:not(:disabled) {
  background: #fce8e6;
  color: #d93025;
}

.ga-row-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ga-add-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 10px 0 0;
}

.ga-add-btn {
  border: 1px dashed #9aa0a6;
  background: #fff;
  color: #5f6368;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.ga-add-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: #e8f0fe;
}

@media (max-width: 900px) {
  .ga-col-headers,
  .ga-row {
    grid-template-columns: 1.2fr 0.8fr 0.8fr 0.9fr 1fr 32px;
  }
}
</style>
