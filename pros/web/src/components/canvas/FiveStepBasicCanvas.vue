<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBasicBlock,
  FiveStepBasicBlockId,
  FiveStepBasicDocumentJSON,
} from '../../types/canvas'
import basicTemplate from '../../templates/five-step-basic-v1.json'
import FiveStepPanel from './FiveStepPanel.vue'
import FiveStepNotes from './FiveStepNotes.vue'
import { canvasChromeStyle } from './canvasChrome'
import { fiveStepPalette, resolveMethodFooter } from './fiveStepPalette'

const props = defineProps<{
  doc: FiveStepBasicDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepBasicBlockId, FiveStepBasicBlock>()
  for (const block of props.doc.blocks) map.set(block.id, block)
  return map
})

function block(id: FiveStepBasicBlockId): FiveStepBasicBlock | undefined {
  return byId.value.get(id)
}

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (basicTemplate as FiveStepBasicDocumentJSON).footer,
  ),
)
</script>

<template>
  <div class="fsb-canvas" :style="chrome" aria-label="五步法（基础版）">
    <div class="fsb-table" role="table" aria-label="五步法（基础版）">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsb-cell"
        role="cell"
      >
        <FiveStepPanel
          v-if="block(col.id)"
          :block="block(col.id)!"
          :header="col.header"
          :palette="fiveStepPalette(col.id)"
          :topic-placeholder="block(col.id)!.title || '主题'"
        />
      </section>

      <footer
        v-for="col in doc.columns"
        :key="`f-${col.id}`"
        class="fsb-foot"
        role="cell"
        :style="{
          color: fiveStepPalette(col.id).topic,
          background: fiveStepPalette(col.id).body,
        }"
      >
        <span>{{ col.footerLabel }}</span>
      </footer>
    </div>

    <FiveStepNotes :lead="notes.lead" :reminders="notes.reminders" />
  </div>
</template>

<style scoped>
.fsb-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 12px;
  background: var(--cv-page, #f7f7f7);
  overflow: auto;
  overscroll-behavior: contain;
}

.fsb-table {
  flex: 1 1 auto;
  width: 100%;
  min-height: 480px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-template-rows: minmax(360px, 1fr) auto;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  box-sizing: border-box;
  overflow: visible;
}

.fsb-cell,
.fsb-foot {
  min-width: 0;
  min-height: 0;
  box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsb-cell:nth-child(5),
.fsb-foot:nth-child(10) {
  box-shadow: none;
}

.fsb-cell {
  display: flex;
}

.fsb-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 8px 6px;
  box-sizing: border-box;
  border-top: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  font-size: clamp(12px, 1.2vw, 14px);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
}

@media (max-width: 900px) {
  .fsb-canvas {
    padding: 8px;
  }

  .fsb-table {
    min-width: 760px;
  }
}
</style>
