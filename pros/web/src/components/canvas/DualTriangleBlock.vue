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

/**
 * 表格式六格各自一色：AI 侧偏冷（青绿 / 蓝 / 绿），人类侧偏暖（金 / 铜 / 玫红）。
 * 抬头用 header，内容区用 body，主题词用 topic。
 */
const TABLE_PALETTE: Record<
  DualTriangleBlockId,
  { header: string; body: string; topic: string }
> = {
  scenario: { header: '#0E8A84', body: '#E5F6F5', topic: '#0B6B66' },
  aesthetics: { header: '#A67C00', body: '#FBF6E4', topic: '#7A5C00' },
  system: { header: '#B85A38', body: '#FBF1EB', topic: '#8A4024' },
  data: { header: '#2A649F', body: '#E8F1FA', topic: '#1C4C7C' },
  basics: { header: '#187A4E', body: '#E7F6EF', topic: '#125C3B' },
  innovation: { header: '#A84562', body: '#FBEFF2', topic: '#84344C' },
}

const tablePalette = computed(() => TABLE_PALETTE[props.block.id])
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
        ? {
            '--hai-header': tablePalette.header,
            '--hai-body': tablePalette.body,
            '--hai-topic': tablePalette.topic,
          }
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
        :style="{ color: tablePalette.topic }"
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
        :show-markdown-hint="false"
        :placeholder="isTable ? '' : '点击填写…'"
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
      <div v-if="!isTable" class="dt-watermark" aria-hidden="true">
        <svg
          v-if="block.watermarkIcon === 'human'"
          class="wm-icon"
          viewBox="0 0 80 80"
          fill="currentColor"
        >
          <circle cx="40" cy="24" r="13" />
          <path d="M14 70.5c1.8-17.5 11-24.5 26-24.5s24.2 7 26 24.5H14z" />
        </svg>
        <svg v-else class="wm-icon" viewBox="0 0 80 80" fill="currentColor">
          <circle cx="40" cy="9" r="3.4" />
          <rect x="38.1" y="11.2" width="3.8" height="8" rx="1.4" />
          <rect x="14" y="19" width="52" height="38" rx="11" />
          <circle cx="29" cy="36" r="4.2" fill="#fff" />
          <circle cx="51" cy="36" r="4.2" fill="#fff" />
          <rect x="26" y="59" width="28" height="11" rx="4.5" />
        </svg>
      </div>
    </div>
    <p v-else class="dt-empty dt-max-hint">正在放大编辑…</p>

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
            :style="{ color: tablePalette.topic }"
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
          <p v-if="!isTable && block.subtitle" class="pm-subtitle">
            {{ block.subtitle }}
          </p>
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
  padding: 4px 8px 6px;
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
  right: 4px;
  bottom: 0;
  opacity: 0.14;
  pointer-events: none;
  z-index: 0;
  color: var(--accent, #c9a14a);
}

.wm-icon {
  width: 78px;
  height: 78px;
  display: block;
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

/* 表格式单元格：每格独立配色（变量由 TABLE_PALETTE 写入） */
.dt-block--table {
  --hai-header: #0e8a84;
  --hai-body: #e5f6f5;
  --hai-topic: #0b6b66;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: var(--hai-body);
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

/* 经典双三角卡片：暖金 / 青绿描边，白底编辑区，工具条聚焦后出现 */
.dt-block:not(.dt-block--table) {
  border-radius: 2px;
  border: 1.5px solid var(--accent, #c9a14a);
  box-shadow: none;
  background: #fff;
}

.dt-block:not(.dt-block--table).selected,
.dt-block:not(.dt-block--table).is-source-max {
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.42);
}

.dt-block:not(.dt-block--table) .dt-block-header {
  padding: 8px 10px 7px;
}

.dt-block:not(.dt-block--table) .dt-block-title {
  font-size: clamp(13px, 1.15vw, 16px);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.dt-block:not(.dt-block--table) .dt-block-subtitle {
  padding: 8px 12px 0;
  font-size: 12px;
  line-height: 1.45;
  color: #8b9096;
  -webkit-line-clamp: 3;
}

.dt-block:not(.dt-block--table) :deep(.rte-root) {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.dt-block:not(.dt-block--table):not(:focus-within) :deep(.rte-toolbar),
.dt-block:not(.dt-block--table):not(:focus-within) :deep(.rte-bottom) {
  display: none;
}

.dt-block:not(.dt-block--table) :deep(.rte-canvas) {
  padding: 2px 8px 4px;
  background: transparent;
}

.dt-block:not(.dt-block--table) :deep(.pa-root.compact) {
  background: transparent;
  border-top: 1px solid color-mix(in srgb, var(--accent) 32%, #e4e6e8);
  padding: 4px 8px 5px;
}

.dt-block:not(.dt-block--table) .dt-watermark {
  opacity: 0.13;
}

.dt-block:not(.dt-block--table) .wm-icon {
  width: 84px;
  height: 84px;
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
