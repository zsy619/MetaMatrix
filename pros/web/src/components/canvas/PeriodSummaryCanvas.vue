<script setup lang="ts">
import { computed } from 'vue'
import type { PeriodSummaryDocumentJSON } from '../../types/canvas'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

const props = defineProps<{
  doc: PeriodSummaryDocumentJSON
}>()

const bgColor = computed(
  () => props.doc.theme.background.color || '#ffffff',
)

const fallbackTitle = computed(() => {
  switch (props.doc.type) {
    case 'weekly_summary':
      return '个人周工作总结模板'
    case 'monthly_summary':
      return '个人月工作总结模板'
    case 'quarterly_summary':
      return '个人季工作总结模板'
    default:
      return '个人工作总结模板'
  }
})
</script>

<template>
  <div class="as-canvas" :style="{ backgroundColor: bgColor }">
    <div class="as-scroll">
      <header class="as-header">
        <h1 class="as-title">{{ doc.title || fallbackTitle }}</h1>
      </header>

      <section
        v-for="(b, index) in doc.blocks"
        :key="b.id"
        class="as-section tbl-tone"
        :style="toneVars(index)"
      >
        <h2 class="as-section-title">{{ b.title }}</h2>
        <p v-if="b.prompt" class="as-hint">{{ b.prompt }}</p>
        <div class="as-panel">
          <YModelBlockCard :block="b" hide-title />
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
  margin-bottom: 28px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--tbl-body, #fafafa);
}

.as-section-title {
  margin: 0;
  padding: 10px 16px;
  font-size: clamp(18px, 1.8vw, 22px);
  font-weight: 800;
  color: #fff;
  line-height: 1.35;
  background: var(--tbl-header, #0e8a84);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
}

.as-hint {
  margin: 12px 16px;
  padding-left: 12px;
  border-left: 2px solid var(--tbl-topic, #dadce0);
  font-size: 13px;
  font-style: italic;
  line-height: 1.55;
  color: var(--tbl-topic, #5f6368);
}

.as-panel {
  min-height: 400px;
  margin: 0 12px 12px;
  border: 1px solid color-mix(in srgb, var(--tbl-topic, #e8eaed) 28%, transparent);
  border-radius: 4px;
  background: transparent;
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
