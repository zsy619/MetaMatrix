<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepDivisionBlock,
  FiveStepDivisionBlockId,
  FiveStepDivisionDocumentJSON,
  FiveStepDivisionRowId,
} from '../../types/canvas'
import divisionTemplate from '../../templates/five-step-division-v1.json'
import FiveStepPanel from './FiveStepPanel.vue'
import FiveStepNotes from './FiveStepNotes.vue'
import { canvasChromeStyle } from './canvasChrome'
import {
  DIVISION_RAIL,
  fiveStepPalette,
  resolveMethodFooter,
} from './fiveStepPalette'

const TOPIC_PLACEHOLDER: Record<FiveStepDivisionRowId, string> = {
  qualitative: '取舍',
  quantitative: '测量',
  team: '分工',
}

const props = defineProps<{
  doc: FiveStepDivisionDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepDivisionBlockId, FiveStepDivisionBlock>()
  for (const block of props.doc.blocks) map.set(block.id, block)
  return map
})

function blockId(colId: string, rowId: FiveStepDivisionRowId): FiveStepDivisionBlockId {
  return `${colId}_${rowId}` as FiveStepDivisionBlockId
}

function block(
  colId: string,
  rowId: FiveStepDivisionRowId,
): FiveStepDivisionBlock | undefined {
  return byId.value.get(blockId(colId, rowId))
}

function railStyle(rowId: string): { background: string; color: string } {
  return (
    DIVISION_RAIL[rowId as keyof typeof DIVISION_RAIL] ?? {
      background: '#F6EBD4',
      color: '#3C3424',
    }
  )
}

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (divisionTemplate as FiveStepDivisionDocumentJSON).footer,
  ),
)
</script>

<template>
  <div class="fsd-canvas" :style="chrome" aria-label="五步法（分工版）">
    <div class="fsd-table" role="table" aria-label="五步法（分工版）">
      <div class="fsd-corner" aria-hidden="true" />
      <header
        v-for="col in doc.columns"
        :key="`h-${col.id}`"
        class="fsd-head"
        role="columnheader"
        :style="{ background: fiveStepPalette(col.id).header }"
      >
        <h2>{{ col.header }}</h2>
      </header>

      <template v-for="row in doc.rows" :key="row.id">
        <div
          class="fsd-rail"
          role="rowheader"
          :style="{
            background: railStyle(row.id).background,
            color: railStyle(row.id).color,
          }"
        >
          <span>{{ row.label }}</span>
        </div>
        <div
          v-for="col in doc.columns"
          :key="`${col.id}_${row.id}`"
          class="fsd-cell"
          role="cell"
        >
          <FiveStepPanel
            v-if="block(col.id, row.id)"
            chrome="fill"
            density="compact"
            :block="block(col.id, row.id)!"
            :header="`${col.header} · ${row.label}`"
            :palette="fiveStepPalette(col.id)"
            :topic-placeholder="TOPIC_PLACEHOLDER[row.id]"
          />
        </div>
      </template>

      <div class="fsd-foot-corner" aria-hidden="true" />
      <footer
        v-for="col in doc.columns"
        :key="`f-${col.id}`"
        class="fsd-foot"
        :style="{ color: fiveStepPalette(col.id).topic }"
      >
        <span>{{ col.footerLabel }}</span>
      </footer>
    </div>

    <FiveStepNotes :lead="notes.lead" :reminders="notes.reminders" />
  </div>
</template>

<style scoped>
.fsd-canvas {
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

.fsd-table {
  flex: 1 1 auto;
  width: 100%;
  min-height: 640px;
  display: grid;
  grid-template-columns: 68px repeat(5, minmax(0, 1fr));
  grid-template-rows: auto repeat(3, minmax(140px, 1fr)) auto;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  box-sizing: border-box;
  overflow: visible;
}

.fsd-corner,
.fsd-head,
.fsd-rail,
.fsd-cell,
.fsd-foot,
.fsd-foot-corner {
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  box-shadow:
    inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08)),
    inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsd-head:nth-child(6),
.fsd-cell:nth-child(6n),
.fsd-foot:nth-child(6n) {
  box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsd-foot,
.fsd-foot-corner {
  box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsd-foot:last-child {
  box-shadow: none;
}

.fsd-corner {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--cv-page, #f7f7f7);
}

.fsd-head {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 8px;
}

.fsd-head h2 {
  margin: 0;
  font-size: clamp(13px, 1.3vw, 16px);
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
}

.fsd-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}

.fsd-rail span {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.18em;
  line-height: 1;
}

.fsd-cell {
  display: flex;
  background: #fff;
}

.fsd-foot,
.fsd-foot-corner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 4px;
  background: #fafafa;
  font-size: clamp(12px, 1.1vw, 14px);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
}

@media (max-width: 900px) {
  .fsd-canvas {
    padding: 8px;
  }

  .fsd-table {
    min-width: 820px;
    grid-template-columns: 44px repeat(5, minmax(0, 1fr));
  }

  .fsd-rail span {
    font-size: 12px;
    letter-spacing: 0.08em;
  }
}
</style>
