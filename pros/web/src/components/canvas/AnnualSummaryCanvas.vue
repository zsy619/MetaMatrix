<script setup lang="ts">
import { computed } from 'vue'
import type {
  AnnualSummaryBlock,
  AnnualSummaryBlockId,
  AnnualSummaryDocumentJSON,
} from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: AnnualSummaryDocumentJSON
}>()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const byId = computed(() => {
  const map = new Map<AnnualSummaryBlockId, AnnualSummaryBlock>()
  for (const b of props.doc.blocks) map.set(b.id, b)
  return map
})

function block(id: AnnualSummaryBlockId): AnnualSummaryBlock | undefined {
  return byId.value.get(id)
}

const SECTIONS: {
  id: AnnualSummaryBlockId
  hintKey: 'businessHint' | 'growthHint' | 'improveHint'
}[] = [
  { id: 'business_progress', hintKey: 'businessHint' },
  { id: 'personal_growth', hintKey: 'growthHint' },
  { id: 'improvement', hintKey: 'improveHint' },
]
</script>

<template>
  <div class="as-canvas" :style="{ backgroundColor: bgColor }">
    <div class="as-scroll">
      <header class="as-header">
        <h1 class="as-title">{{ doc.title || '个人年工作总结模板' }}</h1>
      </header>

      <section
        v-for="sec in SECTIONS"
        :key="sec.id"
        class="as-section"
        v-show="block(sec.id)"
      >
        <h2 class="as-section-title">{{ block(sec.id)!.title }}</h2>
        <p class="as-hint">
          {{ block(sec.id)!.prompt || doc.labels[sec.hintKey] }}
        </p>
        <div class="as-panel">
          <YModelBlockCard :block="block(sec.id)!" hide-title />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.as-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 2px;
}

.as-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 32px 40px 56px;
  box-sizing: border-box;
}

.as-header {
  margin-bottom: 36px;
}

.as-title {
  margin: 0;
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.01em;
  line-height: 1.35;
}

.as-section {
  margin-bottom: 48px;
}

.as-section-title {
  margin: 0 0 10px;
  font-size: clamp(18px, 1.8vw, 22px);
  font-weight: 800;
  color: #202124;
  line-height: 1.35;
}

.as-hint {
  margin: 0 0 14px;
  padding-left: 12px;
  border-left: 2px solid #dadce0;
  font-size: 13px;
  font-style: italic;
  line-height: 1.55;
  color: #9aa0a6;
}

.as-panel {
  min-height: 400px;
  border: 1px solid #e8eaed;
  border-radius: 4px;
  background: #fafafa;
  padding: 4px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.as-panel :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}
</style>
