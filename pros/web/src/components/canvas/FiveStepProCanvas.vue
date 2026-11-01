<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { FiveStepProDocumentJSON } from '../../types/canvas'
import proTemplate from '../../templates/five-step-pro-v1.json'
import { useDocumentStore } from '../../stores/document'
import FiveStepSectionGrid from './FiveStepSectionGrid.vue'
import { resolveMethodFooter } from './fiveStepPalette'

const props = defineProps<{
  doc: FiveStepProDocumentJSON
}>()

const documentStore = useDocumentStore()
documentStore.ensureFiveStepProBlocks()
onMounted(() => {
  documentStore.ensureFiveStepProBlocks()
})

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (proTemplate as FiveStepProDocumentJSON).footer,
  ),
)
</script>

<template>
  <FiveStepSectionGrid
    label="五步法（进阶版）"
    :columns="doc.columns"
    :blocks="doc.blocks"
    :lead="notes.lead"
    :reminders="notes.reminders"
    negate="red"
    min-height="680px"
    :theme="doc.theme"
  />
</template>
