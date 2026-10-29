<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBlock,
  FiveStepBlockId,
  FiveStepDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: FiveStepDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepBlockId, FiveStepBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: FiveStepBlockId): FiveStepBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)
</script>

<template>
  <div class="five-step-canvas" :style="{ backgroundColor: bgColor }">
    <div class="fs-grid">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fs-col"
      >
        <header class="fs-header">
          <h2>{{ col.header }}</h2>
        </header>

        <div class="fs-qual">
          <div class="fs-section-label">定性</div>
          <div class="fs-qual-blocks">
            <template v-for="bid in col.qualitativeBlockIds" :key="bid">
              <YModelBlockCard
                v-if="block(bid)"
                :block="block(bid)!"
              />
            </template>
          </div>
        </div>

        <div class="fs-quant">
          <div class="fs-section-label">定量</div>
          <YModelBlockCard
            v-if="block(col.quantitativeBlockId)"
            :block="block(col.quantitativeBlockId)!"
            hide-title
          />
        </div>

        <footer class="fs-footer">
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.five-step-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.fs-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid #9aa0a6;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  gap: 0;
}

.fs-col {
  display: grid;
  grid-template-rows:
    auto
    minmax(0, 1.45fr)
    minmax(0, 0.72fr)
    auto;
  min-width: 0;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #9aa0a6;
}

.fs-col:last-child {
  border-right: none;
}

.fs-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffff00;
  border-bottom: 1px solid #9aa0a6;
  padding: 10px 10px;
  min-height: 42px;
  box-sizing: border-box;
}

.fs-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-align: center;
}

.fs-qual,
.fs-quant {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: 10px 12px 12px;
  gap: 8px;
  box-sizing: border-box;
}

.fs-qual {
  border-bottom: 1px solid #9aa0a6;
}

.fs-section-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #9aa0a6;
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.fs-qual-blocks {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fs-qual-blocks :deep(.ym-block) {
  flex: 1;
  min-height: 0;
}

.fs-quant :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(248, 249, 250, 0.55);
}

.fs-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 6px;
  min-height: 38px;
  box-sizing: border-box;
  background: #f1f3f4;
  border-top: 1px solid #9aa0a6;
}

.fs-footer span {
  font-size: clamp(12px, 1.25vw, 15px);
  font-weight: 700;
  color: #202124;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.25;
}

@media (max-width: 900px) {
  .five-step-canvas {
    overflow-x: auto;
    overflow-y: hidden;
  }

  .fs-grid {
    min-width: 880px;
  }
}
</style>
