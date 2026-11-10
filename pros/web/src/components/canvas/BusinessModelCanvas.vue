<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BusinessModelBlockId, BusinessModelCanvasDocumentJSON } from '../../types/canvas'
import { FIVE_STEP_NEGATE_WARM, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'
import FiveStepPanel from './FiveStepPanel.vue'

const props = defineProps<{ doc: BusinessModelCanvasDocumentJSON }>()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const order: BusinessModelBlockId[] = [
  'partners',
  'activities',
  'resources',
  'value',
  'relationships',
  'channels',
  'segments',
  'costs',
  'revenue',
]

const tones: Record<BusinessModelBlockId, FiveStepPalette> = {
  partners: { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  activities: FIVE_STEP_PALETTE.solution,
  resources: { header: '#6A7818', body: '#F4F6E6', topic: '#4E5A10' },
  value: FIVE_STEP_PALETTE.demand,
  relationships: FIVE_STEP_PALETTE.business,
  channels: FIVE_STEP_PALETTE.hypothesis,
  segments: FIVE_STEP_PALETTE.moat,
  costs: FIVE_STEP_NEGATE_WARM,
  revenue: FIVE_STEP_PALETTE.growth,
}

function block(id: BusinessModelBlockId) {
  return props.doc.blocks.find((item) => item.id === id)
}

function toneStyle(id: BusinessModelBlockId) {
  const tone = tones[id]
  return {
    '--col-header': tone.header,
    '--col-body': tone.body,
    '--col-topic': tone.topic,
  }
}
</script>

<template>
  <div class="bmc" :style="chrome" aria-label="商业模式画布">
    <h2>{{ doc.title }}</h2>
    <div class="bmc-grid">
      <section
        v-for="id in order"
        :key="id"
        :class="`bmc-cell bmc-cell--${id}`"
        :style="toneStyle(id)"
      >
        <header>
          <h3>{{ block(id)?.title }}</h3>
        </header>
        <div v-if="block(id)" class="bmc-panel">
          <FiveStepPanel
            chrome="fill"
            density="compact"
            :block="block(id)!"
            :header="block(id)!.title"
            :palette="tones[id]"
            :topic-placeholder="block(id)!.hint || '主题'"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bmc {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px 14px;
  overflow: auto;
  color: #202124;
  background: var(--cv-page, #f7f7f7);
}
.bmc h2 { margin: 0 0 10px; font-size: 18px; flex: none; }
.bmc-grid {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 860px;
  display: grid;
  grid-template-columns: 1.05fr 1fr 1.16fr 1fr 1.05fr;
  grid-template-rows: 1fr 1fr 0.78fr;
  background: #fff;
  border: 1px solid var(--cv-frame, #ececec);
  overflow: hidden;
}
.bmc-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--col-body);
  box-shadow: inset -1px -1px 0 rgba(60, 50, 20, 0.08);
}
.bmc-cell--partners { grid-area: 1 / 1 / 3 / 2; }
.bmc-cell--activities { grid-area: 1 / 2 / 2 / 3; }
.bmc-cell--resources { grid-area: 2 / 2 / 3 / 3; }
.bmc-cell--value { grid-area: 1 / 3 / 3 / 4; }
.bmc-cell--relationships { grid-area: 1 / 4 / 2 / 5; }
.bmc-cell--channels { grid-area: 2 / 4 / 3 / 5; }
.bmc-cell--segments { grid-area: 1 / 5 / 3 / 6; }
.bmc-cell--costs { grid-area: 3 / 1 / 4 / 4; }
.bmc-cell--revenue { grid-area: 3 / 4 / 4 / 6; }
header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 6px 8px;
  background: var(--col-header);
}
h3 {
  margin: 0;
  color: #fff;
  font-size: clamp(13px, 1.2vw, 16px);
  letter-spacing: 0.04em;
  text-align: center;
}
.bmc-panel { flex: 1 1 auto; min-height: 0; display: flex; }
</style>
