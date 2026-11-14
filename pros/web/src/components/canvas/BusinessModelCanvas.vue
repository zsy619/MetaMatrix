<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { BusinessModelBlockId, BusinessModelCanvasDocumentJSON } from '../../types/canvas'
import { isBusinessModelCanvasDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { FIVE_STEP_NEGATE_WARM, FIVE_STEP_PALETTE, type FiveStepPalette } from './fiveStepPalette'

const props = defineProps<{ doc: BusinessModelCanvasDocumentJSON }>()
const documentStore = useDocumentStore()
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

function update(id: BusinessModelBlockId, text: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isBusinessModelCanvasDoc(doc)) return
    doc.blocks = doc.blocks.map((item) => (item.id === id ? { ...item, text } : item))
  })
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
        <div class="bmc-body">
          <p>{{ block(id)?.hint }}</p>
          <textarea
            :value="block(id)?.text || ''"
            :aria-label="block(id)?.title"
            placeholder="写在这里"
            @change="update(id, ($event.target as HTMLTextAreaElement).value)"
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
.bmc-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 8px; }
p {
  margin: 0 0 8px;
  padding-left: 8px;
  border-left: 3px solid var(--col-topic);
  color: #3c3428;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.5;
  flex: none;
}
textarea {
  flex: 1 1 auto;
  min-height: 88px;
  width: 100%;
  border: 1px dashed rgba(60, 50, 20, 0.22);
  border-radius: 8px;
  padding: 10px 12px;
  resize: none;
  font: inherit;
  font-size: 15px;
  line-height: 1.55;
  background: rgba(255, 255, 255, 0.55);
  color: #202124;
}
textarea::placeholder { color: #5c564c; }
textarea:focus {
  outline: none;
  border-style: solid;
  border-color: var(--cv-focus, #163044);
  background: #fff;
}

@media (max-width: 900px) {
  .bmc-grid {
    min-width: 0;
    grid-template-columns: 1fr;
    grid-template-rows: none;
    overflow: visible;
  }

  .bmc-cell--partners,
  .bmc-cell--activities,
  .bmc-cell--resources,
  .bmc-cell--value,
  .bmc-cell--relationships,
  .bmc-cell--channels,
  .bmc-cell--segments,
  .bmc-cell--costs,
  .bmc-cell--revenue {
    grid-area: auto;
    min-height: 220px;
  }

  textarea {
    min-height: 120px;
  }
}
</style>
