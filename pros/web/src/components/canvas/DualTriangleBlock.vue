<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DualTriangleBlock, DualTriangleBlockId } from '../../types/canvas'
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
    block: DualTriangleBlock
    /**
     * 是否显示右上角「+」新增段落按钮。
     * 使用 RichTextEditor 时应为 false（默认）。
     */
    showAdd?: boolean
    /**
     * card：双三角几何画布上的色条卡片。
     * table：人类-AI 3×2 画布单元格（A/H 色条抬头、角标、默认可编辑空白区）。
     */
    variant?: 'card' | 'table'
  }>(),
  { showAdd: false, variant: 'card' },
)

const isTable = computed(() => props.variant === 'table')

/** 内容区主题词的默认引导（可被 keyword 覆盖） */
const TOPIC_PLACEHOLDER: Record<DualTriangleBlockId, string> = {
  scenario: '起点',
  aesthetics: '终点',
  system: '过程',
  data: '资产',
  basics: '能力',
  innovation: '创新',
}

const TABLE_TOPIC: Record<DualTriangleBlockId, string> = {
  scenario: '场景',
  aesthetics: '审美',
  system: '体系',
  data: '数据',
  basics: '基本功',
  innovation: '创造力',
}

function topicFromTitle(title: string): string {
  return title
    .replace(/❤|❤️/g, '')
    .replace(/^[AHＡＨ]\s*[.．]\s*/i, '')
    .replace(/^(起点|终点|过程|资产|能力|创新)\s*[：:]\s*/, '')
    .trim()
}

/** 格子正文里的主题词（起点 / 终点等），存在 keyword，可编辑 */
const contentTopic = computed(() =>
  (props.block.keyword || '').replace(/❤|❤️/g, '').trim(),
)
const topicPlaceholder = computed(
  () => TOPIC_PLACEHOLDER[props.block.id] || '内容主题',
)
const topicDraft = ref<string | null>(null)
const topicShown = computed(() => topicDraft.value ?? contentTopic.value)

const tableTitle = computed(() => {
  const topic =
    topicFromTitle(props.block.title) ||
    TABLE_TOPIC[props.block.id] ||
    props.block.title
  const prefix = props.block.side === 'ai' ? 'A.' : 'H.'
  return `${prefix} ${topic}`
})

const headerTitle = computed(() =>
  isTable.value ? tableTitle.value : props.block.title,
)

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

const headerColor = computed(() => props.block.accentColor)
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

function onTopicFocus() {
  topicDraft.value = contentTopic.value
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
    class="dt-block"
    :class="[
      `side-${block.side}`,
      {
        selected,
        'is-source-max': isMaximized,
        'dt-block--table': isTable,
      },
    ]"
    :style="
      isTable
        ? undefined
        : { '--accent': headerColor, backgroundColor: block.backgroundColor }
    "
    @click.stop="onSelectBlock"
  >
    <div
      class="dt-block-header"
      :style="isTable ? undefined : { backgroundColor: headerColor }"
    >
      <h3 class="dt-block-title">{{ headerTitle }}</h3>
      <div class="dt-block-actions">
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

    <p v-if="!isTable" class="dt-block-subtitle">{{ block.subtitle }}</p>

    <div v-if="!isMaximized" class="dt-block-body">
      <input
        v-if="isTable"
        class="dt-content-topic"
        :class="block.side === 'ai' ? 'side-ai' : 'side-human'"
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
        class="dt-rte"
        compact
        :expanded="false"
        :show-title="false"
        :show-bottom-bar="!isTable"
        :show-publish-actions="false"
        :show-markdown-hint="!isTable"
        :placeholder="isTable ? '' : '请输入正文'"
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
    </div>
    <p v-else class="dt-empty dt-max-hint">正在放大编辑…</p>

    <PanelAttachments
      v-if="!isMaximized"
      :panel-id="maximizeKey"
      compact
    />

    <div v-if="!isTable" class="dt-watermark" aria-hidden="true">
      <svg
        v-if="block.watermarkIcon === 'human'"
        class="wm-icon"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path
          d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
        />
      </svg>
      <svg v-else class="wm-icon" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2a2 2 0 0 1 2 2v1h2a3 3 0 0 1 3 3v2h1a1 1 0 1 1 0 2h-1v2a3 3 0 0 1-3 3h-2v1a2 2 0 1 1-4 0v-1H8a3 3 0 0 1-3-3v-2H4a1 1 0 1 1 0-2h1V8a3 3 0 0 1 3-3h2V4a2 2 0 0 1 2-2zm-3 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
        />
      </svg>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isMaximized"
      class="pm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="headerTitle || '面板放大编辑'"
      @click.self="onCloseMaximize"
    >
      <div class="pm-card" @click.stop>
        <div class="pm-header">
          <h3 class="pm-title">{{ headerTitle || '编辑面板' }}</h3>
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
          <input
            v-if="isTable"
            class="dt-content-topic dt-content-topic--max"
            :class="block.side === 'ai' ? 'side-ai' : 'side-human'"
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
.dt-block {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  cursor: pointer;
  box-sizing: border-box;
  transition: box-shadow 0.15s ease;
}

.dt-block.selected {
  box-shadow: inset 0 0 0 2px rgba(26, 115, 232, 0.55),
    0 2px 10px rgba(0, 0, 0, 0.06);
}

.dt-block.is-source-max {
  box-shadow: inset 0 0 0 2px rgba(26, 115, 232, 0.35),
    0 2px 10px rgba(0, 0, 0, 0.06);
}

.dt-block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 12px;
  color: #fff;
}

.dt-block-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.dt-block-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.add-item-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px dashed rgba(255, 255, 255, 0.75);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.add-item-btn:hover {
  background: rgba(255, 255, 255, 0.35);
}

.dt-block-actions .pm-max-btn {
  width: 22px;
  height: 22px;
}

.dt-block-subtitle {
  margin: 0;
  padding: 8px 12px 4px;
  font-size: 11px;
  line-height: 1.45;
  color: #5f6368;
  flex-shrink: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dt-block-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 10px 12px;
  position: relative;
  z-index: 2;
  scrollbar-gutter: stable;
}

.dt-block-body::-webkit-scrollbar {
  width: 6px;
}

.dt-block-body::-webkit-scrollbar-thumb {
  background: rgba(95, 99, 104, 0.45);
  border-radius: 999px;
}

.dt-block-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dt-block-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: text;
}

.dt-block-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.dt-block-item.item-selected {
  border-color: rgba(26, 115, 232, 0.65);
  background: rgba(232, 240, 254, 0.75);
  box-shadow: 0 0 0 1px rgba(26, 115, 232, 0.2);
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

.dt-empty {
  margin: 0;
  padding: 8px 2px;
  font-size: 12px;
  color: #b0b4b8;
  line-height: 1.45;
}

.dt-max-hint {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  color: #1a73e8;
  font-weight: 550;
  z-index: 2;
}

.dt-watermark {
  position: absolute;
  right: 10px;
  bottom: 6px;
  opacity: 0.12;
  pointer-events: none;
  z-index: 0;
  color: var(--accent, #999);
}

.wm-icon {
  width: 56px;
  height: 56px;
}

.side-human .dt-watermark {
  color: #c4a574;
}

.side-ai .dt-watermark {
  color: #5ba8a0;
}

.dt-block-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.dt-rte {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 2;
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

/* 表格式单元格：A/H 色条抬头，内容区第一行是可编辑主题词，其下为空白正文 */
.dt-block--table {
  --hai-header: #5ecfc4;
  --hai-body: #e7f8f6;
  --hai-badge: #2f9d94;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: var(--hai-body);
}

.dt-block--table.side-ai {
  --hai-header: #5ecfc4;
  --hai-body: #e7f8f6;
  --hai-badge: #2f9d94;
}

.dt-block--table.side-human {
  --hai-header: #f0d35e;
  --hai-body: #fff8e6;
  --hai-badge: #a88420;
}

.dt-block--table.selected,
.dt-block--table.is-source-max {
  box-shadow: inset 0 0 0 2px rgba(26, 115, 232, 0.45);
}

.dt-block--table .dt-block-header {
  position: relative;
  justify-content: center;
  min-height: 46px;
  padding: 10px 40px;
  background: var(--hai-header);
  color: #fff;
}

.dt-block--table .dt-block-title {
  flex: none;
  max-width: 100%;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.14);
}

.dt-block--table .dt-block-actions {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
}

.dt-block--table .dt-block-body {
  position: relative;
  padding: 0;
  background: transparent;
}

.dt-content-topic {
  flex-shrink: 0;
  width: calc(100% - 28px);
  margin: 14px 14px 0;
  padding: 0 0 6px;
  border: none;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.04em;
  line-height: 1.4;
  text-align: left;
  outline: none;
  box-sizing: border-box;
  cursor: text;
}

.dt-content-topic.side-ai {
  color: #2f9d94;
}

.dt-content-topic.side-human {
  color: #a88420;
}

.dt-content-topic::placeholder {
  color: inherit;
  opacity: 0.45;
  font-weight: 600;
}

.dt-content-topic:hover,
.dt-content-topic:focus {
  border-bottom-color: currentColor;
}

.dt-content-topic--max {
  width: auto;
  margin: 12px 16px 8px;
  padding: 2px 2px 6px;
}

.dt-block--table :deep(.rte-root) {
  border: none;
  border-radius: 0;
  background: transparent;
}

.dt-block--table .dt-rte:not(:focus-within) :deep(.rte-toolbar) {
  display: none;
}

.dt-block--table .dt-rte :deep(.rte-canvas) {
  padding: 6px 14px 10px;
  background: transparent;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dt-block--table .dt-rte :deep(.rte-body) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dt-block--table .dt-rte :deep(.tiptap),
.dt-block--table .dt-rte :deep(.ProseMirror) {
  font-size: 14px;
  line-height: 1.7;
  color: #202124;
  flex: 1 1 auto;
  min-height: 120px;
  height: 100%;
}

.dt-block--table :deep(.ProseMirror p) {
  margin: 0.15em 0;
}

.dt-block--table :deep(.pa-root) {
  background: transparent;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 3px;
  padding-bottom: 4px;
}

.dt-block--table :deep(.pa-head) {
  margin-bottom: 0;
}

/* 空态只留「相关资料」和添加入口，把格子留给参考图里的空白填写区 */
.dt-block--table :deep(.pa-empty) {
  display: none;
}

</style>

<style>
.pm-body .pm-subtitle {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  color: #5f6368;
}
</style>
