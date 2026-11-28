<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  ScientificMeetingBlock,
  ScientificMeetingBlockId,
  ScientificMeetingDocumentJSON,
} from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import YModelBlockCard from './YModelBlock.vue'
import { toneVars } from './fiveStepPalette'

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

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

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
    :style="chrome"
    aria-label="科学开会思考"
  >
    <div class="sm-grid" role="group">
      <section
        v-for="(id, idx) in COLUMNS"
        :key="id"
        class="sm-col tbl-tone"
        :class="{ 'sm-col--last': idx === COLUMNS.length - 1 }"
        :style="toneVars(idx)"
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
  inset: 14px 16px 12px;
  z-index: 10;
  overflow: auto;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 2px;
  background: var(--tbl-body, #fff);
}

.sm-grid {
  flex: 1 0 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: visible;
}

.sm-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: min-content;
  padding: 0;
  box-sizing: border-box;
  border-right: 1px solid var(--cv-frame, #ececec);
  gap: 0;
  background: var(--tbl-body, #f8f2d4);
}

.sm-col--last {
  border-right: none;
}

.sm-col-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 10px;
  background: var(--tbl-header, #0e8a84);
  color: #fff;
}

.sm-step {
  margin: 0;
  font-size: clamp(16px, 1.6vw, 20px);
  font-weight: 800;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.sm-prompt {
  margin: 0;
  font-size: 15px;
  font-weight: 550;
  font-style: normal;
  color: rgba(255, 255, 255, 0.96);
  line-height: 1.55;
}

.sm-panel {
  flex: 1 1 auto;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: visible;
  box-sizing: border-box;
  padding: 10px 12px 12px;
  background: transparent;
}

.sm-panel :deep(.ym-block) {
  flex: 1 1 auto;
  height: auto;
  min-height: 240px;
  overflow: visible;
  background: transparent;
  border: none;
  box-shadow: none;
}

.sm-panel :deep(.ym-block-body),
.sm-panel :deep(.ym-rte),
.sm-panel :deep(.rte-root),
.sm-panel :deep(.rte-workspace),
.sm-panel :deep(.rte-canvas) {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

.sm-panel :deep(.ProseMirror) {
  height: auto !important;
  min-height: 180px;
  overflow: visible !important;
  font-size: 15px;
  line-height: 1.65;
  color: #1a1a1a;
}

.sm-footer {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 40px;
  padding: 12px 18px 14px;
  border-top: 1px solid var(--cv-frame, #ececec);
  background: var(--tbl-body, #fff);
}

.sm-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}

.sm-meta span {
  flex: none;
  white-space: nowrap;
}

.sm-meta-input {
  min-width: 10em;
  max-width: 18em;
  min-height: 36px;
  border: none;
  border-bottom: 1.5px solid rgba(26, 26, 26, 0.28);
  background: transparent;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  color: #1a1a1a;
  padding: 4px 2px;
  outline: none;
}

.sm-meta-input::placeholder {
  color: #b0aea0;
  letter-spacing: 0.06em;
}

.sm-meta-input:focus {
  border-bottom-color: var(--cv-focus, #1c4c7c);
}

@media (max-width: 720px) {
  .scientific-meeting-canvas {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .sm-grid {
    grid-template-columns: 1fr;
  }

  .sm-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .sm-meta {
    width: 100%;
    min-width: 0;
  }

  .sm-meta-input {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    max-width: none;
  }

  .sm-col {
    border-right: none;
    border-bottom: 1px solid var(--cv-frame, #ececec);
    min-height: 280px;
  }

  .sm-col--last {
    border-bottom: none;
  }
}
</style>
