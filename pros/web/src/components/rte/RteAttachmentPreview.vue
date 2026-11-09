<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import {
  attachmentDisplayName,
  docxPlainText,
  downloadAttachment,
  loadAttachment,
  type LoadedAttachment,
} from '../../utils/rteAttachment'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteAttachmentPreview 必须放在 RichTextEditor 里')

const loading = ref(false)
const error = ref('')
const text = ref('')
const objectUrl = ref('')
const loaded = ref<LoadedAttachment | null>(null)

const target = computed(() => rte.attachmentPreview as { href: string; name: string } | null)
const open = computed(() => !!target.value)
const kind = computed(() => loaded.value?.kind || 'file')
const fileName = computed(() => attachmentDisplayName(loaded.value?.name || target.value?.name || ''))

let objectOwned = ''

function releaseObject() {
  if (!objectOwned) return
  URL.revokeObjectURL(objectOwned)
  objectOwned = ''
  objectUrl.value = ''
}

function close() {
  rte.closeAttachmentPreview()
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
  error.value = ''
  if (!next?.href) return
  loading.value = true
  try {
    const file = await loadAttachment(next.href, next.name)
    if (rte.attachmentPreview?.href !== next.href) return
    loaded.value = file
    if (file.kind === 'text') text.value = await file.blob.text()
    else if (file.kind === 'docx') text.value = await docxPlainText(file.blob)
    else if (file.kind === 'image' || file.kind === 'pdf') {
      objectOwned = URL.createObjectURL(file.blob)
      objectUrl.value = objectOwned
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
          <pre v-else-if="kind === 'text' || kind === 'docx'">{{ text || '这份文档里没有可预览的文字，可以下载原文件。' }}</pre>
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
  width: min(860px, 100%);
  height: min(640px, 100%);
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
</style>
