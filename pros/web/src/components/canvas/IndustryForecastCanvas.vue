<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  IndustryForecastBlock,
  IndustryForecastBlockId,
  IndustryForecastDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: IndustryForecastDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<IndustryForecastBlockId, IndustryForecastBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: IndustryForecastBlockId): IndustryForecastBlock | undefined {
  return byId.value.get(id)
}

const topIds: IndustryForecastBlockId[] = ['chain', 'changes', 'steady_b']
const fullIds: IndustryForecastBlockId[] = ['cycle', 'ceiling', 'concentration']

const chrome = computed(() => canvasChromeStyle(props.doc.theme))
</script>

<template>
  <div class="industry-forecast-canvas" :style="chrome">
    <header class="if-header">
      <h1>{{ doc.title }}</h1>
    </header>

    <div class="if-grid" role="table" aria-label="行业预判分析框架">
      <div class="if-row if-row--top">
        <section
          v-for="(id, index) in topIds"
          :key="id"
          v-show="block(id)"
          class="if-cell tbl-tone"
          :style="toneVars(index)"
        >
          <div class="if-meta">
            <h2 class="if-title">
              <span class="if-num">{{ block(id)!.number }}.</span>
              {{ block(id)!.title }}
            </h2>
            <p class="if-subtitle">{{ block(id)!.subtitle }}</p>
          </div>
          <div class="if-body">
            <YModelBlockCard :block="block(id)!" hide-title />
          </div>
        </section>
      </div>

      <section
        v-for="(id, index) in fullIds"
        :key="id"
        v-show="block(id)"
        class="if-cell if-cell--full tbl-tone"
        :style="toneVars(index + topIds.length)"
      >
        <div class="if-meta">
          <h2 class="if-title">
            <span class="if-num">{{ block(id)!.number }}.</span>
            {{ block(id)!.title }}
          </h2>
          <p class="if-subtitle">{{ block(id)!.subtitle }}</p>
        </div>
        <div class="if-body">
          <YModelBlockCard :block="block(id)!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.industry-forecast-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  /* Page scrolls when stacked panels (each ≥400px) exceed the viewport */
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  scrollbar-gutter: stable;
}

.industry-forecast-canvas::-webkit-scrollbar {
  width: 8px;
}

.industry-forecast-canvas::-webkit-scrollbar-thumb {
  background: rgba(60, 50, 20, 0.28);
  border-radius: 999px;
}

.if-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px 10px;
  background: transparent;
}

.if-header h1 {
  margin: 0;
  font-size: clamp(18px, 2vw, 22px);
  font-weight: 750;
  color: var(--cv-ink-strong, #202124);
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.if-grid {
  /* Fill viewport when space allows; never shrink below panel min-heights */
  flex: 1 0 auto;
  width: 100%;
  min-height: min-content;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cv-frame, #ececec);
  overflow: visible;
  background: #fff;
}

.if-row--top {
  flex: 1.2 0 400px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 400px;
  box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.if-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 400px;
  padding: 0;
  box-sizing: border-box;
  background: var(--tbl-body, #fff);
  box-shadow: inset -1px 0 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
  gap: 0;
}

.if-row--top .if-cell:last-child {
  box-shadow: none;
}

.if-cell--full {
  flex: 0.85 0 400px;
  min-height: 400px;
  box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.if-cell--full:last-child {
  box-shadow: none;
}

.if-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 10px 14px 8px;
  background: var(--tbl-header, #0e8a84);
  color: #fff;
}

.if-title {
  margin: 0;
  font-size: clamp(15px, 1.55vw, 19px);
  font-weight: 800;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.if-num {
  color: #fff;
  margin-right: 2px;
}

.if-subtitle {
  margin: 0;
  font-size: clamp(12px, 1.15vw, 14px);
  font-weight: 400;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  line-height: 1.4;
}

.if-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  background: var(--tbl-body, #fff);
}

.if-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

@media (max-width: 720px) {
  .if-row--top {
    flex: none;
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .if-cell {
    box-shadow: inset 0 -1px 0 var(--cv-hairline, rgba(60, 50, 20, 0.08));
    min-height: 400px;
  }

  .if-cell--full {
    flex: none;
    min-height: 400px;
  }

  .if-cell:last-child,
  .if-cell--full:last-child {
    box-shadow: none;
  }
}
</style>
