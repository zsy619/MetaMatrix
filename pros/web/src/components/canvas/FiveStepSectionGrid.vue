<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasTheme, QuadrantItem } from '../../types/canvas'
import FiveStepPanel from './FiveStepPanel.vue'
import FiveStepNotes from './FiveStepNotes.vue'
import { canvasChromeStyle } from './canvasChrome'
import { fiveStepPalette, sectionPalette } from './fiveStepPalette'
import './five-step-shell.css'

export interface FiveStepSectionLike {
  blockId: string
  label: string
  tone: 'normal' | 'negate' | string
}

export interface FiveStepSectionColumn {
  id: string
  header: string
  footerLabel: string
  sections: FiveStepSectionLike[]
}

export interface FiveStepSectionBlock {
  id: string
  title: string
  keyword?: string
  items: QuadrantItem[]
}

const props = withDefaults(
  defineProps<{
    columns: FiveStepSectionColumn[]
    blocks: FiveStepSectionBlock[]
    label: string
    lead: string
    reminders: string[]
    negate?: 'red' | 'warm'
    minHeight?: string
    theme?: Partial<CanvasTheme> | null
  }>(),
  {
    negate: 'red',
    minHeight: '560px',
    theme: null,
  },
)

const chrome = computed(() => canvasChromeStyle(props.theme))

const byId = computed(() => {
  const map = new Map<string, FiveStepSectionBlock>()
  for (const block of props.blocks) map.set(block.id, block)
  return map
})

function block(id: string): FiveStepSectionBlock | undefined {
  return byId.value.get(id)
}

function panelHeader(section: FiveStepSectionLike, current?: FiveStepSectionBlock): string {
  const label = (section.label || '').trim()
  if (label) return label
  return current?.title || ''
}
</script>

<template>
  <div class="fsx-canvas" :style="chrome" :aria-label="label">
    <div
      class="fsx-grid"
      role="table"
      :aria-label="label"
      :style="{
        '--fsx-cols': String(columns.length),
        '--fsx-min': minHeight,
      }"
    >
      <section
        v-for="col in columns"
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
          <div
            v-for="section in col.sections"
            :key="section.blockId"
            class="fsx-panel"
          >
            <FiveStepPanel
              v-if="block(section.blockId)"
              density="compact"
              :block="block(section.blockId)!"
              :header="panelHeader(section, block(section.blockId))"
              :palette="sectionPalette(col.id, section.tone, negate)"
              :topic-placeholder="block(section.blockId)!.title || '主题'"
            />
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

    <FiveStepNotes :lead="lead" :reminders="reminders" />
  </div>
</template>
