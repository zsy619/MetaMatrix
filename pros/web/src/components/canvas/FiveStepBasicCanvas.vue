<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBasicBlock,
  FiveStepBasicBlockId,
  FiveStepBasicDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { fiveStepCanvasStyle, fiveStepColumnStyle } from '../../utils/fiveStepTheme'

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

const canvasStyle = computed(() => fiveStepCanvasStyle(props.doc.theme))

function columnStyle(col: FiveStepBasicDocumentJSON['columns'][number]) {
  return fiveStepColumnStyle(props.doc.theme, col)
}
</script>

<template>
  <div
    class="fsb-canvas"
    :style="canvasStyle"
    aria-label="五步法（基础版）"
  >
    <div class="fsb-table" role="table" aria-label="五步法（基础版）">
      <header
        v-for="(col, index) in doc.columns"
        :key="`h-${col.id}`"
        class="fsb-header"
        :class="{ 'is-last': index === doc.columns.length - 1 }"
        :style="columnStyle(col)"
        role="columnheader"
      >
        <h2>{{ col.header }}</h2>
      </header>

      <section
        v-for="(col, index) in doc.columns"
        :key="col.id"
        class="fsb-cell"
        :class="{ 'is-last': index === doc.columns.length - 1 }"
        :style="columnStyle(col)"
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
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f7f7f7;
}

.fsb-table {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: auto minmax(420px, 1fr) auto;
  align-content: stretch;
  border: 1px solid var(--fs-border, #ececec);
  border-radius: 8px;
  overflow: hidden;
  background: var(--fs-surface, #fff);
  gap: 0;
  box-sizing: border-box;
}

.fsb-header {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-col-header, #fbf6e4);
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 12px 12px 11px;
  min-height: 46px;
  box-sizing: border-box;
}

.fsb-header.is-last {
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsb-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 700;
  color: var(--fs-col-header-text, #7a5c00);
  letter-spacing: 0.06em;
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
  padding: 12px 14px 14px;
  background: var(--fs-col-body, #fffcf6);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  box-sizing: border-box;
}

.fsb-cell.is-last {
  box-shadow: none;
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
  color: var(--fs-body-text, #3c4043);
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
  padding: 10px 8px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--fs-footer, #f6f4ef);
  box-shadow:
    inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1)),
    inset 0 1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsb-footer.is-last {
  box-shadow: inset 0 1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsb-footer span {
  font-size: clamp(12px, 1.15vw, 13px);
  font-weight: 600;
  color: var(--fs-footer-text, #6b6458);
  letter-spacing: 0.08em;
  text-align: center;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

@media (max-width: 900px) {
  .fsb-canvas {
    overflow: auto;
    padding: 8px;
  }

  .fsb-table {
    min-width: 900px;
    min-height: 560px;
  }
}
</style>
