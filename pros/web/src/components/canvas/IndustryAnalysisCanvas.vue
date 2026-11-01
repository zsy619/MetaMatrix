<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  IndustryAnalysisBlock,
  IndustryAnalysisBlockId,
  IndustryAnalysisDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: IndustryAnalysisDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<IndustryAnalysisBlockId, IndustryAnalysisBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: IndustryAnalysisBlockId): IndustryAnalysisBlock | undefined {
  return byId.value.get(id)
}

const topIds: IndustryAnalysisBlockId[] = ['chain', 'changes', 'steady_b']
const fullIds: IndustryAnalysisBlockId[] = ['cycle', 'ceiling', 'concentration']

const chrome = computed(() => canvasChromeStyle(props.doc.theme))
</script>

<template>
  <div class="industry-analysis-canvas" :style="chrome">
    <div class="ia-grid" role="table" aria-label="行业分析画布">
      <div class="ia-row ia-row--top">
        <section
          v-for="(id, index) in topIds"
          :key="id"
          v-show="block(id)"
          class="ia-cell tbl-tone"
          :style="toneVars(index)"
        >
          <div class="ia-meta">
            <h2 class="ia-title">{{ block(id)!.title }}</h2>
            <p class="ia-subtitle">{{ block(id)!.subtitle }}</p>
          </div>
          <div class="ia-body">
            <YModelBlockCard :block="block(id)!" hide-title />
          </div>
        </section>
      </div>

      <section
        v-for="(id, index) in fullIds"
        :key="id"
        v-show="block(id)"
        class="ia-cell ia-cell--full tbl-tone"
        :style="toneVars(index + topIds.length)"
      >
        <div class="ia-meta">
          <h2 class="ia-title">{{ block(id)!.title }}</h2>
          <p class="ia-subtitle">{{ block(id)!.subtitle }}</p>
        </div>
        <div class="ia-body">
          <YModelBlockCard :block="block(id)!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.industry-analysis-canvas {
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

.industry-analysis-canvas::-webkit-scrollbar {
  width: 8px;
}

.industry-analysis-canvas::-webkit-scrollbar-thumb {
  background: rgba(32, 33, 36, 0.28);
  border-radius: 999px;
}

.ia-grid {
  /* Fill viewport when space allows; never shrink below panel min-heights */
  flex: 1 0 auto;
  width: 100%;
  min-height: min-content;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
  overflow: visible;
  background: #fff;
}

.ia-row--top {
  flex: 1.2 0 400px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 400px;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.ia-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 400px;
  padding: 0;
  box-sizing: border-box;
  background: var(--tbl-body, #fff);
  border-right: 1px solid var(--cv-frame, #ececec);
  gap: 0;
}

.ia-row--top .ia-cell:last-child {
  border-right: none;
}

.ia-cell--full {
  flex: 0.85 0 400px;
  min-height: 400px;
  border-right: none;
  border-bottom: 1px solid var(--cv-frame, #ececec);
}

.ia-cell--full:last-child {
  border-bottom: none;
}

.ia-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 10px 14px 8px;
  background: var(--tbl-header, #0e8a84);
  color: #fff;
}

.ia-title {
  margin: 0;
  font-size: clamp(15px, 1.55vw, 19px);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.ia-subtitle {
  margin: 0;
  font-size: clamp(12px, 1.15vw, 14px);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
}

.ia-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  background: var(--tbl-body, #fff);
}

.ia-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

@media (max-width: 720px) {
  .ia-row--top {
    flex: none;
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .ia-cell {
    border-right: none;
    border-bottom: 1px solid var(--cv-frame, #ececec);
    min-height: 400px;
  }

  .ia-cell--full {
    flex: none;
    min-height: 400px;
  }

  .ia-cell--full:last-child {
    border-bottom: none;
  }
}
</style>
