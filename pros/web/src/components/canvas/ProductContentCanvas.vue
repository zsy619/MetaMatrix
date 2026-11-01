<script setup lang="ts">
import { computed } from 'vue'
import type {
  ProductContentBlock,
  ProductContentBlockId,
  ProductContentDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: ProductContentDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<ProductContentBlockId, ProductContentBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: ProductContentBlockId): ProductContentBlock | undefined {
  return byId.value.get(id)
}

const topIds: ProductContentBlockId[] = ['user', 'metrics']
const bottomIds: ProductContentBlockId[] = [
  'add_hypotheses',
  'core_hypotheses',
  'validation',
]

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div class="product-content-canvas" :style="{ backgroundColor: bgColor }">
    <div class="pc-grid" role="table" aria-label="产品内核画布">
      <div class="pc-row pc-row--top">
        <section
          v-for="(id, index) in topIds"
          :key="id"
          v-show="block(id)"
          class="pc-cell tbl-tone"
          :style="toneVars(index)"
        >
          <header class="pc-header">
            <h2>{{ block(id)!.title }}</h2>
          </header>
          <div class="pc-body">
            <p class="pc-prompt">{{ block(id)!.prompt }}</p>
            <div class="pc-items">
              <YModelBlockCard :block="block(id)!" hide-title />
            </div>
          </div>
        </section>
      </div>

      <div class="pc-row pc-row--bottom">
        <section
          v-for="(id, index) in bottomIds"
          :key="id"
          v-show="block(id)"
          class="pc-cell tbl-tone"
          :style="toneVars(index + topIds.length)"
        >
          <header class="pc-header">
            <h2>{{ block(id)!.title }}</h2>
          </header>
          <div class="pc-body">
            <p class="pc-prompt">{{ block(id)!.prompt }}</p>
            <div class="pc-items">
              <YModelBlockCard :block="block(id)!" hide-title />
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-content-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.pc-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
}

.pc-row {
  display: grid;
  min-height: 0;
  min-width: 0;
}

.pc-row--top {
  flex: 0 0 32%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid #9aa0a6;
}

.pc-row--bottom {
  flex: 1 1 68%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pc-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--tbl-body, #fff);
  border-right: 1px solid #9aa0a6;
}

.pc-row--top .pc-cell:last-child,
.pc-row--bottom .pc-cell:last-child {
  border-right: none;
}

.pc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tbl-header, #0e8a84);
  border-bottom: 1px solid #9aa0a6;
  color: #fff;
  padding: 10px 10px;
  min-height: 42px;
  box-sizing: border-box;
}

.pc-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
}

.pc-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  box-sizing: border-box;
}

.pc-prompt {
  flex-shrink: 0;
  margin: 0;
  font-size: clamp(11px, 1.15vw, 13px);
  font-style: italic;
  font-weight: 400;
  color: var(--tbl-topic, #80868b);
  line-height: 1.45;
}

.pc-items {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.pc-items :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

@media (max-width: 720px) {
  .product-content-canvas {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .pc-grid {
    min-height: auto;
  }

  .pc-row--top,
  .pc-row--bottom {
    flex: none;
    grid-template-columns: 1fr;
  }

  .pc-cell {
    border-right: none;
    border-bottom: 1px solid #9aa0a6;
    min-height: 160px;
  }

  .pc-row--bottom .pc-cell:last-child {
    border-bottom: none;
  }
}
</style>
