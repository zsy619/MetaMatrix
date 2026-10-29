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
  () => props.doc.theme.background.color || '#ffffff',
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
  grid-template-rows: auto repeat(3, minmax(0, 1fr)) auto;
  align-content: stretch;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  gap: 0;
}

.fsd-corner {
  background: #ffff00;
  border-right: 1px solid #9aa0a6;
  border-bottom: 1px solid #9aa0a6;
  min-height: 42px;
}

.fsd-header {
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

.fsd-header:nth-child(6) {
  border-right: none;
}

.fsd-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
}

.fsd-row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-right: 1px solid #9aa0a6;
  border-bottom: 1px solid #9aa0a6;
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
  background: #fff;
  border-right: 1px solid #9aa0a6;
  border-bottom: 1px solid #9aa0a6;
  padding: 8px 10px 10px;
  box-sizing: border-box;
}

.fsd-cell:nth-child(6n) {
  border-right: none;
}

/* 页脚贴外框底边：去掉页脚底边；数据行保留底边与页脚分隔 */
.fsd-footer-corner,
.fsd-footer {
  border-bottom: none;
}

.fsd-footer:nth-child(6n) {
  border-right: none;
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

.fsd-footer-corner {
  background: #f1f3f4;
  border-right: 1px solid #9aa0a6;
  min-height: 38px;
  box-sizing: border-box;
}

.fsd-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 6px;
  min-height: 38px;
  box-sizing: border-box;
  background: #f1f3f4;
  border-right: 1px solid #9aa0a6;
}

.fsd-footer span {
  font-size: clamp(12px, 1.25vw, 15px);
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
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
