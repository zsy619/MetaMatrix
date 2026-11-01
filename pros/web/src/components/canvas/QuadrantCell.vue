<script setup lang="ts">
import { computed } from 'vue'
import type { QuadrantCell } from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'
import { itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'

const props = withDefaults(
  defineProps<{
    cell: QuadrantCell
    /**
     * 是否显示右上角「+」新增段落按钮。
     * 使用 RichTextEditor 时应为 false（默认）。
     */
    showAdd?: boolean
  }>(),
  { showAdd: false },
)

const selection = useSelectionStore()
const documentStore = useDocumentStore()

const maximizeKey = computed(() =>
  panelMaximizeKey('cell', props.cell.position),
)
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const selected = computed(
  () =>
    (selection.kind === 'quadrant' || selection.kind === 'item') &&
    selection.quadrantPosition === props.cell.position,
)

const editorHtml = computed(() => itemsToHtml(props.cell.items))

function onEditorHtml(html: string) {
  syncItemsFromHtml(props.cell.items, html, {
    update: (id, text) => {
      documentStore.updateItem(props.cell.position, id, { text })
    },
    add: (text) => documentStore.addItem(props.cell.position, { text }),
    remove: (id) => {
      documentStore.removeItem(props.cell.position, id)
    },
  })
}

function onEditorFocus() {
  selection.selectQuadrant(props.cell.position)
}

const watermarkStyle = computed(() => {
  const pos = props.cell.watermark.position
  const base: Record<string, string> = {
    color: props.cell.watermark.color,
  }
  if (pos.includes('top')) base.top = '12px'
  if (pos.includes('bottom')) base.bottom = '8px'
  if (pos.includes('left')) base.left = '12px'
  if (pos.includes('right')) base.right = '12px'
  return base
})

function onSelectCell() {
  selection.selectQuadrant(props.cell.position)
}

function onAddItem(event: MouseEvent) {
  event.stopPropagation()
  const item = documentStore.addItem(props.cell.position, { text: '' })
  if (item) {
    selection.selectItem(props.cell.position, item.id)
  }
}

function onToggleMaximize(event: MouseEvent) {
  event.stopPropagation()
  if (!isMaximized.value) {
    selection.selectQuadrant(props.cell.position)
  }
  toggleMaximize()
}

function onCloseMaximize(event?: Event) {
  event?.stopPropagation()
  closeMaximize()
}
</script>

<template>
  <div
    class="quadrant-cell"
    :class="{ selected, 'is-source-max': isMaximized }"
    :style="{ backgroundColor: cell.backgroundColor }"
    @click.stop="onSelectCell"
  >
    <div class="cell-header">
      <h3 class="cell-title">{{ cell.title }}</h3>
      <span
        class="cell-tag"
        :style="{ backgroundColor: cell.tag.bgColor, color: cell.tag.color }"
      >
        {{ cell.tag.text }}
      </span>
      <div class="cell-actions">
        <button
          v-if="showAdd"
          type="button"
          class="add-item-btn"
          title="新增段落"
          @click="onAddItem"
        >
          +
        </button>
        <button
          type="button"
          class="pm-max-btn"
          title="最大化"
          aria-label="最大化"
          @click="onToggleMaximize"
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
      </div>
    </div>

    <div v-if="!isMaximized" class="cell-body">
      <RichTextEditor
        class="cell-rte"
        compact
        :panel-id="maximizeKey"
        :expanded="false"
        :show-title="false"
        :show-bottom-bar="true"
        :show-publish-actions="false"
        placeholder="请输入正文"
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
    </div>
    <p v-else class="cell-empty cell-max-hint">正在放大编辑…</p>

    <PanelAttachments
      v-if="!isMaximized"
      :panel-id="maximizeKey"
      compact
    />

    <div class="watermark" :style="watermarkStyle" aria-hidden="true">
      <span class="wm-letter">{{ cell.watermark.letter }}</span>
      <span class="wm-text">{{ cell.watermark.text }}</span>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isMaximized"
      class="pm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="cell.title || '象限放大编辑'"
      @click.self="onCloseMaximize"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ cell.title }}</h3>
          <div class="pm-actions">
            <button
              v-if="showAdd"
              type="button"
              class="pm-icon-btn"
              title="新增段落"
              @click="onAddItem"
            >
              +
            </button>
            <button
              type="button"
              class="pm-icon-btn"
              title="还原"
              aria-label="还原"
              @click="onCloseMaximize"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect
                  x="4"
                  y="4"
                  width="9"
                  height="9"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M3 10.5V3.5h7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="pm-icon-btn pm-close"
              title="关闭"
              aria-label="关闭"
              @click="onCloseMaximize"
            >
              ×
            </button>
          </div>
        </div>
        <div class="pm-body">
          <RichTextEditor
            class="pm-rte"
            :panel-id="maximizeKey"
            :expanded="true"
            :show-title="false"
            :show-bottom-bar="true"
            :show-publish-actions="false"
            placeholder="请输入正文"
            :model-value="editorHtml"
            @update:model-value="onEditorHtml"
            @focus="onEditorFocus"
          />
        </div>

        <PanelAttachments :panel-id="maximizeKey" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.quadrant-cell {
  position: relative;
  min-height: 0;
  height: 100%;
  padding: 12px 14px 14px;
  overflow: hidden;
  cursor: pointer;
  border: none;
  box-shadow:
    inset -1px 0 0 rgba(60, 50, 20, 0.08),
    inset 0 -1px 0 rgba(60, 50, 20, 0.08);
  transition: box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.quadrant-cell.selected {
  box-shadow: inset 0 0 0 2px var(--cv-select, rgba(28, 76, 124, 0.72));
}

.quadrant-cell.is-source-max {
  box-shadow: inset 0 0 0 2px var(--cv-select-soft, rgba(28, 76, 124, 0.34));
}

.cell-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  z-index: 3;
  padding-bottom: 8px;
}

.cell-title {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: #202124;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.cell-tag {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.cell-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  z-index: 4;
}

.add-item-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.92);
  color: #5f6368;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.add-item-btn:hover {
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
  background: var(--cv-hover-wash, #e8f1fa);
}

.cell-actions .pm-max-btn {
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.92);
}

.cell-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  z-index: 2;
  padding-right: 2px;
  scrollbar-gutter: stable;
}

.cell-body::-webkit-scrollbar {
  width: 6px;
}

.cell-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.45);
  border-radius: 999px;
}

.cell-body::-webkit-scrollbar-track {
  background: transparent;
}

.cell-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cell-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: text;
}

.cell-item:hover {
  background: rgba(255, 255, 255, 0.55);
}

.cell-item.item-selected {
  border-color: var(--cv-focus, #1c4c7c);
  background: var(--cv-hover-wash, #e8f1fa);
  box-shadow: 0 0 0 1px var(--cv-select-soft, rgba(28, 76, 124, 0.34));
}

.remove-item-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #d93025;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.remove-item-btn:hover {
  background: #fce8e6;
}

.cell-empty {
  margin: 0;
  padding: 8px 2px;
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
  line-height: 1.45;
}

.cell-max-hint {
  flex: 1;
  display: flex;
  align-items: center;
  color: var(--cv-muted, #5f6368);
  font-weight: 550;
  z-index: 2;
}

.watermark {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  opacity: 0.55;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}

.wm-letter {
  font-size: 72px;
  font-weight: 800;
  line-height: 0.85;
  letter-spacing: -0.04em;
}

.wm-text {
  font-size: 13px;
  font-weight: 600;
  margin-top: 2px;
  opacity: 0.9;
}

.cell-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  position: relative;
  z-index: 2;
}

.cell-rte {
  flex: 1;
  min-height: 0;
}

.pm-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pm-rte {
  flex: 1;
  min-height: 280px;
}
</style>
