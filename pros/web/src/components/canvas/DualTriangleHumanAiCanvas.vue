<script setup lang="ts">
import { computed } from 'vue'
import type {
  DualTriangleBlock,
  DualTriangleBlockId,
  DualTriangleDocumentJSON,
} from '../../types/canvas'
import DualTriangleBlockCard from './DualTriangleBlock.vue'

const props = defineProps<{
  doc: DualTriangleDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<DualTriangleBlockId, DualTriangleBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: DualTriangleBlockId): DualTriangleBlock | undefined {
  return byId.value.get(id)
}

/** 附图列序：人类三角 审美 | 体系 | 创造力；AI 三角 场景 | 数据 | 基本功 */
const humanCols: DualTriangleBlockId[] = ['aesthetics', 'system', 'innovation']
const aiCols: DualTriangleBlockId[] = ['scenario', 'data', 'basics']
</script>

<template>
  <div class="hai-canvas">
    <div class="hai-table" role="table" aria-label="人类三角与 AI 三角">
      <div class="hai-rail" role="rowheader">
        <span class="hai-rail-label">{{ doc.center.humanTitle || '人类三角' }}</span>
      </div>
      <div v-for="id in humanCols" :key="id" class="hai-cell" role="cell">
        <DualTriangleBlockCard v-if="block(id)" variant="table" :block="block(id)!" />
      </div>

      <div class="hai-rail" role="rowheader">
        <span class="hai-rail-label">{{ doc.center.aiTitle || 'AI三角' }}</span>
      </div>
      <div v-for="id in aiCols" :key="id" class="hai-cell" role="cell">
        <DualTriangleBlockCard v-if="block(id)" variant="table" :block="block(id)!" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hai-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  padding: 18px 20px 16px;
  background: #ffffff;
  overflow: auto;
}

.hai-table {
  width: 100%;
  height: 100%;
  min-height: 420px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid #e4e4e4;
  background: #fff;
  box-sizing: border-box;
}

.hai-rail,
.hai-cell {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid #e8e8e8;
  border-bottom: 1px solid #e8e8e8;
  box-sizing: border-box;
}

.hai-table > :nth-child(4n) {
  border-right: none;
}

.hai-table > :nth-child(n + 5) {
  border-bottom: none;
}

.hai-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff6d4;
}

.hai-rail-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.32em;
  color: #202124;
  line-height: 1;
}

.hai-cell {
  background: #fff;
  overflow: hidden;
}

@media (max-width: 840px) {
  .hai-canvas {
    padding: 10px;
  }

  .hai-table {
    grid-template-columns: 48px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
    min-height: 640px;
  }

  .hai-rail-label {
    font-size: 13px;
    letter-spacing: 0.2em;
  }
}
</style>
