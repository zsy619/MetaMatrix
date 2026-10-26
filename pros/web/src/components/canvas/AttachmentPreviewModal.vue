<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PanelAttachment } from '../../types/canvas'

const props = defineProps<{
  attachment: PanelAttachment | null
}>()

const emit = defineEmits<{
  close: []
}>()

const textContent = ref<string | null>(null)
const textLoading = ref(false)
const textError = ref('')
const iframeFailed = ref(false)

const open = computed(() => !!props.attachment)

const src = computed(() => {
  const att = props.attachment
  if (!att) return ''
  return att.dataUrl || att.url || ''
})

const previewKind = computed(() => {
  const att = props.attachment
  if (!att) return 'unknown' as const
  const mime = (att.mimeType || '').toLowerCase()
  const name = att.name.toLowerCase()
  const s = src.value.toLowerCase()

  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(name) ||
    s.startsWith('data:image/')
  ) {
    return 'image' as const
  }
  if (
    mime === 'application/pdf' ||
    name.endsWith('.pdf') ||
    s.startsWith('data:application/pdf')
  ) {
    return 'pdf' as const
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|json|csv|log)(\?|$)/i.test(name) ||
    s.startsWith('data:text/')
  ) {
    return 'text' as const
  }
  if (att.kind === 'url') return 'url' as const
  return 'other' as const
})

async function loadText() {
  textContent.value = null
  textError.value = ''
  textLoading.value = true
  const att = props.attachment
  if (!att) {
    textLoading.value = false
    return
  }
  try {
    if (att.dataUrl) {
      if (att.dataUrl.startsWith('data:')) {
        const comma = att.dataUrl.indexOf(',')
        const meta = att.dataUrl.slice(0, comma)
        const body = att.dataUrl.slice(comma + 1)
        if (meta.includes(';base64')) {
          textContent.value = decodeURIComponent(
            Array.prototype.map
              .call(atob(body), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join(''),
          )
        } else {
          textContent.value = decodeURIComponent(body)
        }
      } else {
        textContent.value = att.dataUrl
      }
    } else if (att.url) {
      const res = await fetch(att.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      textContent.value = await res.text()
    } else {
      textError.value = '无可预览内容'
    }
  } catch (err) {
    textError.value =
      err instanceof Error ? err.message : '无法加载文本（可能被跨域限制）'
  } finally {
    textLoading.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.attachment,
  (att) => {
    iframeFailed.value = false
    if (att && previewKind.value === 'text') {
      void loadText()
    } else {
      textContent.value = null
      textError.value = ''
      textLoading.value = false
    }
  },
)

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onKeydown)
  } else {
    window.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onClose(event?: Event) {
  event?.stopPropagation()
  emit('close')
}

function onOpenExternal() {
  const s = src.value
  if (s) window.open(s, '_blank', 'noopener,noreferrer')
}

function onIframeError() {
  iframeFailed.value = true
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="attachment"
      class="ap-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="`预览：${attachment.name}`"
      @click.self="onClose"
    >
      <div class="ap-card" @click.stop>
        <header class="ap-header">
          <h3 class="ap-title">{{ attachment.name }}</h3>
          <div class="ap-actions">
            <button
              v-if="src"
              type="button"
              class="ap-btn"
              title="新窗口打开"
              @click="onOpenExternal"
            >
              新窗口打开
            </button>
            <button
              type="button"
              class="ap-btn ap-close"
              title="关闭"
              aria-label="关闭"
              @click="onClose"
            >
              ×
            </button>
          </div>
        </header>

        <div class="ap-body">
          <img
            v-if="previewKind === 'image' && src"
            class="ap-img"
            :src="src"
            :alt="attachment.name"
          />

          <embed
            v-else-if="previewKind === 'pdf' && src"
            class="ap-embed"
            :src="src"
            type="application/pdf"
          />

          <div v-else-if="previewKind === 'text'" class="ap-text-wrap">
            <p v-if="textLoading" class="ap-hint">加载中…</p>
            <p v-else-if="textError" class="ap-hint ap-err">
              {{ textError }}
              <button
                v-if="src"
                type="button"
                class="ap-btn"
                @click="onOpenExternal"
              >
                新窗口打开
              </button>
            </p>
            <pre v-else class="ap-pre">{{ textContent }}</pre>
          </div>

          <div v-else class="ap-fallback">
            <iframe
              v-if="src && !iframeFailed"
              class="ap-iframe"
              :src="src"
              :title="attachment.name"
              sandbox="allow-scripts allow-same-origin allow-popups"
              @error="onIframeError"
            />
            <div v-if="!src || iframeFailed" class="ap-hint">
              <p>无法内嵌预览该资料</p>
              <button
                v-if="src"
                type="button"
                class="ap-btn ap-btn-primary"
                @click="onOpenExternal"
              >
                新窗口打开
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ap-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 2.5vw, 28px);
  box-sizing: border-box;
  background: rgba(32, 33, 36, 0.55);
  backdrop-filter: blur(2px);
}

.ap-card {
  width: min(960px, 100%);
  height: min(860px, 92vh);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  box-sizing: border-box;
}

.ap-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #e8eaed;
  background: #fafbfc;
}

.ap-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  color: #202124;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ap-actions {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}

.ap-btn {
  border: 1px solid #dadce0;
  border-radius: 6px;
  background: #fff;
  color: #5f6368;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
}

.ap-btn:hover {
  border-color: #1a73e8;
  color: #1a73e8;
  background: #e8f0fe;
}

.ap-btn-primary {
  border-color: #1a73e8;
  background: #1a73e8;
  color: #fff;
}

.ap-btn-primary:hover {
  background: #1765cc;
  color: #fff;
}

.ap-close {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.ap-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f1f3f4;
  position: relative;
}

.ap-img {
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
  display: block;
}

.ap-embed,
.ap-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.ap-text-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: #fff;
}

.ap-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  color: #202124;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ap-fallback {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.ap-hint {
  margin: auto;
  text-align: center;
  color: #5f6368;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
}

.ap-err {
  color: #d93025;
}
</style>
