<script setup lang="ts">
import { computed } from 'vue'
import type {
  IndustryForecastBlock,
  IndustryForecastBlockId,
  IndustryForecastDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

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

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div class="industry-forecast-canvas" :style="{ backgroundColor: bgColor }">
    <header class="if-header">
      <h1>{{ doc.title }}</h1>
    </header>

    <div class="if-grid" role="table" aria-label="行业预判分析框架">
      <div class="if-row if-row--top">
        <section
          v-for="id in topIds"
          :key="id"
          v-show="block(id)"
          class="if-cell"
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
        v-for="id in fullIds"
        :key="id"
        v-show="block(id)"
        class="if-cell if-cell--full"
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
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.if-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  background: #c4a574;
  border-bottom: 2px solid #8d6e4a;
}

.if-header h1 {
  margin: 0;
  font-size: clamp(18px, 2vw, 24px);
  font-weight: 800;
  color: #3e2723;
  letter-spacing: 0.06em;
  line-height: 1.25;
}

.if-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 2px solid #5d4037;
  border-top: none;
  overflow: hidden;
  background: #fff;
}

.if-row--top {
  flex: 1.2 1 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 0;
  border-bottom: 2px solid #5d4037;
}

.if-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px 14px 14px;
  box-sizing: border-box;
  background: #fff;
  border-right: 2px solid #5d4037;
  gap: 6px;
}

.if-row--top .if-cell:last-child {
  border-right: none;
}

.if-cell--full {
  flex: 0.85 1 0;
  border-right: none;
  border-bottom: 2px solid #5d4037;
}

.if-cell--full:last-child {
  border-bottom: none;
}

.if-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.if-title {
  margin: 0;
  font-size: clamp(15px, 1.55vw, 19px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.if-num {
  color: #5d4037;
  margin-right: 2px;
}

.if-subtitle {
  margin: 0;
  font-size: clamp(12px, 1.15vw, 14px);
  font-weight: 400;
  color: #80868b;
  line-height: 1.4;
}

.if-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.if-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

@media (max-width: 720px) {
  .industry-forecast-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .if-row--top {
    flex: none;
    grid-template-columns: 1fr;
  }

  .if-cell {
    border-right: none;
    border-bottom: 2px solid #5d4037;
    min-height: 160px;
  }

  .if-cell--full {
    flex: none;
    min-height: 140px;
  }

  .if-cell--full:last-child {
    border-bottom: none;
  }
}
</style>
