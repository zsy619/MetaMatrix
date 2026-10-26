<script setup lang="ts">
import { computed } from 'vue'
import type {
  DualTriangleBlock,
  DualTriangleBlockId,
  DualTriangleDocumentJSON,
} from '../../types/canvas'
import DualTriangleBlockCard from './DualTriangleBlock.vue'
import DualTriangleCenter from './DualTriangleCenter.vue'

const props = defineProps<{
  doc: DualTriangleDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<DualTriangleBlockId, DualTriangleBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: DualTriangleBlockId): DualTriangleBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#f5f5f4',
)
</script>

<template>
  <div class="dual-triangle-canvas" :style="{ backgroundColor: bgColor }">
    <div class="dt-grid">
      <div class="cell cell-innovation">
        <DualTriangleBlockCard
          v-if="block('innovation')"
          :block="block('innovation')!"
        />
      </div>
      <div class="cell cell-center">
        <DualTriangleCenter :center="doc.center" :blocks="doc.blocks" />
      </div>
      <div class="cell cell-scenario">
        <DualTriangleBlockCard
          v-if="block('scenario')"
          :block="block('scenario')!"
        />
      </div>
      <div class="cell cell-aesthetics">
        <DualTriangleBlockCard
          v-if="block('aesthetics')"
          :block="block('aesthetics')!"
        />
      </div>
      <div class="cell cell-system">
        <DualTriangleBlockCard
          v-if="block('system')"
          :block="block('system')!"
        />
      </div>
      <div class="cell cell-basics">
        <DualTriangleBlockCard
          v-if="block('basics')"
          :block="block('basics')!"
        />
      </div>
      <div class="cell cell-data">
        <DualTriangleBlockCard v-if="block('data')" :block="block('data')!" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dual-triangle-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 12px;
}

/**
 * 对齐参考图：
 * [创新]              [场景]
 *        [双三角]
 * [审美] [体系][基本功] [数据]
 */
.dt-grid {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
  grid-template-areas:
    'innovation center center scenario'
    'aesthetics system basics  data';
  gap: 10px;
}

.cell {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cell-innovation {
  grid-area: innovation;
}

.cell-scenario {
  grid-area: scenario;
}

.cell-center {
  grid-area: center;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.cell-aesthetics {
  grid-area: aesthetics;
}

.cell-system {
  grid-area: system;
}

.cell-basics {
  grid-area: basics;
}

.cell-data {
  grid-area: data;
}

@media (max-width: 960px) {
  .dt-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows:
      minmax(0, 0.85fr) minmax(200px, 1.15fr) minmax(0, 0.85fr) minmax(0, 0.85fr);
    grid-template-areas:
      'innovation scenario'
      'center center'
      'aesthetics data'
      'system basics';
    gap: 8px;
  }

  .dual-triangle-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }
}
</style>
