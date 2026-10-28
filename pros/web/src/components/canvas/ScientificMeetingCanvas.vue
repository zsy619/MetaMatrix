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

/** 附图：Step 标题（非可编辑 chrome） */
const STEP_LABEL: Record<ScientificMeetingBlockId, string> = {
  goal: 'Step1. 目标',
  principles: 'Step2. 原则',
  process: 'Step3. 关键流程',
}

const COLUMNS: ScientificMeetingBlockId[] = ['goal', 'principles', 'process']

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
  () => props.doc.theme.background.color || '#f8f2d4',
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
  <div
    class="scientific-meeting-canvas"
    :style="{ backgroundColor: bgColor }"
    aria-label="科学开会思考"
  >
    <div class="sm-grid" role="group">
      <section
        v-for="(id, idx) in COLUMNS"
        :key="id"
        class="sm-col"
        :class="{ 'sm-col--last': idx === COLUMNS.length - 1 }"
        v-show="block(id)"
      >
        <header class="sm-col-head">
          <h2 class="sm-step">{{ STEP_LABEL[id] }}</h2>
          <p class="sm-prompt">{{ block(id)!.prompt }}</p>
        </header>
        <div class="sm-panel">
          <YModelBlockCard :block="block(id)!" hide-title />
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
          placeholder="________"
          maxlength="48"
          aria-label="会议类型"
          @input="onMeetingType"
          @click.stop
        />
      </label>
      <label class="sm-meta">
        <span>梳理人：</span>
        <input
          type="text"
          class="sm-meta-input"
          :value="doc.organizer"
          placeholder="________"
          maxlength="48"
          aria-label="梳理人"
          @input="onOrganizer"
          @click.stop
        />
      </label>
    </footer>
  </div>
</template>

<style scoped>
/* 附图取样：背景 #f8f2d4，黑线/黑字，灰斜体副标题 */
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
  border: 1px solid #1a1a1a;
  border-radius: 2px;
  background: #f8f2d4;
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
  padding: 14px 14px 10px;
  box-sizing: border-box;
  border-right: 1.5px solid #1a1a1a;
  gap: 8px;
  background: #f8f2d4;
}

.sm-col--last {
  border-right: none;
}

.sm-col-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sm-step {
  margin: 0;
  font-size: clamp(16px, 1.6vw, 20px);
  font-weight: 800;
  color: #1a1a1a;
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.sm-prompt {
  margin: 0;
  font-size: clamp(12px, 1.15vw, 14px);
  font-weight: 400;
  font-style: italic;
  color: #8e8a7a;
  line-height: 1.5;
}

.sm-panel {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  box-sizing: border-box;
}

.sm-panel :deep(.ym-block) {
  flex: 1;
  min-height: 400px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.sm-panel :deep(.ProseMirror) {
  font-size: 14px;
  line-height: 1.65;
  color: #1a1a1a;
}

.sm-footer {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px 48px;
  padding: 10px 18px 12px;
  border-top: 1.5px solid #1a1a1a;
  background: #f8f2d4;
}

.sm-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.sm-meta-input {
  min-width: 8em;
  max-width: 16em;
  border: none;
  border-bottom: 1.5px solid #1a1a1a;
  background: transparent;
  font: inherit;
  font-weight: 500;
  color: #1a1a1a;
  padding: 0 4px 1px;
  outline: none;
}

.sm-meta-input::placeholder {
  color: #b0aea0;
  letter-spacing: 0.06em;
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
    border-bottom: 1.5px solid #1a1a1a;
    min-height: 280px;
  }

  .sm-col--last {
    border-bottom: none;
  }
}
</style>
