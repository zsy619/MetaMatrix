<script setup lang="ts">
/**
 * 样式区块（schema 的 style 段）：调色板、背景色、字号、动画。
 */
import { computed } from 'vue'
import ChartFieldRow from './ChartFieldRow.vue'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const fields = computed(
  () => props.panel.schema.sections.find((section) => section.id === 'style')?.fields || [],
)
</script>

<template>
  <div v-if="fields.length" class="rte-cp-section">
    <h4 class="rte-cp-section-title">样式</h4>
    <ChartFieldRow
      v-for="field in fields"
      :key="field.path"
      :field="field"
      :value="props.panel.fieldValue('option', field)"
      @update="(value) => props.panel.setFieldValue('option', field, value)"
    />
  </div>
</template>
