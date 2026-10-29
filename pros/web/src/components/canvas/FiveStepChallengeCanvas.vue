<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type {
  FiveStepChallengeBlock,
  FiveStepChallengeBlockId,
  FiveStepChallengeDocumentJSON,
  FiveStepChallengeSection,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: FiveStepChallengeDocumentJSON
}>()

const documentStore = useDocumentStore()
documentStore.ensureFiveStepChallengeBlocks()
onMounted(() => {
  documentStore.ensureFiveStepChallengeBlocks()
})

const byId = computed(() => {
  const map = new Map<FiveStepChallengeBlockId, FiveStepChallengeBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: FiveStepChallengeBlockId): FiveStepChallengeBlock | undefined {
  return byId.value.get(id)
}

function sectionToneClass(section: FiveStepChallengeSection): string {
  return section.tone === 'negate' ? 'is-negate' : 'is-normal'
}

function hasLabel(section: FiveStepChallengeSection): boolean {
  return !!(section.label && section.label.trim())
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div
    class="fsc-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="五步法（挑战版）"
  >
    <div class="fsc-grid" role="table" aria-label="五步法（挑战版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsc-col"
        :class="{ 'is-split': col.sections.length > 1 }"
        role="cell"
      >
        <header class="fsc-header" role="columnheader">
          <h2>{{ col.header }}</h2>
        </header>

        <div class="fsc-body">
          <div
            v-for="(section, sIdx) in col.sections"
            :key="section.blockId"
            class="fsc-section"
            :class="[
              sectionToneClass(section),
              { 'has-divider': sIdx < col.sections.length - 1 },
              { 'no-label': !hasLabel(section) },
            ]"
          >
            <div
              v-if="hasLabel(section)"
              class="fsc-section-label"
              :class="sectionToneClass(section)"
            >
              {{ section.label }}
            </div>
            <div class="fsc-section-rte">
              <YModelBlockCard
                v-if="block(section.blockId)"
                :block="block(section.blockId)!"
                hide-title
              />
            </div>
          </div>
        </div>

        <footer class="fsc-footer">
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fsc-canvas {
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

.fsc-grid {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  gap: 0;
  box-sizing: border-box;
}

.fsc-col {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #9aa0a6;
}

.fsc-col:last-child {
  border-right: none;
}

.fsc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffff00;
  border-bottom: 1px solid #9aa0a6;
  padding: 10px 8px;
  min-height: 42px;
  box-sizing: border-box;
}

.fsc-header h2 {
  margin: 0;
  font-size: clamp(13px, 1.4vw, 17px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsc-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: #fff;
}

.fsc-col.is-split .fsc-section {
  flex: 1 1 0;
  min-height: 0;
}

.fsc-col:not(.is-split) .fsc-section {
  flex: 1 1 auto;
  min-height: 0;
}

.fsc-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 8px 10px 10px;
  gap: 4px;
  box-sizing: border-box;
}

.fsc-section.has-divider {
  border-bottom: 1px solid #9aa0a6;
}

.fsc-section-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.fsc-section-label.is-normal {
  color: #202124;
}

.fsc-section-label.is-negate {
  color: #ef6c00;
}

.fsc-section-rte {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fsc-section-rte :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent;
  box-shadow: none;
  border: none;
  border-radius: 0;
}

.fsc-section-rte :deep(.ym-block.selected),
.fsc-section-rte :deep(.ym-block.is-source-max) {
  background: transparent;
  box-shadow: none;
  border: none;
}

.fsc-section-rte :deep(.ym-block-toolbar) {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 4;
  padding: 0;
  opacity: 0.7;
}

.fsc-section-rte :deep(.ym-block-body) {
  padding: 0;
}

.fsc-section-rte :deep(.rte-root) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  height: 100%;
}

.fsc-section-rte :deep(.rte-canvas) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

.fsc-section-rte :deep(.rte-body),
.fsc-section-rte :deep(.ym-rte),
.fsc-section-rte :deep(.ProseMirror) {
  min-height: 100%;
  font-size: 13px;
  line-height: 1.5;
  color: #202124;
}

.fsc-section-rte :deep(.rte-toolbar) {
  padding-right: 28px;
}

.fsc-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 4px;
  min-height: 38px;
  box-sizing: border-box;
  background: #f1f3f4;
  border-top: 1px solid #9aa0a6;
}

.fsc-footer span {
  font-size: clamp(11px, 1.1vw, 14px);
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

@media (max-width: 1100px) {
  .fsc-canvas {
    overflow: auto;
  }

  .fsc-grid {
    min-width: 1080px;
    min-height: 560px;
  }
}
</style>
