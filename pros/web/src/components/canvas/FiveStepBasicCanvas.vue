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
      <section v-for="col in doc.columns" :key="col.id" class="fsb-col">
        <div class="fsb-cell" role="cell">
          <FiveStepPanel
            v-if="block(col.id)"
            :block="block(col.id)!"
            :header="col.header"
            :palette="fiveStepPalette(col.id)"
            :topic-placeholder="block(col.id)!.title || '主题'"
          />
        </div>
        <footer
          class="fsb-foot"
          :style="{
            color: fiveStepPalette(col.id).topic,
            background: fiveStepPalette(col.id).body,
          }"
        >
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
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
  border-radius: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.fsb-col { display: contents; }

.fsb-cell,
.fsb-foot {
  min-width: 0;
  box-sizing: border-box;
  box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsb-col:last-child .fsb-cell,
.fsb-col:last-child .fsb-foot { box-shadow: none; }

.fsb-cell { grid-row: 1; display: flex; min-height: 0; }

.fsb-foot {
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 6px;
  border-top: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.35;
}

@media (max-width: 900px) {
  .fsb-canvas { padding: 12px; }
  .fsb-table {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 12px;
    min-height: max-content;
    background: transparent;
    border: 0;
    box-shadow: none;
    overflow: visible;
  }
  .fsb-col {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 300px;
    background: #fff;
    border: 1px solid var(--cv-frame, #ececec);
    border-radius: 16px;
    overflow: hidden;
  }
  .fsb-cell { min-height: 220px; flex: 1 1 auto; box-shadow: none; }
  .fsb-foot { box-shadow: none; }
}
</style>
