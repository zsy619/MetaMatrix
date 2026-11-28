<script setup lang="ts">
import { computed } from 'vue'
import { usePanelMaximize } from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'

const props = defineProps<{
  label: string
  /** 格子上始终保留的说明，不写进正文 */
  note?: string
  panelId: string
  modelValue: string
  /** 三列用不同底色，方便顺着表头往下看 */
  tone?: 'fill' | 'judge' | 'fail'
}>()

const emit = defineEmits<{
  'update:modelValue': [html: string]
}>()

const caption = computed(() => {
  if (props.tone === 'judge') return '它帮你判断'
  if (props.tone === 'fail') return '不合格的信号'
  return '你要填什么'
})

const { isMaximized, toggleMaximize, closeMaximize } = usePanelMaximize(() => props.panelId)

function onToggle(event: MouseEvent) {
  event.stopPropagation()
  toggleMaximize()
}

function onClose(event?: Event) {
  event?.stopPropagation()
  closeMaximize()
}
</script>

<template>
  <div class="cell" :class="[`is-${tone || 'fill'}`, { 'is-source-max': isMaximized }]">
    <p class="cell-kicker">{{ caption }}</p>
    <p v-if="note" class="cell-note">{{ note }}</p>
    <button
      type="button"
      class="pm-max-btn cell-max"
      title="最大化"
      aria-label="最大化"
      @mousedown.stop
      @click="onToggle"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M3 6.2V3.4h2.8M10.2 3.4H13v2.8M13 9.8v2.8h-2.8M5.8 12.6H3V9.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <RichTextEditor
      v-if="!isMaximized"
      compact
      :page-sheet="false"
      :expanded="false"
      :show-title="false"
      :show-bottom-bar="false"
      :show-publish-actions="false"
      :show-markdown-hint="false"
      :aria-label="label"
      placeholder="点击填写…"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p v-else class="cell-hint">正在放大编辑…</p>
  </div>

  <Teleport to="body">
    <div
      v-if="isMaximized"
      class="pm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      @click.self="onClose"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <div class="pm-heading">
            <h3 class="pm-title">{{ label }}</h3>
            <p v-if="note" class="pm-note">{{ note }}</p>
          </div>
          <div class="pm-actions">
            <button type="button" class="pm-icon-btn" title="还原" aria-label="还原" @click="onClose">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="4" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" />
                <path d="M3 10.5V3.5h7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </button>
            <button type="button" class="pm-icon-btn pm-close" title="关闭" aria-label="关闭" @click="onClose">
              ×
            </button>
          </div>
        </div>
        <div class="pm-body">
          <RichTextEditor
            class="pm-rte"
            :class="{ 'is-fail': tone === 'fail' }"
            :expanded="true"
            :show-title="false"
            :show-bottom-bar="true"
            :show-publish-actions="false"
            placeholder="请输入正文"
            :model-value="modelValue"
            @update:model-value="emit('update:modelValue', $event)"
          />
        </div>
        <PanelAttachments :panel-id="panelId" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cell {
  position: relative;
  min-width: 0;
  min-height: 200px;
  height: auto;
  display: flex;
  flex-direction: column;
}
.cell-kicker {
  display: none;
  margin: 0;
  padding: 8px 32px 0 10px;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.3;
}
.cell-note {
  flex: none;
  margin: 0;
  padding: 8px 30px 0 8px;
  color: #5c574e;
  font-size: 14px;
  line-height: 1.5;
}
.cell.is-fill .cell-note,
.cell.is-fill .cell-kicker { color: #1d4e89; }
.cell.is-judge .cell-note,
.cell.is-judge .cell-kicker { color: #7a5b10; }
.cell.is-fail .cell-note,
.cell.is-fail .cell-kicker { color: #9b1c1c; }
.pm-heading { flex: 1; min-width: 0; }
.pm-note {
  margin: 2px 0 0;
  color: #5c574e;
  font-size: 13px;
  line-height: 1.45;
}
.cell-max {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
}
.cell.is-source-max {
  box-shadow: inset 0 0 0 2px var(--cv-select, rgba(28, 76, 124, 0.72));
}
.cell-hint {
  margin: 0;
  padding: 28px 10px 8px;
  color: #8a8175;
  font-size: 13px;
}
.cell :deep(.rte-root) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.cell:not(:focus-within) :deep(.rte-toolbar) { display: none; }
.cell :deep(.rte-workspace),
.cell :deep(.rte-canvas),
.cell :deep(.rte-body) { flex: 1 1 auto; min-height: 0; }
.cell :deep(.rte-canvas) { padding: 8px 28px 8px 8px; background: transparent; overflow: visible; }
.cell :deep(.ProseMirror) { min-height: 72px; font-size: 15px; line-height: 1.6; }

@media (max-width: 800px) {
  .cell { min-height: 0; }
  .cell-kicker { display: block; }
}
</style>
