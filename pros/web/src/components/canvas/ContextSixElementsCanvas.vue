<script setup lang="ts">
/**
 * 上下文六要素（富文本编辑器画布）。
 *
 * 画布正文就是一块富文本：新建时按 src/utils/contextSixElements.ts 的规格
 * 带出六段（二级标题 + 一行占位文字），用户直接在这块富文本里编辑，
 * 内容通过通用 block store 通道（updateBlockItem / addBlockItem / removeBlockItem）
 * 写回文档 JSON，随文档保存、重开仍在。
 */
import { computed, onMounted } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { ContextSixElementsDocumentJSON } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { useSelectionStore } from '../../stores/selection'
import { panelMaximizeKey } from '../../composables/usePanelMaximize'
import RichTextEditor from '../RichTextEditor.vue'
import { itemsToHtml, syncItemsFromHtml } from '../../utils/itemsHtml'
import {
  CONTEXT_SIX_ELEMENTS_BLOCK_ID,
  CONTEXT_SIX_ELEMENTS_SECTIONS,
} from '../../utils/contextSixElements'

const props = defineProps<{
  doc: ContextSixElementsDocumentJSON
}>()

const documentStore = useDocumentStore()
const selection = useSelectionStore()

/** 补齐缺失的正文块，保证画布一进来就有可编辑的富文本 */
documentStore.ensureContextSixElementsBlocks()

const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const panelId = panelMaximizeKey('block', CONTEXT_SIX_ELEMENTS_BLOCK_ID)

const block = computed(() => {
  const list = Array.isArray(props.doc.blocks) ? props.doc.blocks : []
  return (
    list.find((b) => b.id === CONTEXT_SIX_ELEMENTS_BLOCK_ID) ?? list[0] ?? null
  )
})

const editorHtml = computed(() => itemsToHtml(block.value?.items ?? []))

function onEditorHtml(html: string) {
  const current = block.value
  if (!current) return
  if (!Array.isArray(current.items)) current.items = []
  syncItemsFromHtml(current.items, html, {
    update: (id, text) => {
      documentStore.updateBlockItem(current.id, id, { text })
    },
    add: (text) => {
      documentStore.addBlockItem(current.id, { text })
    },
    remove: (id) => {
      documentStore.removeBlockItem(current.id, id)
    },
  })
}

function onEditorFocus() {
  if (block.value) selection.selectBlock(block.value.id)
}

onMounted(() => {
  documentStore.ensureContextSixElementsBlocks()
})
</script>

<template>
  <div class="cse-canvas" :style="chrome" aria-label="上下文六要素画布">
    <div class="cse-page">
      <header class="cse-head">
        <h2 class="cse-title">上下文六要素</h2>
        <p class="cse-hint">
          六段结构化上下文，直接在正文里填写：{{
            CONTEXT_SIX_ELEMENTS_SECTIONS.map((s) => s.title).join(' / ')
          }}
        </p>
      </header>

      <RichTextEditor
        class="cse-rte"
        :panel-id="panelId"
        :expanded="false"
        :page-sheet="false"
        :show-title="false"
        :show-bottom-bar="true"
        :show-publish-actions="false"
        :show-markdown-hint="false"
        placeholder="按六段结构填写上下文…"
        :model-value="editorHtml"
        @update:model-value="onEditorHtml"
        @focus="onEditorFocus"
      />
    </div>
  </div>
</template>

<style scoped>
.cse-canvas {
  position: absolute;
  inset: 0;
  z-index: 10;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 18px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.cse-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  margin: 0;
  padding: 22px 26px 18px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid var(--cv-frame, #ececec);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.cse-head {
  flex: none;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.cse-title {
  margin: 0;
  font-size: 22px;
  font-weight: 720;
  line-height: 1.3;
  color: var(--cv-ink-strong, #202124);
}

.cse-hint {
  margin: 6px 0 0;
  font-size: 15px;
  line-height: 1.6;
  color: #3c4043;
}

.cse-rte {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.cse-canvas :deep(.rte-root) {
  flex: 1 1 auto;
  min-height: 0;
  height: auto !important;
  max-height: none;
  border: none;
  border-radius: 0;
  background: transparent;
}

.cse-canvas :deep(.rte-workspace) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.cse-canvas :deep(.rte-canvas) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  overflow: auto;
  background: transparent;
}

.cse-canvas :deep(.rte-body) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
}

.cse-canvas :deep(.rte-body > .ProseMirror),
.cse-canvas :deep(.rte-body > .tiptap) {
  flex: 1 1 auto;
  min-height: 100%;
  box-sizing: border-box;
}

@media (max-width: 800px) {
  .cse-canvas {
    padding: 12px 10px 96px;
  }

  .cse-page {
    padding: 16px 14px 20px;
  }

  .cse-canvas :deep(.ProseMirror) {
    padding: 12px 12px 16px;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
}
</style>
