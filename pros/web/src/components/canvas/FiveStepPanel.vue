<script setup lang="ts">
import { computed, ref } from 'vue'
import type { QuadrantItem } from '../../types/canvas'
import type { FiveStepPalette } from './fiveStepPalette'
import { useSelectionStore } from '../../stores/selection'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'
import { itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'

export interface FiveStepEditableBlock {
  id: string
  title: string
  keyword?: string
  items: QuadrantItem[]
}

const props = withDefaults(
  defineProps<{
    block: FiveStepEditableBlock
    /** 色块抬头（步骤名或分区固定标签） */
    header: string
    palette: FiveStepPalette
    topicPlaceholder?: string
    /**
     * banner：抬头色条 + 浅色内容区。
     * fill：整格铺浅色，最大化按钮浮在右上角（列抬头已在格外时）。
     */
    chrome?: 'banner' | 'fill'
    density?: 'regular' | 'compact'
  }>(),
  {
    topicPlaceholder: '主题',
    chrome: 'banner',
    density: 'regular',
  },
)

const selection = useSelectionStore()
const documentStore = useDocumentStore()

const maximizeKey = computed(() => panelMaximizeKey('block', props.block.id))
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const selected = computed(() => {
  const id = props.block.id
  return (
    (selection.kind === 'block' ||
      (selection.kind === 'item' && selection.itemContainerKind === 'block')) &&
    selection.blockId === id
  )
})

const topicShownSource = computed(() => (props.block.keyword || '').trim())
const topicDraft = ref<string | null>(null)
const topicShown = computed(() => topicDraft.value ?? topicShownSource.value)
const editorHtml = computed(() => itemsToHtml(props.block.items ?? []))
const isFill = computed(() => props.chrome === 'fill')

function onEditorHtml(html: string) {
  if (!Array.isArray(props.block.items)) props.block.items = []
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

function onTopicFocus() {
  topicDraft.value = topicShownSource.value
  selection.selectBlock(props.block.id)
}

function onTopicInput(event: Event) {
  topicDraft.value = (event.target as HTMLInputElement).value
}

function commitTopic() {
  if (topicDraft.value == null) return
  documentStore.updateBlockKeyword(props.block.id, topicDraft.value)
  topicDraft.value = null
}

function onTopicEnter(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement | null)?.blur()
}

function onToggleMaximize(event: MouseEvent) {
  event.stopPropagation()
  if (!isMaximized.value) selection.selectBlock(props.block.id)
  toggleMaximize()
}

function onCloseMaximize(event?: Event) {
  event?.stopPropagation()
  closeMaximize()
}
</script>

<template>
  <div
    class="fsp"
    :class="[
      `fsp--${chrome}`,
      `fsp--${density}`,
      { selected, 'is-source-max': isMaximized },
    ]"
    :style="{
      '--fsp-header': palette.header,
      '--fsp-body': palette.body,
      '--fsp-topic': palette.topic,
    }"
    @click.stop="onSelectBlock"
  >
    <div v-if="!isFill" class="fsp-header">
      <h3 class="fsp-title">{{ header }}</h3>
      <div class="fsp-actions">
        <button
          type="button"
          class="pm-max-btn pm-on-dark"
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
    <button
      v-else
      type="button"
      class="pm-max-btn fsp-float-max"
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

    <div v-if="!isMaximized" class="fsp-body">
      <input
        class="fsp-topic"
        :value="topicShown"
        :placeholder="topicPlaceholder"
        maxlength="32"
        aria-label="内容主题"
        @click.stop
        @mousedown.stop
        @focus="onTopicFocus"
        @input="onTopicInput"
        @blur="commitTopic"
        @keydown.enter.prevent="onTopicEnter"
      />
      <RichTextEditor
        class="fsp-rte"
        compact
        :expanded="false"
        :show-title="false"
        :show-bottom-bar="false"
        :show-publish-actions="false"
        :show-markdown-hint="false"
        placeholder=""
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
    </div>
    <p v-else class="fsp-max-hint">正在放大编辑…</p>

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
      :aria-label="header || '面板放大编辑'"
      @click.self="onCloseMaximize"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ header || '编辑面板' }}</h3>
          <div class="pm-actions">
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
          <input
            class="fsp-topic fsp-topic--max"
            :style="{ color: palette.topic }"
            :value="topicShown"
            :placeholder="topicPlaceholder"
            maxlength="32"
            aria-label="内容主题"
            @click.stop
            @mousedown.stop
            @focus="onTopicFocus"
            @input="onTopicInput"
            @blur="commitTopic"
            @keydown.enter.prevent="onTopicEnter"
          />
          <RichTextEditor
            class="pm-rte"
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
.fsp {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex: 1;
  background: var(--fsp-body);
  overflow: hidden;
  cursor: pointer;
  box-sizing: border-box;
}

.fsp.selected,
.fsp.is-source-max {
  box-shadow: inset 0 0 0 2px var(--cv-select, rgba(28, 76, 124, 0.72));
}

.fsp-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 40px;
  padding: 8px 36px;
  background: var(--fsp-header);
  color: #fff;
  box-sizing: border-box;
}

.fsp--compact .fsp-header {
  min-height: 32px;
  padding: 5px 32px;
}

.fsp-title {
  margin: 0;
  max-width: 100%;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.3;
  text-align: center;
  color: #fff;
  text-shadow: var(--cv-header-shadow, 0 1px 1px rgba(0, 0, 0, 0.34), 0 0 1px rgba(0, 0, 0, 0.28));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fsp--compact .fsp-title {
  font-size: 12.5px;
  letter-spacing: 0.01em;
}

.fsp-actions {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
}

.fsp-actions .pm-max-btn,
.fsp-float-max {
  width: 22px;
  height: 22px;
}

.fsp-float-max {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 3;
}

.fsp-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fsp-topic {
  flex-shrink: 0;
  width: calc(100% - 28px);
  margin: 10px 14px 0;
  padding: 0 0 4px;
  border: none;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--fsp-topic);
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-align: left;
  outline: none;
  box-sizing: border-box;
  cursor: text;
}

.fsp--compact .fsp-topic {
  margin: 6px 10px 0;
  width: calc(100% - 20px);
  font-size: 13px;
}

.fsp--fill .fsp-topic {
  width: calc(100% - 40px);
  margin-right: 28px;
}

.fsp-topic::placeholder {
  color: var(--fsp-topic);
  opacity: 0.45;
  font-weight: 600;
}

.fsp-topic:hover,
.fsp-topic:focus {
  border-bottom-color: currentColor;
}

.fsp-topic--max {
  width: auto;
  margin: 12px 16px 8px;
  padding: 2px 2px 6px;
  color: var(--fsp-topic, #3c4043);
}

.fsp-rte {
  flex: 1 1 auto;
  min-height: 0;
}

.fsp-rte:not(:focus-within) :deep(.rte-toolbar) {
  display: none;
}

.fsp :deep(.rte-root) {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  height: 100%;
}

.fsp :deep(.rte-canvas) {
  padding: 4px 12px 8px;
  background: transparent;
  min-height: 0;
}

.fsp--compact :deep(.rte-canvas) {
  padding: 2px 10px 6px;
}

.fsp :deep(.rte-body),
.fsp :deep(.ProseMirror) {
  min-height: 48px;
  font-size: 14px;
  line-height: 1.65;
  color: #202124;
}

.fsp :deep(.ProseMirror p.is-editor-empty:first-child::before),
.fsp :deep(.ProseMirror p.is-empty:first-child::before) {
  content: none;
}

.fsp :deep(.pa-root) {
  background: transparent;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.fsp :deep(.pa-head) {
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 0;
  row-gap: 2px;
}

.fsp :deep(.pa-title) {
  white-space: nowrap;
}

.fsp--compact :deep(.pa-root) {
  padding: 3px 6px 4px;
}

.fsp--compact :deep(.pa-title) {
  flex: 1 0 auto;
  font-size: 10px;
}

.fsp--compact :deep(.pa-actions) {
  flex-wrap: wrap;
  gap: 2px;
}

.fsp--compact :deep(.pa-btn) {
  padding: 0 4px;
  font-size: 10px;
  line-height: 1.5;
}

.fsp :deep(.pa-empty) {
  display: none;
}

.fsp-max-hint {
  flex: 1;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 8px 12px;
  color: var(--cv-muted, #5f6368);
  font-size: 12px;
  font-weight: 550;
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
