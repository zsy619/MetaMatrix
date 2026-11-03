<script setup lang="ts">
/**
 * 系列区块（schema 的 series 段）：可切换系列，逐个系列改字段。
 */
import { computed } from 'vue'
import ChartFieldRow from './ChartFieldRow.vue'
import type { useChartPanel } from './useChartPanel'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const fields = computed(
  () => props.panel.schema.sections.find((section) => section.id === 'series')?.fields || [],
)
</script>

<template>
  <div v-if="fields.length" class="rte-cp-section">
    <h4 class="rte-cp-section-title">系列</h4>
    <div v-if="props.panel.seriesList.length > 1" class="rte-cp-series-tabs">
      <button
        v-for="(_, index) in props.panel.seriesList"
        :key="index"
        type="button"
        class="rte-cp-series-tab"
        :class="{ active: props.panel.seriesIndex === index }"
        @click="props.panel.seriesIndex = index"
      >
        {{ props.panel.seriesNames[index] }}
      </button>
    </div>
    <ChartFieldRow
      v-for="field in fields"
      :key="field.path"
      :field="field"
      :value="props.panel.fieldValue('series', field, props.panel.seriesIndex)"
      @update="(value) => props.panel.setFieldValue('series', field, value, props.panel.seriesIndex)"
    />
  </div>
</template>
