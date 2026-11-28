<script setup lang="ts">
/**
 * 坐标轴区块（schema 的 axis 段）：X 轴与 Y 轴各一份。
 */
import { computed } from 'vue'
import ChartFieldRow from './ChartFieldRow.vue'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const fields = computed(
  () => props.panel.schema.sections.find((section) => section.id === 'axis')?.fields || [],
)
</script>

<template>
  <div v-if="fields.length" class="rte-cp-section">
    <h4 class="rte-cp-section-title">坐标轴</h4>
    <div class="rte-cp-sub">
      <div class="rte-cp-sub-title">横轴</div>
      <ChartFieldRow
        v-for="field in fields"
        :key="'x-' + field.path"
        :field="field"
        :value="props.panel.fieldValue('axis', { ...field, path: 'xAxis.' + field.path })"
        @update="(value) => props.panel.setFieldValue('axis', { ...field, path: 'xAxis.' + field.path }, value)"
      />
    </div>
    <div class="rte-cp-sub">
      <div class="rte-cp-sub-title">纵轴</div>
      <ChartFieldRow
        v-for="field in fields"
        :key="'y-' + field.path"
        :field="field"
        :value="props.panel.fieldValue('axis', { ...field, path: 'yAxis.' + field.path })"
        @update="(value) => props.panel.setFieldValue('axis', { ...field, path: 'yAxis.' + field.path }, value)"
      />
    </div>
  </div>
</template>
