<script setup lang="ts">
/**
 * 画布区域编辑器：参考图里的静态标签由外层 SVG 绘制，
 * 这里只负责「用户可填写的那一块」——一个贴着标签的小输入区，
 * 支持放大（完整富文本）+ 挂相关资料，内容写回当前画布 JSON。
 *
 * 行内输入用轻量 contenteditable（区域很小，塞不下富文本工具栏）；
 * 放大弹窗里才挂完整的 RichTextEditor（与其它画布面板一致）。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { QuadrantItem } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import {
  panelMaximizeKey,
  usePanelMaximize,
} from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import PanelAttachments from './PanelAttachments.vue'
import { isEmptyHtml, itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'

const props = withDefaults(
  defineProps<{
    /** 区域 id（对应 doc.blocks[].id） */
    blockId: string
    /** 区域标题（仅用于无障碍标签与放大弹窗标题） */
    title: string
    /** 区域正文条目 */
    items: QuadrantItem[]
    placeholder?: string
  }>(),
  { placeholder: '填写内容…' },
)

const documentStore = useDocumentStore()

const maximizeKey = computed(() => panelMaximizeKey('block', props.blockId))
const { isMaximized, toggleMaximize, closeMaximize } =
  usePanelMaximize(maximizeKey)

const editorHtml = computed(() => itemsToHtml(props.items))
const isBlank = computed(() => isEmptyHtml(editorHtml.value))

/* ---- 行内输入 ---- */
const inputEl = ref<HTMLElement | null>(null)

function syncInputHtml() {
  const el = inputEl.value
  if (!el) return
  if (el.innerHTML !== editorHtml.value) el.innerHTML = editorHtml.value
}

onMounted(() => {
  nextTick(syncInputHtml)
})

watch(editorHtml, () => {
  // 正在输入时不要回写 DOM，否则光标会被重置
  const el = inputEl.value
  if (el && document.activeElement === el) return
  syncInputHtml()
})

function onInput() {
  const el = inputEl.value
  if (!el) return
  syncItemsFromHtml(props.items, el.innerHTML, {
    update: (id, text) => {
      documentStore.updateBlockItem(props.blockId, id, { text })
    },
    add: (text) => {
      documentStore.addBlockItem(props.blockId, { text })
    },
    remove: (id) => {
      documentStore.removeBlockItem(props.blockId, id)
    },
  })
}

function onKeydown(event: KeyboardEvent) {
  // 区域里只写纯文本段落：回车不产生新块，粘贴也只取纯文本
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    return
  }
  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault()
    const el = inputEl.value
    if (!el) return
    document.execCommand('insertLineBreak')
  }
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
}

/* ---- 放大编辑 ---- */
function onToggleMaximize(event: MouseEvent) {
  event.stopPropagation()
  toggleMaximize()
}

function onCloseMaximize(event?: Event) {
  event?.stopPropagation()
  closeMaximize()
}
</script>

<template>
  <div
    class="region-editor"
    :class="{ 'is-max': isMaximized }"
    :data-region-id="blockId"
    :aria-label="title"
  >
    <div class="region-toolbar">
      <button
        type="button"
        class="region-max-btn"
        :title="`放大编辑${title}`"
        :aria-label="`放大编辑${title}`"
        @click="onToggleMaximize"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <rect
            x="2.5"
            y="2.5"
            width="11"
            height="11"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          />
        </svg>
      </button>
    </div>

    <div
      ref="inputEl"
      class="region-input"
      :class="{ 'is-blank': isBlank }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="`${title}内容`"
      :data-placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
    />

    <Teleport to="body">
      <div
        v-if="isMaximized"
        class="pm-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="title || '区域放大编辑'"
        @click.self="onCloseMaximize"
      >
        <div class="pm-card" @click.stop>
          <div class="pm-header">
            <h3 class="pm-title">{{ title || '编辑区域' }}</h3>
            <div class="pm-actions">
              <button
                type="button"
                class="pm-icon-btn"
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
              :compact="false"
              :expanded="true"
              :show-title="false"
              :show-bottom-bar="true"
              :show-publish-actions="false"
              :placeholder="placeholder"
              :model-value="editorHtml"
              @update:model-value="
                (html: string) =>
                  syncItemsFromHtml(props.items, html, {
                    update: (i, text) =>
                      documentStore.updateBlockItem(props.blockId, i, { text }),
                    add: (text) =>
                      documentStore.addBlockItem(props.blockId, { text }),
                    remove: (i) =>
                      documentStore.removeBlockItem(props.blockId, i),
                  })
              "
            />
          </div>
          <PanelAttachments :panel-id="maximizeKey" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.region-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 7px;
  border: 1px dashed rgba(60, 64, 67, 0.22);
  background: rgba(255, 255, 255, 0.66);
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.region-editor:hover,
.region-editor:focus-within {
  border-color: var(--cv-focus, #1c4c7c);
  border-style: solid;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.region-editor.is-max {
  border-style: solid;
}

.region-toolbar {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  opacity: 0.72;
  transition: opacity 0.15s ease;
}

.region-editor:hover .region-toolbar,
.region-editor:focus-within .region-toolbar {
  opacity: 1;
}

.region-max-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.95);
  color: #5f6368;
  cursor: pointer;
}

.region-max-btn:hover {
  border-color: var(--cv-focus, #1c4c7c);
  color: var(--cv-focus, #1c4c7c);
}

.region-input {
  min-height: 32px;
  box-sizing: border-box;
  padding: 6px 26px 6px 8px;
  font-size: 14px;
  line-height: 1.5;
  color: #3c4043;
  outline: none;
  word-break: break-word;
  max-height: 86px;
  overflow-y: auto;
}

.region-input:empty::before,
.region-input.is-blank::before {
  content: attr(data-placeholder);
  color: #5c564c;
  pointer-events: none;
}

.region-input.is-blank :deep(p) {
  display: none;
}

.region-input.is-blank {
  max-height: 32px;
  white-space: nowrap;
}

.region-input.is-blank::before {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行内内容是运行时写进去的 HTML，没有 scope 属性，这里必须用 :deep */
.region-input :deep(p),
.region-input :deep(div) {
  margin: 0 0 2px;
}

.region-input :deep(p:first-child),
.region-input :deep(div:first-child) {
  margin-top: 0;
}

.region-input :deep(p:last-child),
.region-input :deep(div:last-child) {
  margin-bottom: 0;
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
