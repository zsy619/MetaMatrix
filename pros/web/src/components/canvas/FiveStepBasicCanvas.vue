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

      <footer
        v-for="(col, index) in doc.columns"
        :key="`f-${col.id}`"
        class="fsb-footer"
        :class="{ 'is-last': index === doc.columns.length - 1 }"
        role="cell"
      >
        <span>{{ col.footerLabel }}</span>
      </footer>
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
  background: #fff;
}

.fsb-table {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: auto minmax(420px, 1fr) auto;
  align-content: stretch;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  gap: 0;
  box-sizing: border-box;
}

.fsb-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffff00;
  border-right: 1px solid #9aa0a6;
  border-bottom: 1px solid #9aa0a6;
  padding: 10px 10px;
  min-height: 42px;
  box-sizing: border-box;
}

.fsb-header.is-last {
  border-right: none;
}

.fsb-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsb-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 10px 12px 12px;
  background: #fff;
  border-right: 1px solid #9aa0a6;
  box-sizing: border-box;
}

.fsb-cell.is-last {
  border-right: none;
}

.fsb-cell :deep(.ym-block) {
  flex: 1;
  min-height: 0;
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
  top: 2px;
  right: 2px;
  z-index: 4;
  padding: 0;
  opacity: 0.7;
}

.fsb-cell :deep(.ym-block-body) {
  padding: 0;
}

/* 格内编辑器铺满奶油底，不额外套一层边框 */
.fsb-cell :deep(.rte-root) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  height: 100%;
}

.fsb-cell :deep(.rte-canvas) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

.fsb-cell :deep(.rte-body),
.fsb-cell :deep(.ym-rte),
.fsb-cell :deep(.ProseMirror) {
  min-height: 100%;
  font-size: 14px;
  line-height: 1.55;
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

.fsb-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 6px;
  min-height: 38px;
  box-sizing: border-box;
  background: #f1f3f4;
  border-top: 1px solid #9aa0a6;
  border-right: 1px solid #9aa0a6;
}

.fsb-footer.is-last {
  border-right: none;
}

.fsb-footer span {
  font-size: clamp(12px, 1.25vw, 15px);
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

@media (max-width: 900px) {
  .fsb-canvas {
    overflow: auto;
  }

  .fsb-table {
    min-width: 900px;
    min-height: 560px;
  }
}
</style>
