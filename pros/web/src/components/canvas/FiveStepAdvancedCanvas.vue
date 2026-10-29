<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepAdvancedBlock,
  FiveStepAdvancedBlockId,
  FiveStepAdvancedDocumentJSON,
  FiveStepAdvancedSection,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: FiveStepAdvancedDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepAdvancedBlockId, FiveStepAdvancedBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: FiveStepAdvancedBlockId): FiveStepAdvancedBlock | undefined {
  return byId.value.get(id)
}

function sectionToneClass(section: FiveStepAdvancedSection): string {
  return section.tone === 'negate' ? 'is-negate' : 'is-normal'
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div
    class="fsa-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="五步法（提高版）"
  >
    <div class="fsa-grid" role="table" aria-label="五步法（提高版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsa-col"
        :class="{ 'is-split': col.sections.length > 1 }"
        role="cell"
      >
        <header class="fsa-header" role="columnheader">
          <h2>{{ col.header }}</h2>
        </header>

        <div class="fsa-body">
          <div
            v-for="(section, sIdx) in col.sections"
            :key="section.blockId"
            class="fsa-section"
            :class="[
              sectionToneClass(section),
              { 'has-divider': sIdx < col.sections.length - 1 },
            ]"
          >
            <div
              class="fsa-section-label"
              :class="sectionToneClass(section)"
            >
              {{ section.label }}
            </div>
            <div class="fsa-section-rte">
              <YModelBlockCard
                v-if="block(section.blockId)"
                :block="block(section.blockId)!"
                hide-title
              />
            </div>
          </div>
        </div>

        <footer class="fsa-footer">
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fsa-canvas {
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

.fsa-grid {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  gap: 0;
  box-sizing: border-box;
}

.fsa-col {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #9aa0a6;
}

.fsa-col:last-child {
  border-right: none;
}

.fsa-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffff00;
  border-bottom: 1px solid #9aa0a6;
  padding: 10px 10px;
  min-height: 42px;
  box-sizing: border-box;
}

.fsa-header h2 {
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

.fsa-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: #fff;
}

.fsa-col.is-split .fsa-section {
  flex: 1 1 0;
  min-height: 0;
}

.fsa-col:not(.is-split) .fsa-section {
  flex: 1 1 auto;
  min-height: 0;
}

.fsa-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 10px 12px 12px;
  gap: 4px;
  box-sizing: border-box;
}

.fsa-section.has-divider {
  border-bottom: 1px solid #9aa0a6;
}

.fsa-section-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsa-section-label.is-normal {
  color: #202124;
}

.fsa-section-label.is-negate {
  color: #d93025;
}

.fsa-section-rte {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fsa-section-rte :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent;
  box-shadow: none;
  border: none;
  border-radius: 0;
}

.fsa-section-rte :deep(.ym-block.selected),
.fsa-section-rte :deep(.ym-block.is-source-max) {
  background: transparent;
  box-shadow: none;
  border: none;
}

.fsa-section-rte :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  padding: 0;
  opacity: 0.7;
}

.fsa-section-rte :deep(.ym-block-body) {
  padding: 0;
}

.fsa-section-rte :deep(.rte-root) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  height: 100%;
}

.fsa-section-rte :deep(.rte-canvas) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

.fsa-section-rte :deep(.rte-body),
.fsa-section-rte :deep(.ym-rte),
.fsa-section-rte :deep(.ProseMirror) {
  min-height: 100%;
  font-size: 14px;
  line-height: 1.55;
  color: #202124;
}

.fsa-section-rte :deep(.rte-toolbar) {
  padding-right: 28px;
}

.fsa-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 6px;
  min-height: 38px;
  box-sizing: border-box;
  background: #f1f3f4;
  border-top: 1px solid #9aa0a6;
}

.fsa-footer span {
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
  .fsa-canvas {
    overflow: auto;
  }

  .fsa-grid {
    min-width: 900px;
    min-height: 560px;
  }
}
</style>
