<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type {
  FiveStepProBlock,
  FiveStepProBlockId,
  FiveStepProDocumentJSON,
  FiveStepProSection,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { fiveStepCanvasStyle, fiveStepColumnStyle } from '../../utils/fiveStepTheme'

const props = defineProps<{
  doc: FiveStepProDocumentJSON
}>()

const documentStore = useDocumentStore()
documentStore.ensureFiveStepProBlocks()
onMounted(() => {
  documentStore.ensureFiveStepProBlocks()
})

const byId = computed(() => {
  const map = new Map<FiveStepProBlockId, FiveStepProBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: FiveStepProBlockId): FiveStepProBlock | undefined {
  return byId.value.get(id)
}

function sectionToneClass(section: FiveStepProSection): string {
  return section.tone === 'negate' ? 'is-negate' : 'is-normal'
}

function hasLabel(section: FiveStepProSection): boolean {
  return !!(section.label && section.label.trim())
}

const canvasStyle = computed(() => fiveStepCanvasStyle(props.doc.theme))

function columnStyle(col: FiveStepProDocumentJSON['columns'][number]) {
  return fiveStepColumnStyle(props.doc.theme, col)
}
</script>

<template>
  <div
    class="fsp-canvas"
    :style="canvasStyle"
    aria-label="五步法（进阶版）"
  >
    <div class="fsp-grid" role="table" aria-label="五步法（进阶版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsp-col"
        :class="{ 'is-split': col.sections.length > 1 }"
        :style="columnStyle(col)"
        role="cell"
      >
        <header class="fsp-header" role="columnheader">
          <h2>{{ col.header }}</h2>
        </header>

        <div class="fsp-body">
          <div
            v-for="(section, sIdx) in col.sections"
            :key="section.blockId"
            class="fsp-section"
            :class="[
              sectionToneClass(section),
              { 'has-divider': sIdx < col.sections.length - 1 },
              { 'no-label': !hasLabel(section) },
            ]"
          >
            <div
              v-if="hasLabel(section)"
              class="fsp-section-label"
              :class="sectionToneClass(section)"
            >
              {{ section.label }}
            </div>
            <div class="fsp-section-rte">
              <YModelBlockCard
                v-if="block(section.blockId)"
                :block="block(section.blockId)!"
                hide-title
              />
            </div>
          </div>
        </div>

        <footer class="fsp-footer">
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fsp-canvas {
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

.fsp-grid {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid var(--fs-border, #ececec);
  border-radius: 8px;
  overflow: hidden;
  background: var(--fs-surface, #fff);
  gap: 0;
  box-sizing: border-box;
}

.fsp-col {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--fs-col-body, #fffcf6);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsp-col:last-child {
  box-shadow: none;
}

.fsp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-col-header, #fbf6e4);
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 12px 12px 11px;
  min-height: 46px;
  box-sizing: border-box;
}

.fsp-header h2 {
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

.fsp-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: transparent;
}

.fsp-col.is-split .fsp-section {
  flex: 1 1 0;
  min-height: 0;
}

.fsp-col:not(.is-split) .fsp-section {
  flex: 1 1 auto;
  min-height: 0;
}

.fsp-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 8px 12px 10px;
  gap: 4px;
  box-sizing: border-box;
}

.fsp-section.has-divider {
  box-shadow: inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsp-section.is-negate {
  box-shadow: inset 3px 0 0 var(--fs-negate, #c4473a);
}

.fsp-section.is-negate.has-divider {
  box-shadow:
    inset 3px 0 0 var(--fs-negate, #c4473a),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsp-section-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsp-section-label.is-normal {
  color: var(--fs-section, #3c3424);
}

.fsp-section-label.is-negate {
  color: var(--fs-negate, #c4473a);
}

.fsp-section-rte {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fsp-section-rte :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent;
  box-shadow: none;
  border: none;
  border-radius: 0;
}

.fsp-section-rte :deep(.ym-block.selected),
.fsp-section-rte :deep(.ym-block.is-source-max) {
  background: transparent;
  box-shadow: none;
  border: none;
}

.fsp-section-rte :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  padding: 0;
  opacity: 0.7;
}

.fsp-section-rte :deep(.ym-block-body) {
  padding: 0;
}

.fsp-section-rte :deep(.rte-root) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  height: 100%;
}

.fsp-section-rte :deep(.rte-canvas) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

.fsp-section-rte :deep(.rte-body),
.fsp-section-rte :deep(.ym-rte),
.fsp-section-rte :deep(.ProseMirror) {
  min-height: 100%;
  font-size: 14px;
  line-height: 1.55;
  color: var(--fs-body-text, #3c4043);
}

.fsp-section-rte :deep(.rte-toolbar) {
  padding-right: 28px;
}

.fsp-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--fs-footer, #f6f4ef);
  box-shadow: inset 0 1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsp-footer span {
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
  .fsp-canvas {
    overflow: auto;
    padding: 8px;
  }

  .fsp-grid {
    min-width: 900px;
    min-height: 560px;
  }
}
</style>
