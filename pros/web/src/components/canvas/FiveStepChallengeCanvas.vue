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
import {
  FIVE_STEP_CHALLENGE_NEGATE,
  fiveStepCanvasStyle,
  fiveStepColumnStyle,
} from '../../utils/fiveStepTheme'

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

const canvasStyle = computed(() =>
  fiveStepCanvasStyle(props.doc.theme, { negate: FIVE_STEP_CHALLENGE_NEGATE }),
)

function columnStyle(col: FiveStepChallengeDocumentJSON['columns'][number]) {
  return fiveStepColumnStyle(props.doc.theme, col)
}
</script>

<template>
  <div
    class="fsc-canvas"
    :style="canvasStyle"
    aria-label="五步法（挑战版）"
  >
    <div class="fsc-grid" role="table" aria-label="五步法（挑战版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsc-col"
        :class="{ 'is-split': col.sections.length > 1 }"
        :style="columnStyle(col)"
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
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #f7f7f7;
}

.fsc-grid {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid var(--fs-border, #ececec);
  border-radius: 8px;
  overflow: hidden;
  background: var(--fs-surface, #fff);
  gap: 0;
  box-sizing: border-box;
}

.fsc-col {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--fs-col-body, #f7fafc);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsc-col:last-child {
  box-shadow: none;
}

.fsc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-col-header, #e5eef3);
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #3d5a73),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 12px 8px 11px;
  min-height: 46px;
  box-sizing: border-box;
}

.fsc-header h2 {
  margin: 0;
  font-size: clamp(13px, 1.4vw, 17px);
  font-weight: 700;
  color: var(--fs-col-header-text, #2c4456);
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
  background: transparent;
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
  box-shadow: inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsc-section.is-negate {
  box-shadow: inset 3px 0 0 var(--fs-negate, #c47a2a);
}

.fsc-section.is-negate.has-divider {
  box-shadow:
    inset 3px 0 0 var(--fs-negate, #c47a2a),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
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
  color: var(--fs-section, #3c3424);
}

.fsc-section-label.is-negate {
  color: var(--fs-negate, #c47a2a);
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
  color: var(--fs-body-text, #3c4043);
}

.fsc-section-rte :deep(.rte-toolbar) {
  padding-right: 28px;
}

.fsc-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--fs-footer, #f6f4ef);
  box-shadow: inset 0 1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fsc-footer span {
  font-size: clamp(11px, 1.05vw, 13px);
  font-weight: 600;
  color: var(--fs-footer-text, #6b6458);
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.35;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

@media (max-width: 1100px) {
  .fsc-canvas {
    overflow: auto;
    padding: 8px;
  }

  .fsc-grid {
    min-width: 1080px;
    min-height: 560px;
  }
}
</style>
