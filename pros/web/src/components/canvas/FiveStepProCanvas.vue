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

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div
    class="fsp-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="五步法（进阶版）"
  >
    <div class="fsp-grid" role="table" aria-label="五步法（进阶版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsp-col"
        :class="{ 'is-split': col.sections.length > 1 }"
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
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
}

.fsp-grid {
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

.fsp-col {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #9aa0a6;
}

.fsp-col:last-child {
  border-right: none;
}

.fsp-header {
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

.fsp-header h2 {
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

.fsp-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: #fff;
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
  border-bottom: 1px solid #9aa0a6;
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
  color: #202124;
}

.fsp-section-label.is-negate {
  color: #d93025;
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
  color: #202124;
}

.fsp-section-rte :deep(.rte-toolbar) {
  padding-right: 28px;
}

.fsp-footer {
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

.fsp-footer span {
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
  .fsp-canvas {
    overflow: auto;
  }

  .fsp-grid {
    min-width: 900px;
    min-height: 560px;
  }
}
</style>
