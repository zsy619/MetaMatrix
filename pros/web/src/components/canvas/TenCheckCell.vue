<script setup lang="ts">
import { usePanelMaximize } from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'

const props = defineProps<{
  label: string
  panelId: string
  modelValue: string
  fail?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [html: string]
}>()

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
  <div class="cell" :class="{ 'is-fail': fail, 'is-source-max': isMaximized }">
    <button
      type="button"
      class="pm-max-btn cell-max"
      title="最大化"
      aria-label="最大化"
      @mousedown.stop
      @click="onToggle"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <rect
          x="2.5"
          y="2.5"
          width="11"
          height="11"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
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
          <h3 class="pm-title">{{ label }}</h3>
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
            :class="{ 'is-fail': fail }"
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
  min-height: 0;
  height: 100%;
  display: flex;
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
  height: 100%;
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
.cell :deep(.rte-canvas) { padding: 8px 28px 4px 8px; background: transparent; overflow: auto; }
.cell :deep(.ProseMirror) { min-height: 140px; font-size: 14px; line-height: 1.55; }
.cell.is-fail :deep(.ProseMirror),
.pm-rte.is-fail :deep(.ProseMirror) { color: #9b1c1c; }
</style>
