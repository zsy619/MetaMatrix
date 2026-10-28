<script setup lang="ts">
import { computed } from 'vue'
import type {
  RoiTradeoffBlock,
  RoiTradeoffBlockId,
  RoiTradeoffDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: RoiTradeoffDocumentJSON
}>()

const bgColor = computed(
  () => props.doc.theme.background.color || '#FDF5E6',
)

const byId = computed(() => {
  const map = new Map<RoiTradeoffBlockId, RoiTradeoffBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: RoiTradeoffBlockId): RoiTradeoffBlock | undefined {
  return byId.value.get(id)
}
</script>

<template>
  <div class="roi-canvas" :style="{ backgroundColor: bgColor }" role="grid" aria-label="综合决策ROI权衡">
    <section class="roi-col" v-show="block('benefits')">
      <header class="roi-col-head">
        <h2 class="roi-col-title">{{ block('benefits')!.title }}</h2>
      </header>
      <div class="roi-panel">
        <YModelBlockCard :block="block('benefits')!" hide-title />
      </div>
    </section>

    <section class="roi-col" v-show="block('costs')">
      <header class="roi-col-head">
        <h2 class="roi-col-title">{{ block('costs')!.title }}</h2>
      </header>
      <div class="roi-panel">
        <YModelBlockCard :block="block('costs')!" hide-title />
      </div>
    </section>
  </div>
</template>

<style scoped>
.roi-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  background: #FDF5E6;
  border: 1px solid #e8e0d0;
  border-radius: 2px;
}

.roi-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #FDF5E6;
  border-right: 1px solid #ffffff;
}

.roi-col:last-child {
  border-right: none;
}

.roi-col-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 48px;
  padding: 10px 16px;
  box-sizing: border-box;
  background: #FFEB3B;
  border-bottom: 1px solid #ffffff;
}

.roi-col-title {
  margin: 0;
  font-size: clamp(16px, 1.7vw, 20px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
  text-align: left;
}

.roi-panel {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  background: #FDF5E6;
  padding: 10px 12px 8px;
  box-sizing: border-box;
  overflow: auto;
}

.roi-panel :deep(.ym-block) {
  flex: 1;
  min-height: 400px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.roi-panel :deep(.ProseMirror) {
  text-align: left;
  font-size: 14px;
  line-height: 1.65;
  color: #202124;
}

.roi-panel :deep(.ProseMirror p) {
  margin: 0.35em 0;
}
</style>
