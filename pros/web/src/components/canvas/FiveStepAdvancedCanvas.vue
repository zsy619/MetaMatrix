<script setup lang="ts">
import { computed } from 'vue'
import type { FiveStepAdvancedDocumentJSON } from '../../types/canvas'
import advancedTemplate from '../../templates/five-step-advanced-v1.json'
import FiveStepSectionGrid from './FiveStepSectionGrid.vue'
import { resolveMethodFooter } from './fiveStepPalette'

const props = defineProps<{
  doc: FiveStepAdvancedDocumentJSON
}>()

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (advancedTemplate as FiveStepAdvancedDocumentJSON).footer,
  ),
)
</script>

<template>
  <FiveStepSectionGrid
    label="五步法（提高版）"
    :columns="doc.columns"
    :blocks="doc.blocks"
    :lead="notes.lead"
    :reminders="notes.reminders"
    negate="red"
    min-height="560px"
  />
</template>
