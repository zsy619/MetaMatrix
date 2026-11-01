<script setup lang="ts">
import { computed } from 'vue'
import type {
  FiveStepBlock,
  FiveStepBlockId,
  FiveStepDocumentJSON,
} from '../../types/canvas'
import originalTemplate from '../../templates/five-step-v1.json'
import FiveStepPanel from './FiveStepPanel.vue'
import FiveStepNotes from './FiveStepNotes.vue'
import { fiveStepPalette, resolveMethodFooter } from './fiveStepPalette'
import './five-step-shell.css'

const props = defineProps<{
  doc: FiveStepDocumentJSON
}>()

const byId = computed(() => {
  const map = new Map<FiveStepBlockId, FiveStepBlock>()
  for (const block of props.doc.blocks) map.set(block.id, block)
  return map
})

function block(id: FiveStepBlockId): FiveStepBlock | undefined {
  return byId.value.get(id)
}

const notes = computed(() =>
  resolveMethodFooter(
    props.doc.footer,
    (originalTemplate as FiveStepDocumentJSON).footer,
  ),
)
</script>

<template>
  <div class="fsx-canvas" aria-label="五步法（原版）">
    <div
      class="fsx-grid"
      role="table"
      aria-label="五步法（原版）"
      style="--fsx-cols: 5; --fsx-min: 640px"
    >
      <section
        v-for="col in doc.columns"
        :key="col.id"
        class="fsx-col"
        role="cell"
      >
        <header
          class="fsx-head"
          role="columnheader"
          :style="{ background: fiveStepPalette(col.id).header }"
        >
          <h2>{{ col.header }}</h2>
        </header>

        <div class="fsx-body">
          <div class="fsx-stack fsx-stack--qual">
            <div
              class="fsx-group"
              :style="{ color: fiveStepPalette(col.id).topic }"
            >
              定性
            </div>
            <div
              v-for="bid in col.qualitativeBlockIds"
              :key="bid"
              class="fsx-panel"
            >
              <FiveStepPanel
                v-if="block(bid)"
                density="compact"
                :block="block(bid)!"
                :header="block(bid)!.title"
                :palette="fiveStepPalette(col.id)"
                :topic-placeholder="block(bid)!.title || '主题'"
              />
            </div>
          </div>

          <div class="fsx-stack fsx-stack--quant">
            <div class="fsx-panel">
              <FiveStepPanel
                v-if="block(col.quantitativeBlockId)"
                density="compact"
                :block="block(col.quantitativeBlockId)!"
                :header="block(col.quantitativeBlockId)!.title"
                :palette="fiveStepPalette(col.id)"
                :topic-placeholder="block(col.quantitativeBlockId)!.title || '主题'"
              />
            </div>
          </div>
        </div>

        <footer
          class="fsx-foot"
          :style="{ color: fiveStepPalette(col.id).topic }"
        >
          <span>{{ col.footerLabel }}</span>
        </footer>
      </section>
    </div>

    <FiveStepNotes :lead="notes.lead" :reminders="notes.reminders" />
  </div>
</template>
