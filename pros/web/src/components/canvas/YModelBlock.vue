<script setup lang="ts">
import { computed } from 'vue'
import type { QuadrantItem } from '../../types/canvas'
import { useSelectionStore } from '../../stores/selection'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'
import { itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'

/** 任意带 id/title/items 的可编辑方块（Y 模型 / 刻意练习） */
export interface EditableBlockLike {
  id: string
  title: string
  items: QuadrantItem[]
}

const props = defineProps<{
  block: EditableBlockLike
  /** 紧凑模式：底部横条等 */
  compact?: boolean
  /** 隐藏标题（标题已由外层 section 展示时） */
  hideTitle?: boolean
}>()

const selection = useSelectionStore()
const documentStore = useDocumentStore()

const maximizeKey = computed(() => panelMaximizeKey('block', props.block.id))
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const selected = computed(
  () =>
    (selection.kind === 'block' ||
      (selection.kind === 'item' && selection.itemContainerKind === 'block')) &&
    selection.blockId === props.block.id,
)

const isEmpty = computed(() => props.block.items.length === 0)

const editorHtml = computed(() => itemsToHtml(props.block.items))

function onEditorHtml(html: string) {
  syncItemsFromHtml(props.block.items, html, {
    update: (id, text) => {
      documentStore.updateBlockItem(props.block.id, id, { text })
    },
    add: (text) => documentStore.addBlockItem(props.block.id, { text }),
    remove: (id) => {
      documentStore.removeBlockItem(props.block.id, id)
    },
  })
}

function onEditorFocus() {
  selection.selectBlock(props.block.id)
}

function onSelectBlock() {
  selection.selectBlock(props.block.id)
}

function onAddItem(event: MouseEvent) {
  event.stopPropagation()
  const item = documentStore.addBlockItem(props.block.id, { text: '' })
  if (item) {
    selection.selectBlockItem(props.block.id, item.id)
  }
}

function onToggleMaximize(event: MouseEvent) {
  event.stopPropagation()
  if (!isMaximized.value) {
    selection.selectBlock(props.block.id)
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
    class="ym-block"
    :class="{ selected, compact, empty: isEmpty, 'is-source-max': isMaximized }"
    @click.stop="onSelectBlock"
  >
    <div v-if="!hideTitle" class="ym-block-header">
      <h3 class="ym-block-title">{{ block.title }}</h3>
      <div class="ym-block-actions">
        <button
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
    <div v-else class="ym-block-toolbar">
      <button
        type="button"
        class="add-item-btn muted"
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

    <div v-if="!isMaximized" class="ym-block-body">
      <RichTextEditor
        class="ym-rte"
        compact
        :expanded="false"
        :show-title="false"
        :show-bottom-bar="true"
        :show-publish-actions="false"
        :show-markdown-hint="true"
        placeholder="请输入正文"
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
    </div>
    <p v-else class="ym-block-empty ym-block-max-hint">正在放大编辑…</p>

    <PanelAttachments
      v-if="!isMaximized"
      :panel-id="maximizeKey"
      compact
    />
  </div>

  <Teleport to="body">
    <div
      v-if="isMaximized"
      class="pm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="block.title || '面板放大编辑'"
      @click.self="onCloseMaximize"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ block.title || '编辑面板' }}</h3>
          <div class="pm-actions">
            <button
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
            :compact="false"
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
.ym-block {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-radius: 8px;
  border: 1.5px dashed #9aa0a6;
  background: rgba(248, 249, 250, 0.72);
  overflow: hidden;
  cursor: pointer;
  box-sizing: border-box;
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.ym-block.selected {
  border-color: rgba(26, 115, 232, 0.75);
  border-style: solid;
  box-shadow: inset 0 0 0 1px rgba(26, 115, 232, 0.35);
  background: #fff;
}

.ym-block.is-source-max {
  border-color: rgba(26, 115, 232, 0.45);
  border-style: dashed;
  background: rgba(232, 240, 254, 0.45);
}

.ym-block.compact {
  background: transparent;
  border-color: #b0b4b8;
  border-radius: 6px;
}

.ym-block.compact.selected {
  background: rgba(255, 255, 255, 0.92);
}

.ym-block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 10px 2px;
}

.ym-block.compact .ym-block-header {
  padding: 6px 8px 0;
}

.ym-block-title {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  color: #5f6368;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
  line-height: 1.35;
}

.ym-block-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ym-block-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 0;
  flex-shrink: 0;
}

.ym-block.compact .ym-block-toolbar {
  padding: 2px 4px 0;
}

.add-item-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1px dashed #9aa0a6;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.75);
  color: #5f6368;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.ym-block.compact .add-item-btn,
.ym-block.compact .pm-max-btn {
  width: 18px;
  height: 18px;
  font-size: 13px;
}

.add-item-btn:hover,
.add-item-btn.muted:hover {
  background: #e8f0fe;
  border-color: #1a73e8;
  color: #1a73e8;
}

.ym-block-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 10px 12px;
  position: relative;
  z-index: 2;
  scrollbar-gutter: stable;
}

.ym-block.compact .ym-block-body {
  padding: 2px 6px 6px;
}

.ym-block-body::-webkit-scrollbar {
  width: 5px;
}

.ym-block-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.4);
  border-radius: 999px;
}

.ym-block-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ym-block-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 5px;
  border: 1px solid transparent;
  cursor: text;
}

.ym-block-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.ym-block-item.item-selected {
  border-color: rgba(26, 115, 232, 0.65);
  background: rgba(232, 240, 254, 0.75);
  box-shadow: 0 0 0 1px rgba(26, 115, 232, 0.2);
}

.remove-item-btn {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #d93025;
  font-size: 15px;
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

.ym-block-empty {
  margin: 0;
  padding: 10px 4px 8px;
  font-size: 12px;
  color: #b0b4b8;
  line-height: 1.45;
  text-align: left;
}

.ym-block-max-hint {
  flex: 1;
  display: flex;
  align-items: center;
  color: #1a73e8;
  font-weight: 550;
}

.ym-block.empty:not(.compact) {
  min-height: 132px;
}

.ym-block.compact.empty {
  min-height: 40px;
}

.ym-block-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ym-rte {
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
