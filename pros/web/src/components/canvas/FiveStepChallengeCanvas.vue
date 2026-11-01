<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { FiveStepChallengeDocumentJSON } from '../../types/canvas'
import challengeTemplate from '../../templates/five-step-challenge-v1.json'
import { useDocumentStore } from '../../stores/document'
import FiveStepSectionGrid from './FiveStepSectionGrid.vue'
import { resolveMethodFooter } from './fiveStepPalette'

const props = defineProps<{
  doc: FiveStepChallengeDocumentJSON
}>()

const documentStore = useDocumentStore()
documentStore.ensureFiveStepChallengeBlocks()
onMounted(() => {
  documentStore.ensureFiveStepChallengeBlocks()
})

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (challengeTemplate as FiveStepChallengeDocumentJSON).footer,
  ),
)
</script>

<template>
  <FiveStepSectionGrid
    label="五步法（挑战版）"
    :columns="doc.columns"
    :blocks="doc.blocks"
    :lead="notes.lead"
    :reminders="notes.reminders"
    negate="warm"
    min-height="820px"
    :theme="doc.theme"
  />
</template>
