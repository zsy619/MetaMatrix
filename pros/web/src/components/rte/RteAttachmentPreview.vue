<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import {
  attachmentDisplayName,
  downloadAttachment,
  loadAttachment,
  type LoadedAttachment,
} from '../../utils/rteAttachment'
import { previewDoc, previewDocx, previewSheets, type SheetPreview } from '../../utils/rteOfficePreview'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteAttachmentPreview 必须放在 RichTextEditor 里')

const loading = ref(false)
const error = ref('')
const text = ref('')
const html = ref('')
const sheets = ref<SheetPreview[]>([])
const sheetIndex = ref(0)
const objectUrl = ref('')
const loaded = ref<LoadedAttachment | null>(null)

const target = computed(() => rte.attachmentPreview as { href: string; name: string } | null)
const open = computed(() => !!target.value)
const kind = computed(() => loaded.value?.kind || 'file')
const fileName = computed(() => attachmentDisplayName(loaded.value?.name || target.value?.name || ''))

let objectOwned = ''

function objectType(kind: LoadedAttachment['kind'], mime: string): string {
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'image') return mime.startsWith('image/') ? mime : 'image/png'
  return mime || 'application/octet-stream'
}

async function openObject(blob: Blob, type: string) {
  const typed = blob.type === type ? blob : new Blob([await blob.arrayBuffer()], { type })
  objectOwned = URL.createObjectURL(typed)
  objectUrl.value = objectOwned
}

function releaseObject() {
  if (!objectOwned) return
  URL.revokeObjectURL(objectOwned)
  objectOwned = ''
  objectUrl.value = ''
}

function close() {
  rte?.closeAttachmentPreview()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function onDownload() {
  if (!loaded.value) return
  downloadAttachment(loaded.value.blob, loaded.value.name)
}

watch(open, (isOpen) => {
  if (isOpen) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

watch(target, async (next) => {
  releaseObject()
  loaded.value = null
  text.value = ''
  html.value = ''
  sheets.value = []
  sheetIndex.value = 0
  error.value = ''
  if (!next?.href) return
  loading.value = true
  try {
    const file = await loadAttachment(next.href, next.name)
    if (rte.attachmentPreview?.href !== next.href) return
    loaded.value = file
    if (file.kind === 'text') text.value = await file.blob.text()
    else if (file.kind === 'docx') html.value = await previewDocx(file.blob)
    else if (file.kind === 'doc') html.value = await previewDoc(file.blob)
    else if (file.kind === 'sheet') {
      sheets.value = await previewSheets(file.blob)
      html.value = sheets.value[0]?.html || ''
    } else if (file.kind === 'image' || file.kind === 'pdf') {
      await openObject(file.blob, objectType(file.kind, file.mime))
      if (rte.attachmentPreview?.href !== next.href) releaseObject()
    }
  } catch (err) {
    if (rte.attachmentPreview?.href === next.href) {
      error.value = err instanceof Error ? err.message : '无法预览附件'
    }
  } finally {
    if (rte.attachmentPreview?.href === next?.href) loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  releaseObject()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="rte-attach-preview"
      role="dialog"
      aria-modal="true"
      :aria-label="`预览 ${fileName}`"
      @click.self="close"
    >
      <div class="rte-attach-preview-card">
        <header class="rte-attach-preview-head">
          <h3>{{ fileName }}</h3>
          <div class="rte-attach-preview-actions">
            <button type="button" :disabled="!loaded" @click="onDownload">下载</button>
            <button type="button" aria-label="关闭预览" @click="close">关闭</button>
          </div>
        </header>
        <div class="rte-attach-preview-body">
          <p v-if="loading" class="rte-attach-preview-status">正在打开附件…</p>
          <p v-else-if="error" class="rte-attach-preview-status is-error">{{ error }}</p>
          <img v-else-if="kind === 'image' && objectUrl" :src="objectUrl" :alt="fileName" />
          <iframe v-else-if="kind === 'pdf' && objectUrl" :src="objectUrl" :title="fileName"></iframe>
          <div v-else-if="kind === 'sheet'" class="rte-attach-sheet">
            <div v-if="sheets.length > 1" class="rte-attach-sheet-tabs" role="tablist">
              <button
                v-for="(sheet, index) in sheets"
                :key="sheet.name"
                type="button"
                role="tab"
                :class="{ active: index === sheetIndex }"
                :aria-selected="index === sheetIndex"
                @click="sheetIndex = index"
              >
                {{ sheet.name }}
              </button>
            </div>
            <div
              v-if="sheets[sheetIndex]"
              class="rte-attach-sheet-table"
              v-html="sheets[sheetIndex].html"
            ></div>
            <p v-else class="rte-attach-preview-status">这张表里没有可预览的内容，可以下载原文件。</p>
          </div>
          <div
            v-else-if="(kind === 'docx' || kind === 'doc') && html"
            class="rte-attach-doc"
            v-html="html"
          ></div>
          <pre v-else-if="kind === 'text'">{{ text || '这份文档里没有可预览的文字，可以下载原文件。' }}</pre>
          <p v-else-if="kind === 'docx' || kind === 'doc'" class="rte-attach-preview-status">
            这份文档里没有可预览的文字，可以下载原文件。
          </p>
          <p v-else class="rte-attach-preview-status">此格式请下载后查看。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rte-attach-preview {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}
.rte-attach-preview-card {
  width: min(960px, 100%);
  height: min(720px, 100%);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
  overflow: hidden;
}
.rte-attach-preview-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e6eb;
}
.rte-attach-preview-head h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rte-attach-preview-actions {
  display: flex;
  gap: 8px;
}
.rte-attach-preview-actions button {
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 13px;
  color: #1d2129;
  cursor: pointer;
}
.rte-attach-preview-actions button:first-child {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}
.rte-attach-preview-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}
.rte-attach-preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: #f7f8fa;
}
.rte-attach-preview-body img,
.rte-attach-preview-body iframe {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 420px;
  border: 0;
  background: #fff;
}
.rte-attach-preview-body pre {
  margin: 0;
  padding: 16px;
  min-height: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  background: #fff;
  border-radius: 8px;
  color: #1d2129;
  font: 14px/1.7 ui-sans-serif, system-ui, sans-serif;
}
.rte-attach-preview-status {
  margin: 48px 0;
  text-align: center;
  color: #4e5969;
}
.rte-attach-preview-status.is-error {
  color: #f53f3f;
}
.rte-attach-doc,
.rte-attach-sheet-table {
  min-height: 100%;
  padding: 20px 24px;
  background: #fff;
  border-radius: 8px;
  color: #1d2129;
  font: 15px/1.75 ui-sans-serif, system-ui, sans-serif;
  box-sizing: border-box;
}
.rte-attach-doc :deep(h1),
.rte-attach-doc :deep(h2),
.rte-attach-doc :deep(h3) {
  margin: 1.1em 0 0.4em;
  line-height: 1.35;
}
.rte-attach-doc :deep(p) {
  margin: 0.4em 0;
}
.rte-attach-doc :deep(table),
.rte-attach-sheet-table :deep(table) {
  border-collapse: collapse;
  width: max-content;
  max-width: 100%;
  margin: 8px 0;
}
.rte-attach-doc :deep(td),
.rte-attach-doc :deep(th),
.rte-attach-sheet-table :deep(td),
.rte-attach-sheet-table :deep(th) {
  border: 1px solid #e5e6eb;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.rte-attach-doc :deep(img) {
  max-width: 100%;
  height: auto;
}
.rte-attach-sheet-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  overflow-x: auto;
}
.rte-attach-sheet-tabs button {
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  white-space: nowrap;
}
.rte-attach-sheet-tabs button.active {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}
</style>
