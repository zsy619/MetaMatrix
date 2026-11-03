<script setup lang="ts">
/**
 * 通用区块：标题、副标题、图例、提示等（schema 的 general 段）。
 */
import { computed } from 'vue'
import ChartFieldRow from './ChartFieldRow.vue'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const fields = computed(
  () => props.panel.schema.sections.find((section) => section.id === 'general')?.fields || [],
)
</script>

<template>
  <div class="rte-cp-section">
    <h4 class="rte-cp-section-title">通用</h4>
    <ChartFieldRow
      v-for="field in fields"
      :key="field.path"
      :field="field"
      :value="props.panel.fieldValue('option', field)"
      @update="(value) => props.panel.setFieldValue('option', field, value)"
    />
  </div>
</template>
