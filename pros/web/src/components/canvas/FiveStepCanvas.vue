<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBlock,
  FiveStepBlockId,
  FiveStepDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { fiveStepCanvasStyle, fiveStepColumnStyle } from '../../utils/fiveStepTheme'

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

const canvasStyle = computed(() => fiveStepCanvasStyle(props.doc.theme))

function columnStyle(col: FiveStepDocumentJSON['columns'][number]) {
  return fiveStepColumnStyle(props.doc.theme, col)
}
</script>

<template>
  <div class="five-step-canvas" :style="canvasStyle">
    <div class="fs-grid">
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fs-col"
        :style="columnStyle(col)"
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
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  background: #f7f7f7;
}

.fs-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-content: stretch;
  border: 1px solid var(--fs-border, #ececec);
  border-radius: 8px;
  overflow: hidden;
  background: var(--fs-surface, #fff);
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
  background: var(--fs-col-body, #fffcf6);
  box-shadow: inset -1px 0 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fs-col:last-child {
  box-shadow: none;
}

.fs-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-col-header, #fbf6e4);
  box-shadow:
    inset 3px 0 0 var(--fs-col-accent, #a67c00),
    inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
  padding: 12px 12px 11px;
  min-height: 46px;
  box-sizing: border-box;
}

.fs-header h2 {
  margin: 0;
  font-size: clamp(14px, 1.55vw, 18px);
  font-weight: 700;
  color: var(--fs-col-header-text, #7a5c00);
  letter-spacing: 0.06em;
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
  background: transparent;
  box-shadow: inset 0 -1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fs-quant {
  background: var(--fs-quant, #f4f7f8);
}

.fs-section-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 650;
  color: var(--fs-section, #3c3424);
  opacity: 0.62;
  letter-spacing: 0.08em;
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

.fs-qual-blocks :deep(.ym-block),
.fs-quant :deep(.ym-block) {
  border-color: rgba(60, 50, 20, 0.16);
  background: rgba(255, 255, 255, 0.62);
}

.fs-quant :deep(.ym-block) {
  flex: 1;
  min-height: 0;
}

.fs-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--fs-footer, #f6f4ef);
  box-shadow: inset 0 1px 0 var(--fs-divider, rgba(60, 50, 20, 0.1));
}

.fs-footer span {
  font-size: clamp(12px, 1.15vw, 13px);
  font-weight: 600;
  color: var(--fs-footer-text, #6b6458);
  letter-spacing: 0.08em;
  text-align: center;
  line-height: 1.35;
}

@media (max-width: 900px) {
  .five-step-canvas {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px;
  }

  .fs-grid {
    min-width: 880px;
  }
}
</style>
