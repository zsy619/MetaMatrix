<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBasicBlock,
  FiveStepBasicBlockId,
  FiveStepBasicDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: FiveStepBasicDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepBasicBlockId, FiveStepBasicBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: FiveStepBasicBlockId): FiveStepBasicBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div
    class="fsb-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="五步法（基础版）"
  >
    <div class="fsb-table" role="table" aria-label="五步法（基础版）">
      <header
        v-for="(col, index) in doc.columns"
        :key="`h-${col.id}`"
        class="fsb-header"
        :class="{ 'is-last': index === doc.columns.length - 1 }"
        role="columnheader"
      >
        <h2>{{ col.header }}</h2>
      </header>

      <section
        v-for="(col, index) in doc.columns"
        :key="col.id"
        class="fsb-cell"
        :class="{ 'is-last': index === doc.columns.length - 1 }"
        role="cell"
      >
        <YModelBlockCard
          v-if="block(col.id)"
          :block="block(col.id)!"
          hide-title
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.fsb-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: auto;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
}

.fsb-table {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: auto minmax(400px, 1fr);
  align-content: stretch;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-sizing: border-box;
}

.fsb-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6f8;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  padding: 14px 8px;
  min-height: 52px;
  box-sizing: border-box;
}

.fsb-header.is-last {
  border-right: none;
}

.fsb-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.35vw, 16px);
  font-weight: 600;
  color: #111111;
  letter-spacing: 0.02em;
  line-height: 1.3;
  text-align: center;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsb-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 400px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  box-sizing: border-box;
}

.fsb-cell.is-last {
  border-right: none;
}

.fsb-cell :deep(.ym-block) {
  flex: 1;
  min-height: 400px;
  height: 100%;
  background: transparent;
  box-shadow: none;
  border: none;
  border-radius: 0;
}

.fsb-cell :deep(.ym-block.selected),
.fsb-cell :deep(.ym-block.is-source-max) {
  background: transparent;
  box-shadow: none;
  border: none;
}

.fsb-cell :deep(.ym-block-toolbar) {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 4;
  padding: 0;
}

.fsb-cell :deep(.ym-block-body) {
  padding: 8px 10px 4px;
}

/* 格内编辑器铺满白底，不额外套一层边框 */
.fsb-cell :deep(.rte-root) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: #ffffff;
  height: 100%;
}

.fsb-cell :deep(.rte-canvas) {
  flex: 1;
  min-height: 0;
  background: #ffffff;
}

.fsb-cell :deep(.rte-body),
.fsb-cell :deep(.ym-rte),
.fsb-cell :deep(.ProseMirror) {
  min-height: 100%;
  font-size: 14px;
  line-height: 1.6;
  color: #202124;
}

.fsb-cell :deep(.rte-toolbar) {
  padding-right: 28px;
}

/* 默认空白：不把占位文案画进格内，对齐附图的空单元格 */
.fsb-cell :deep(.ProseMirror p.is-editor-empty:first-child::before),
.fsb-cell :deep(.ProseMirror p.is-empty:first-child::before),
.fsb-cell :deep(.ProseMirror.is-editor-empty p:first-child::before) {
  content: none;
}

@media (max-width: 900px) {
  .fsb-canvas {
    overflow: auto;
  }

  .fsb-table {
    min-width: 900px;
    min-height: 480px;
  }
}
</style>
