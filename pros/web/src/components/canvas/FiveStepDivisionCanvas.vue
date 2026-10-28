<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepDivisionBlock,
  FiveStepDivisionBlockId,
  FiveStepDivisionDocumentJSON,
  FiveStepDivisionRowId,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

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

const bgColor = computed(
  () => props.doc.theme.background.color || '#faf8f5',
)
</script>

<template>
  <div class="fsd-canvas" :style="{ backgroundColor: bgColor }">
    <div class="fsd-grid">
      <!-- 表头：空角 + 五步黄头 -->
      <div class="fsd-corner" aria-hidden="true" />
      <header
        v-for="col in doc.columns"
        :key="`h-${col.id}`"
        class="fsd-header"
      >
        <h2>{{ col.header }}</h2>
      </header>

      <!-- 三行：左侧维度标签 + 五列单元格 -->
      <template v-for="row in doc.rows" :key="row.id">
        <div class="fsd-row-label">
          <span>{{ row.label }}</span>
        </div>
        <div
          v-for="col in doc.columns"
          :key="`${col.id}_${row.id}`"
          class="fsd-cell"
        >
          <YModelBlockCard
            v-if="block(col.id, row.id)"
            :block="block(col.id, row.id)!"
            hide-title
          />
        </div>
      </template>
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
  padding: 0;
  display: flex;
  flex-direction: column;
}

.fsd-grid {
  flex: 1;
  min-height: min(100%, 720px);
  width: 100%;
  display: grid;
  grid-template-columns: 44px repeat(5, minmax(0, 1fr));
  grid-template-rows: auto repeat(3, minmax(0, 1fr));
  align-content: stretch;
  border: 2px solid #5f6368;
  border-radius: 4px;
  overflow: hidden;
  background: #e8e6e1;
  gap: 0;
}

.fsd-corner {
  background: #ffff00;
  border-right: 1px solid #5f6368;
  border-bottom: 1px solid #5f6368;
  min-height: 42px;
}

.fsd-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffff00;
  border-right: 1px solid #5f6368;
  border-bottom: 1px solid #5f6368;
  padding: 10px 6px;
  min-height: 42px;
  box-sizing: border-box;
}

.fsd-header:nth-child(6) {
  border-right: none;
}

.fsd-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-align: center;
}

.fsd-row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #faf8f5;
  border-right: 1px solid #5f6368;
  border-bottom: 1px solid #5f6368;
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
  color: #202124;
  letter-spacing: 0.18em;
  line-height: 1.2;
  white-space: nowrap;
}

.fsd-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #faf8f5;
  border-right: 1px solid #5f6368;
  border-bottom: 1px solid #5f6368;
  padding: 4px 6px 6px;
  box-sizing: border-box;
}

.fsd-cell:nth-child(6n) {
  border-right: none;
}

/* 最后一行无底边可保留网格感；保持底边与外框一致 */
.fsd-grid > .fsd-row-label:nth-last-child(6),
.fsd-grid > .fsd-cell:nth-last-child(-n + 5) {
  border-bottom: none;
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
  line-height: 1.35;
  color: #3c4043;
}

.fsd-cell :deep(.ProseMirror p) {
  margin: 0 0 2px;
}

@media (max-width: 900px) {
  .fsd-canvas {
    overflow: auto;
  }

  .fsd-grid {
    min-width: 920px;
    min-height: 640px;
  }
}
</style>
