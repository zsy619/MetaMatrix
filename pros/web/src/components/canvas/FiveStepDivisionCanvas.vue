<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepDivisionBlock,
  FiveStepDivisionBlockId,
  FiveStepDivisionDocumentJSON,
  FiveStepDivisionRowId,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import {
  fiveStepCanvasStyle,
  fiveStepColumnStyle,
  fiveStepRowStyle,
} from '../../utils/fiveStepTheme'

const props = defineProps<{
  doc: FiveStepDivisionDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepDivisionBlockId, FiveStepDivisionBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function blockId(
  colId: string,
  rowId: FiveStepDivisionRowId,
): FiveStepDivisionBlockId {
  return `${colId}_${rowId}` as FiveStepDivisionBlockId
}

function block(
  colId: string,
  rowId: FiveStepDivisionRowId,
): FiveStepDivisionBlock | undefined {
  return byId.value.get(blockId(colId, rowId))
}

const canvasStyle = computed(() => fiveStepCanvasStyle(props.doc.theme))

function columnStyle(col: FiveStepDivisionDocumentJSON['columns'][number]) {
  return fiveStepColumnStyle(props.doc.theme, col)
}

function rowStyle(row: FiveStepDivisionDocumentJSON['rows'][number]) {
  return fiveStepRowStyle(props.doc.theme, row)
}
</script>

<template>
  <div class="fsd-canvas" :style="canvasStyle">
    <div class="fsd-grid">
      <!-- 表头：空角 + 五步语义浅色表头 -->
      <div class="fsd-corner" aria-hidden="true" />
      <header
        v-for="col in doc.columns"
        :key="`h-${col.id}`"
        class="fsd-header"
        :style="columnStyle(col)"
      >
        <h2>{{ col.header }}</h2>
      </header>

      <!-- 三行：左侧维度标签 + 五列单元格 -->
      <template v-for="row in doc.rows" :key="row.id">
        <div class="fsd-row-label" :style="rowStyle(row)">
          <span>{{ row.label }}</span>
        </div>
        <div
          v-for="col in doc.columns"
          :key="`${col.id}_${row.id}`"
          class="fsd-cell"
          :style="rowStyle(row)"
        >
          <YModelBlockCard
            v-if="block(col.id, row.id)"
            :block="block(col.id, row.id)!"
            hide-title
          />
        </div>
      </template>

      <!-- 底行：空角 + 五列方法论页脚 -->
      <div class="fsd-footer-corner" aria-hidden="true" />
      <footer
        v-for="col in doc.columns"
        :key="`f-${col.id}`"
        class="fsd-footer"
      >
        <span>{{ col.footerLabel }}</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fsd-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: auto;
  box-sizing: border-box;
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  background: #f7f7f7;
}

.fsd-grid {
  flex: 1;
  min-height: min(100%, 720px);
  width: 100%;
  display: grid;
  grid-template-columns: 52px repeat(5, minmax(0, 1fr));
  grid-template-rows: auto repeat(3, minmax(0, 1fr)) auto;
  align-content: stretch;
  border: 1px solid var(--fs-border, #ececec);
  border-radius: 8px;
  overflow: hidden;
  background: var(--fs-surface, #fff);
  gap: 0;
}

.fsd-corner {
  background: var(--fs-footer, #f6f4ef);
  box-shadow:
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  min-height: 46px;
}

.fsd-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-col-header, #fbf6e4);
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 12px 10px 11px;
  min-height: 46px;
  box-sizing: border-box;
}

.fsd-header:nth-child(6) {
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsd-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 700;
  color: var(--fs-col-header-text, #7a5c00);
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-align: center;
}

.fsd-row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-rail, #f6ebd4);
  box-shadow:
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 8px 4px;
  box-sizing: border-box;
  min-width: 0;
}

.fsd-row-label span {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  font-size: 13px;
  font-weight: 700;
  color: var(--fs-rail-text, #3c3424);
  letter-spacing: 0.18em;
  line-height: 1.2;
  white-space: nowrap;
}

.fsd-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--fs-row-body, #fff);
  box-shadow:
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 8px 10px 10px;
  box-sizing: border-box;
}

.fsd-cell:nth-child(6n) {
  box-shadow: inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsd-cell :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  box-shadow: none;
  border: none;
}

.fsd-cell :deep(.ym-block-toolbar) {
  opacity: 0.55;
}

.fsd-cell :deep(.ym-block-body) {
  padding-top: 0;
}

.fsd-cell :deep(.ym-rte),
.fsd-cell :deep(.ProseMirror) {
  font-size: 13px;
  line-height: 1.45;
  color: var(--fs-body-text, #3c4043);
}

.fsd-cell :deep(.ProseMirror p) {
  margin: 0 0 2px;
}

.fsd-footer-corner {
  background: var(--fs-footer, #f6f4ef);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  min-height: 40px;
  box-sizing: border-box;
}

.fsd-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 6px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--fs-footer, #f6f4ef);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsd-footer:nth-child(6n) {
  box-shadow: none;
}

.fsd-footer span {
  font-size: clamp(12px, 1.15vw, 13px);
  font-weight: 600;
  color: var(--fs-footer-text, #6b6458);
  letter-spacing: 0.08em;
  text-align: center;
  line-height: 1.35;
}

@media (max-width: 900px) {
  .fsd-canvas {
    overflow: auto;
    padding: 8px;
  }

  .fsd-grid {
    min-width: 920px;
    min-height: 640px;
  }
}
</style>
