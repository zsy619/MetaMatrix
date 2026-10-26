<script setup lang="ts">
import { computed } from 'vue'
import type {
  ScientificMeetingBlock,
  ScientificMeetingBlockId,
  ScientificMeetingDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'

const props = defineProps<{
  doc: ScientificMeetingDocumentJSON
}>()

const documentStore = useDocumentStore()

const byId = computed(() => {
  const map = new Map<ScientificMeetingBlockId, ScientificMeetingBlock>()
  for (const b of props.doc.blocks) {
    map.set(b.id, b)
  }
  return map
})

function block(id: ScientificMeetingBlockId): ScientificMeetingBlock | undefined {
  return byId.value.get(id)
}

const bgColor = computed(
  () => props.doc.theme.background.color || '#fffde7',
)

function onMeetingType(event: Event) {
  documentStore.updateScientificMeetingMeta({
    meetingType: (event.target as HTMLInputElement).value,
  })
}

function onOrganizer(event: Event) {
  documentStore.updateScientificMeetingMeta({
    organizer: (event.target as HTMLInputElement).value,
  })
}
</script>

<template>
  <div class="scientific-meeting-canvas" :style="{ backgroundColor: bgColor }">
    <div class="sm-grid" role="table" aria-label="科学开会思考画布">
      <!-- Col 1 · 目标 -->
      <section class="sm-col" v-show="block('goals')">
        <header class="sm-col-head">
          <h2 class="sm-step">Step 1. 目标</h2>
          <p class="sm-prompt">{{ block('goals')!.prompt }}</p>
        </header>
        <div class="sm-main">
          <YModelBlockCard :block="block('goals')!" hide-title />
        </div>
        <div class="sm-sub" v-show="block('no_meeting_problems')">
          <h3 class="sm-sub-title">{{ block('no_meeting_problems')!.title }}</h3>
          <div class="sm-sub-body">
            <YModelBlockCard :block="block('no_meeting_problems')!" hide-title />
          </div>
        </div>
      </section>

      <!-- Col 2 · 原则 -->
      <section class="sm-col" v-show="block('principles')">
        <header class="sm-col-head">
          <h2 class="sm-step">Step 2. 原则</h2>
          <p class="sm-prompt">{{ block('principles')!.prompt }}</p>
        </header>
        <div class="sm-main sm-main--solo">
          <YModelBlockCard :block="block('principles')!" hide-title />
        </div>
      </section>

      <!-- Col 3 · 关键流程 -->
      <section class="sm-col sm-col--last" v-show="block('process')">
        <header class="sm-col-head">
          <h2 class="sm-step">Step 3. 关键流程</h2>
          <p class="sm-prompt">{{ block('process')!.prompt }}</p>
        </header>
        <div class="sm-main">
          <YModelBlockCard :block="block('process')!" hide-title />
        </div>
        <div class="sm-sub" v-show="block('efficiency_means')">
          <h3 class="sm-sub-title">{{ block('efficiency_means')!.title }}</h3>
          <div class="sm-sub-body">
            <YModelBlockCard :block="block('efficiency_means')!" hide-title />
          </div>
        </div>
      </section>
    </div>

    <footer class="sm-footer">
      <label class="sm-meta">
        <span>会议类型：</span>
        <input
          type="text"
          class="sm-meta-input"
          :value="doc.meetingType"
          placeholder="______"
          maxlength="48"
          @input="onMeetingType"
        />
      </label>
      <label class="sm-meta">
        <span>梳理人：</span>
        <input
          type="text"
          class="sm-meta-input"
          :value="doc.organizer"
          placeholder="______"
          maxlength="48"
          @input="onOrganizer"
        />
      </label>
    </footer>
  </div>
</template>

<style scoped>
.scientific-meeting-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 2px solid #c9a227;
  border-radius: 2px;
  background: #fffde7;
}

.sm-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
}

.sm-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px 12px 10px;
  box-sizing: border-box;
  border-right: 2px solid #c9a227;
  gap: 8px;
  background: #fffde7;
}

.sm-col--last {
  border-right: none;
}

.sm-col-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sm-step {
  margin: 0;
  font-size: clamp(15px, 1.5vw, 18px);
  font-weight: 800;
  color: #202124;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.sm-prompt {
  margin: 0;
  font-size: clamp(11px, 1.1vw, 13px);
  font-weight: 400;
  color: #80868b;
  line-height: 1.45;
}

.sm-main {
  flex: 1.4 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sm-main--solo {
  flex: 1 1 0;
}

.sm-main :deep(.ym-block),
.sm-sub-body :deep(.ym-block) {
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.72);
  border-color: #c9a227;
}

.sm-sub {
  flex: 0.9 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px dashed #c9a227;
}

.sm-sub-title {
  margin: 0;
  flex-shrink: 0;
  font-size: clamp(12px, 1.2vw, 14px);
  font-weight: 700;
  color: #5f6368;
  line-height: 1.35;
}

.sm-sub-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sm-footer {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px 32px;
  padding: 10px 16px 12px;
  border-top: 2px solid #c9a227;
  background: #fff8e1;
}

.sm-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #3c4043;
}

.sm-meta-input {
  min-width: 6em;
  max-width: 14em;
  border: none;
  border-bottom: 1.5px solid #9aa0a6;
  background: transparent;
  font: inherit;
  font-weight: 500;
  color: #202124;
  padding: 0 4px 1px;
  outline: none;
}

.sm-meta-input::placeholder {
  color: #b0b4b8;
  letter-spacing: 0.08em;
}

.sm-meta-input:focus {
  border-bottom-color: #1a73e8;
}

@media (max-width: 720px) {
  .scientific-meeting-canvas {
    overflow-y: auto;
  }

  .sm-grid {
    grid-template-columns: 1fr;
  }

  .sm-col {
    border-right: none;
    border-bottom: 2px solid #c9a227;
    min-height: 220px;
  }

  .sm-col--last {
    border-bottom: none;
  }
}
</style>
