<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  AiTradeoffBlock,
  AiTradeoffCellId,
  AiTradeoffDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: AiTradeoffDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<AiTradeoffCellId, AiTradeoffBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: AiTradeoffCellId): AiTradeoffBlock | undefined {
  return byId.value.get(id)
}

/** 价值侧 / 成本侧 各 4 行，按视觉顺序 */
const rows: [AiTradeoffCellId, AiTradeoffCellId][] = [
  ['a1', 'b1'],
  ['a2', 'b2'],
  ['a3', 'b3'],
  ['a4', 'b4'],
]

const chrome = computed(() => canvasChromeStyle(props.doc.theme))
</script>

<template>
  <div class="ai-tradeoff-canvas" :style="chrome">
    <header class="at-title">
      <h1>{{ doc.title }}</h1>
    </header>

    <div class="at-grid" role="table" aria-label="AI场景取舍评估">
      <div class="at-col-header value" role="columnheader" :style="toneVars(0)">
        {{ doc.columns.value.header }}
      </div>
      <div class="at-col-header cost" role="columnheader" :style="toneVars(1)">
        {{ doc.columns.cost.header }}
      </div>

      <template v-for="([leftId, rightId], rowIdx) in rows" :key="rowIdx">
        <section
          v-if="block(leftId)"
          class="at-cell tbl-tone"
          :class="{ 'at-cell--last-row': rowIdx === rows.length - 1 }"
          :style="toneVars(2 + rowIdx * 2)"
        >
          <div class="at-cell-meta">
            <h2 class="at-cell-title">{{ block(leftId)!.title }}</h2>
            <p class="at-cell-prompt">{{ block(leftId)!.prompt }}</p>
          </div>
          <div class="at-cell-body">
            <YModelBlockCard :block="block(leftId)!" hide-title />
          </div>
        </section>

        <section
          v-if="block(rightId)"
          class="at-cell tbl-tone"
          :class="{ 'at-cell--last-row': rowIdx === rows.length - 1 }"
          :style="toneVars(2 + rowIdx * 2 + 1)"
        >
          <div class="at-cell-meta">
            <h2 class="at-cell-title">{{ block(rightId)!.title }}</h2>
            <p class="at-cell-prompt">{{ block(rightId)!.prompt }}</p>
          </div>
          <div class="at-cell-body">
            <YModelBlockCard :block="block(rightId)!" hide-title />
          </div>
        </section>
      </template>
    </div>

    <footer class="at-footer">
      <span>{{ doc.footerNote }}</span>
    </footer>
  </div>
</template>

<style scoped>
.ai-tradeoff-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  /* Page scrolls when stacked cells (each ≥400px) exceed the viewport */
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 14px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  scrollbar-gutter: stable;
}

.ai-tradeoff-canvas::-webkit-scrollbar {
  width: 8px;
}

.ai-tradeoff-canvas::-webkit-scrollbar-thumb {
  background: rgba(32, 33, 36, 0.28);
  border-radius: 999px;
}

.at-title {
  flex-shrink: 0;
  text-align: center;
  padding: 2px 8px 4px;
}

.at-title h1 {
  margin: 0;
  font-size: clamp(20px, 2.4vw, 28px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.at-grid {
  /* Never shrink content rows below panel min-heights */
  flex: 1 0 auto;
  width: 100%;
  min-height: min-content;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows:
    auto
    repeat(4, minmax(400px, auto));
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 4px;
  overflow: visible;
  background: #fff;
  gap: 0;
}

.at-col-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--tbl-header, #2A649F);
  border-bottom: 1px solid var(--cv-frame, #ececec);
  font-size: clamp(13px, 1.35vw, 16px);
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.35;
}

.at-col-header.value {
  border-right: 1px solid var(--cv-frame, #ececec);
}

.at-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 400px;
  padding: 0;
  box-sizing: border-box;
  background: var(--tbl-body, #fff);
  border-right: 1px solid var(--cv-frame, #ececec);
  border-bottom: 1px solid var(--cv-frame, #ececec);
  gap: 0;
}

.at-cell:nth-child(even) {
  border-right: none;
}

.at-cell--last-row {
  border-bottom: none;
}

.at-cell-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 8px 12px;
  background: var(--tbl-header, #2A649F);
  color: #fff;
}

.at-cell-title {
  margin: 0;
  font-size: clamp(13px, 1.3vw, 15px);
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.02em;
  line-height: 1.3;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
}

.at-cell-prompt {
  margin: 0;
  font-size: clamp(11px, 1.1vw, 13px);
  font-style: italic;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
}

.at-cell-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  background: var(--tbl-body, #fff);
}

.at-cell-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

.at-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 0 4px 2px;
}

.at-footer span {
  font-size: 12px;
  color: #5f6368;
  line-height: 1.4;
}

@media (max-width: 720px) {
  .at-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    min-height: min-content;
  }

  .at-col-header.cost {
    border-top: 1px solid var(--cv-frame, #ececec);
  }

  .at-col-header.value {
    border-right: none;
  }

  .at-cell {
    border-right: none;
    min-height: 400px;
  }

  .at-cell--last-row {
    border-bottom: 1px solid var(--cv-frame, #ececec);
  }

  /* Keep visual order: value header, a1-a4, cost header, b1-b4
     On single column the default DOM order is headerL, headerR, a1,b1,...
     Accept interleaved for narrow screens; still usable. */
}
</style>
