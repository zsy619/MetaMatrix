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
  overflow: auto;
  padding: 18px;
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui,
    sans-serif;
}

.cse-page {
  box-sizing: border-box;
  width: min(100%, 880px);
  margin: auto;
  padding: 22px 26px 30px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid var(--cv-frame, #ececec);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.cse-head {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.cse-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--cv-ink-strong, #202124);
}

.cse-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cv-muted, #5f6368);
}

.cse-rte {
  min-height: 420px;
}
</style>
