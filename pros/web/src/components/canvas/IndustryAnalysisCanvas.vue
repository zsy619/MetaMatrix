<script setup lang="ts">
import { computed } from 'vue'
import type {
  IndustryAnalysisBlock,
  IndustryAnalysisBlockId,
  IndustryAnalysisDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

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

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div class="industry-analysis-canvas" :style="{ backgroundColor: bgColor }">
    <div class="ia-grid" role="table" aria-label="行业分析画布">
      <div class="ia-row ia-row--top">
        <section
          v-for="id in topIds"
          :key="id"
          v-show="block(id)"
          class="ia-cell"
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
        v-for="id in fullIds"
        :key="id"
        v-show="block(id)"
        class="ia-cell ia-cell--full"
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
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.ia-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 2px solid #202124;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
}

.ia-row--top {
  flex: 1.2 1 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
  border-bottom: 2px solid #202124;
}

.ia-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px 14px 14px;
  box-sizing: border-box;
  background: #fff;
  border-right: 2px solid #202124;
  gap: 6px;
}

.ia-row--top .ia-cell:last-child {
  border-right: none;
}

.ia-cell--full {
  flex: 0.85 1 0;
  border-right: none;
  border-bottom: 2px solid #202124;
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
}

.ia-title {
  margin: 0;
  font-size: clamp(15px, 1.55vw, 19px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.ia-subtitle {
  margin: 0;
  font-size: clamp(12px, 1.15vw, 14px);
  font-weight: 400;
  color: #80868b;
  line-height: 1.4;
}

.ia-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ia-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

@media (max-width: 720px) {
  .industry-analysis-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ia-row--top {
    flex: none;
    grid-template-columns: 1fr;
  }

  .ia-cell {
    border-right: none;
    border-bottom: 2px solid #202124;
    min-height: 160px;
  }

  .ia-cell--full {
    flex: none;
    min-height: 140px;
  }

  .ia-cell--full:last-child {
    border-bottom: none;
  }
}
</style>
