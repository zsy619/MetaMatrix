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
      <div
        v-for="(row, rowIndex) in doc.rows"
        :key="`rail-${row.id}`"
        class="fsd-rail"
        role="rowheader"
        :data-row="rowIndex"
        :style="{
          background: railStyle(row.id).background,
          color: railStyle(row.id).color,
        }"
      >
        <span>{{ row.label }}</span>
      </div>
      <div class="fsd-foot-corner" aria-hidden="true" />
      <article
        v-for="(col, colIndex) in doc.columns"
        :key="col.id"
        class="fsd-col"
        :style="{ '--c': String(colIndex + 2) }"
      >
        <header class="fsd-head" role="columnheader" :style="{ '--col-header': fiveStepPalette(col.id).header }">
          <h2>{{ col.header }}</h2>
        </header>
        <div v-for="(row, rowIndex) in doc.rows" :key="`${col.id}_${row.id}`" class="fsd-cell" role="cell" :data-row="rowIndex">
          <p class="fsd-row-label" :style="{ color: railStyle(row.id).color }">{{ row.label }}</p>
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
        <footer class="fsd-foot" :style="{ color: fiveStepPalette(col.id).topic }">
          <span>{{ col.footerLabel }}</span>
        </footer>
      </article>
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
  flex: 1 0 auto;
  width: 100%;
  min-height: max(100%, 640px);
  display: grid;
  grid-template-columns: 68px repeat(5, minmax(0, 1fr));
  grid-template-rows: auto repeat(3, minmax(min-content, 1fr)) auto;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(62, 48, 28, 0.08);
  box-sizing: border-box;
  overflow: visible;
}

.fsd-col { display: contents; }

.fsd-corner,
.fsd-head,
.fsd-rail,
.fsd-cell,
.fsd-foot,
.fsd-foot-corner {
  min-width: 0;
  min-height: min-content;
  overflow: visible;
  box-sizing: border-box;
  box-shadow:
    inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08)),
    inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsd-col:last-child .fsd-head,
.fsd-col:last-child .fsd-cell,
.fsd-col:last-child .fsd-foot {
  box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.fsd-corner { grid-column: 1; grid-row: 1; }
.fsd-rail[data-row='0'] { grid-column: 1; grid-row: 2; }
.fsd-rail[data-row='1'] { grid-column: 1; grid-row: 3; }
.fsd-rail[data-row='2'] { grid-column: 1; grid-row: 4; }
.fsd-foot-corner { grid-column: 1; grid-row: 5; box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08)); }
.fsd-head { grid-column: var(--c); grid-row: 1; }
.fsd-cell[data-row='0'] { grid-column: var(--c); grid-row: 2; }
.fsd-cell[data-row='1'] { grid-column: var(--c); grid-row: 3; }
.fsd-cell[data-row='2'] { grid-column: var(--c); grid-row: 4; }
.fsd-foot { grid-column: var(--c); grid-row: 5; }
.fsd-row-label { display: none; margin: 0; }

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
  min-height: 48px;
  padding: 8px 8px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--col-header, #2a649f) 72%, #fff),
    var(--col-header, #2a649f)
  );
}

.fsd-head h2 {
  margin: 0;
  font-size: 16px;
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
  min-height: 44px;
  padding: 8px 4px;
  background: #fafafa;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
}

@media (max-width: 900px) {
  .fsd-canvas { padding: 12px; }
  .fsd-table {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: max-content;
    background: transparent;
    border: 0;
    box-shadow: none;
  }
  .fsd-corner,
  .fsd-foot-corner,
  .fsd-rail { display: none; }
  .fsd-col {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-width: 0;
    background: #fff;
    border: 1px solid var(--cv-frame, #ececec);
    border-radius: 16px;
    overflow: hidden;
  }
  .fsd-head,
  .fsd-cell,
  .fsd-foot {
    grid-column: auto;
    grid-row: auto;
    position: static;
    box-shadow: none;
  }
  .fsd-cell {
    min-height: 200px;
    flex-direction: column;
    border-top: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  }
  .fsd-row-label {
    display: block;
    padding: 8px 12px 0;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
}
</style>
