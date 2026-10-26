<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PanelAttachment } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import AttachmentPreviewModal from './AttachmentPreviewModal.vue'

const props = defineProps<{
  /** 与 maximize key 对齐：block:id / cell:pos / demand:legend / 或裸 blockId */
  panelId: string
  /** 紧凑模式（面板内嵌） */
  compact?: boolean
}>()

const documentStore = useDocumentStore()

const MAX_FILE_BYTES = 3 * 1024 * 1024

const fileInputRef = ref<HTMLInputElement | null>(null)
const showUrlForm = ref(false)
const urlDraft = ref('')
const nameDraft = ref('')
const errorMsg = ref('')
const previewTarget = ref<PanelAttachment | null>(null)

const list = computed(() => documentStore.getPanelAttachments(props.panelId))

function iconFor(att: PanelAttachment): string {
  const mime = (att.mimeType || '').toLowerCase()
  const name = att.name.toLowerCase()
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name))
    return '🖼'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📄'
  if (
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|json|csv|log)$/.test(name)
  )
    return '📝'
  if (att.kind === 'url') return '🔗'
  return '📎'
}

function onPickFile(event: MouseEvent) {
  event.stopPropagation()
  errorMsg.value = ''
  fileInputRef.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (file.size > MAX_FILE_BYTES) {
    errorMsg.value = `文件超过 3MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩后重试或改用链接`
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result || '')
    const att = documentStore.addPanelAttachment(props.panelId, {
      name: file.name,
      kind: 'file',
      mimeType: file.type || guessMime(file.name),
      size: file.size,
      dataUrl,
    })
    if (!att) {
      errorMsg.value = '添加失败：文档未加载'
    }
  }
  reader.onerror = () => {
    errorMsg.value = '读取文件失败'
  }
  reader.readAsDataURL(file)
}

function guessMime(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.svg')) return 'image/svg+xml'
  if (n.endsWith('.txt')) return 'text/plain'
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/markdown'
  if (n.endsWith('.json')) return 'application/json'
  if (n.endsWith('.csv')) return 'text/csv'
  return 'application/octet-stream'
}

function onToggleUrl(event: MouseEvent) {
  event.stopPropagation()
  errorMsg.value = ''
  showUrlForm.value = !showUrlForm.value
  if (!showUrlForm.value) {
    urlDraft.value = ''
    nameDraft.value = ''
  }
}

function onSubmitUrl(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  errorMsg.value = ''
  const raw = urlDraft.value.trim()
  if (!raw) {
    errorMsg.value = '请填写链接 URL'
    return
  }
  let normalized = raw
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`
  }
  try {
    // validate
    // eslint-disable-next-line no-new
    new URL(normalized)
  } catch {
    errorMsg.value = 'URL 格式无效'
    return
  }
  const name =
    nameDraft.value.trim() ||
    (() => {
      try {
        const u = new URL(normalized)
        return u.hostname + (u.pathname === '/' ? '' : u.pathname)
      } catch {
        return normalized
      }
    })()

  const att = documentStore.addPanelAttachment(props.panelId, {
    name,
    kind: 'url',
    url: normalized,
    mimeType: 'text/uri-list',
  })
  if (!att) {
    errorMsg.value = '添加失败：文档未加载'
    return
  }
  urlDraft.value = ''
  nameDraft.value = ''
  showUrlForm.value = false
}

function onPreview(event: MouseEvent, att: PanelAttachment) {
  event.stopPropagation()
  previewTarget.value = att
}

function onRemove(event: MouseEvent, id: string) {
  event.stopPropagation()
  documentStore.removePanelAttachment(props.panelId, id)
}

function closePreview() {
  previewTarget.value = null
}
</script>

<template>
  <div
    class="pa-root"
    :class="{ compact }"
    @click.stop
  >
    <div class="pa-head">
      <span class="pa-title">相关资料</span>
      <div class="pa-actions">
        <button
          type="button"
          class="pa-btn"
          title="添加本地文件（≤3MB）"
          @click="onPickFile"
        >
          + 添加文件
        </button>
        <button
          type="button"
          class="pa-btn"
          title="添加外链"
          @click="onToggleUrl"
        >
          + 添加链接
        </button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      class="pa-file-input"
      accept="image/*,.pdf,.txt,.md,.markdown,.json,.csv,text/plain,application/pdf"
      @change="onFileChange"
    />

    <form
      v-if="showUrlForm"
      class="pa-url-form"
      @submit="onSubmitUrl"
    >
      <input
        v-model="urlDraft"
        class="pa-input"
        type="url"
        placeholder="https://…"
        maxlength="2048"
        required
      />
      <input
        v-model="nameDraft"
        class="pa-input"
        type="text"
        placeholder="显示名称（可选）"
        maxlength="120"
      />
      <button type="submit" class="pa-btn pa-btn-primary">添加</button>
      <button type="button" class="pa-btn" @click="onToggleUrl">取消</button>
    </form>

    <p v-if="errorMsg" class="pa-error">{{ errorMsg }}</p>

    <ul v-if="list.length" class="pa-list">
      <li v-for="att in list" :key="att.id" class="pa-item">
        <span class="pa-icon" aria-hidden="true">{{ iconFor(att) }}</span>
        <span class="pa-name" :title="att.name">{{ att.name }}</span>
        <button
          type="button"
          class="pa-link-btn"
          title="在线预览"
          @click="onPreview($event, att)"
        >
          预览
        </button>
        <button
          type="button"
          class="pa-link-btn pa-danger"
          title="删除"
          @click="onRemove($event, att.id)"
        >
          删除
        </button>
      </li>
    </ul>
    <p v-else class="pa-empty">暂无资料，可添加文件或链接</p>

    <AttachmentPreviewModal
      :attachment="previewTarget"
      @close="closePreview"
    />
  </div>
</template>

<style scoped>
.pa-root {
  flex-shrink: 0;
  border-top: 1px solid #e8eaed;
  background: rgba(248, 249, 250, 0.92);
  padding: 6px 8px 8px;
  box-sizing: border-box;
  cursor: default;
}

.pa-root.compact {
  padding: 4px 6px 6px;
}

.pa-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.pa-title {
  font-size: 11px;
  font-weight: 700;
  color: #5f6368;
  letter-spacing: 0.02em;
  flex: 1;
  min-width: 0;
}

.pa-actions {
  display: inline-flex;
  gap: 4px;
  flex-shrink: 0;
}

.pa-btn {
  border: 1px dashed #9aa0a6;
  border-radius: 4px;
  background: #fff;
  color: #5f6368;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.4;
}

.pa-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: #e8f0fe;
}

.pa-btn-primary {
  border-style: solid;
  border-color: #1a73e8;
  background: #1a73e8;
  color: #fff;
}

.pa-btn-primary:hover {
  background: #1765cc;
  color: #fff;
}

.pa-file-input {
  display: none;
}

.pa-url-form {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}

.pa-input {
  flex: 1 1 120px;
  min-width: 0;
  border: 1px solid #dadce0;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  font-family: inherit;
  color: #202124;
  outline: none;
  box-sizing: border-box;
}

.pa-input:focus {
  border-color: #1a73e8;
}

.pa-error {
  margin: 4px 0 0;
  font-size: 11px;
  color: #d93025;
  line-height: 1.4;
}

.pa-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 96px;
  overflow-y: auto;
}

.pa-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
}

.pa-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.pa-icon {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}

.pa-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #3c4043;
}

.pa-link-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #1a73e8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  font-family: inherit;
  border-radius: 3px;
}

.pa-link-btn:hover {
  background: #e8f0fe;
}

.pa-danger {
  color: #d93025;
}

.pa-danger:hover {
  background: #fce8e6;
}

.pa-empty {
  margin: 2px 0 0;
  font-size: 11px;
  color: #b0b4b8;
  line-height: 1.4;
}
</style>
