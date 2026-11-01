<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  diffRevisions,
  listRevisions,
  type RevisionSummary,
} from '../../api/documents'
import { useDocumentStore } from '../../stores/document'
import { friendlyApiMessage } from '../../utils/apiMessage'

const props = defineProps<{
  open: boolean
  documentId: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const documentStore = useDocumentStore()
const panel = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
const rows = ref<RevisionSummary[]>([])
const diffText = ref('')
const diffTitle = ref('')
const diffLoading = ref(false)
const pendingRestore = ref<RevisionSummary | null>(null)
const restoring = ref(false)
let opener: HTMLElement | null = null

function labelOf(rev: RevisionSummary): string {
  const raw = (rev.label || '').trim()
  if (raw === 'initial') return '初始版本'
  if (raw === 'manual-snapshot') return '手动存版'
  if (raw === 'auto-checkpoint') return '自动存档'
  if (raw.startsWith('restore:')) return '由恢复产生'
  return raw || '修订'
}

function when(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  if (!props.documentId) {
    rows.value = []
    error.value = '先把画布保存到云端，才会有版本记录。'
    return
  }
  loading.value = true
  error.value = ''
  diffText.value = ''
  try {
    const list = await listRevisions(props.documentId)
    rows.value = list.slice(0, 40)
  } catch (e) {
    rows.value = []
    error.value = friendlyApiMessage(e, '版本列表暂时不可用')
  } finally {
    loading.value = false
  }
}

async function showDiff(rev: RevisionSummary) {
  if (!props.documentId) return
  diffLoading.value = true
  diffTitle.value = labelOf(rev)
  diffText.value = ''
  try {
    const diff = await diffRevisions(props.documentId, rev.id)
    const body =
      (diff.unified && diff.unified.trim()) ||
      diff.textDiff
        .map((op) => {
          const prefix = op.op === 'insert' ? '+ ' : op.op === 'delete' ? '- ' : '  '
          return prefix + op.text
        })
        .join('\n')
    diffText.value = body || '与当前版本没有可显示的文本差异。'
  } catch (e) {
    diffText.value = friendlyApiMessage(e, '暂时无法对比这个版本')
  } finally {
    diffLoading.value = false
  }
}

async function confirmRestore() {
  const rev = pendingRestore.value
  if (!rev || restoring.value) return
  restoring.value = true
  error.value = ''
  try {
    await documentStore.restoreRevision(rev.id)
    pendingRestore.value = null
    emit('close')
  } catch (e) {
    error.value = friendlyApiMessage(e, '恢复失败')
  } finally {
    restoring.value = false
  }
}

function close() {
  pendingRestore.value = null
  emit('close')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (pendingRestore.value) pendingRestore.value = null
    else close()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
      return
    }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.addEventListener('keydown', onKey)
    await load()
    await nextTick()
    panel.value?.focus()
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="rev-overlay" @click.self="close">
      <div
        ref="panel"
        class="rev-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rev-title"
        tabindex="-1"
      >
        <header class="rev-head">
          <h2 id="rev-title">版本历史</h2>
          <button type="button" class="mm-btn mm-btn--ghost" @click="close">关闭</button>
        </header>
        <p class="rev-note">只列出这份画布属于你的存档。恢复会写成新的当前版本，不会删掉旧记录。</p>
        <p v-if="loading" role="status">正在读取版本…</p>
        <p v-else-if="error" class="mm-inline-error" role="alert">
          {{ error }}
          <button type="button" class="mm-btn mm-btn--ghost" @click="load">重试</button>
        </p>
        <p v-else-if="!rows.length">还没有云端版本。保存或手动存版之后会出现在这里。</p>
        <ul v-else class="rev-list">
          <li v-for="(rev, index) in rows" :key="rev.id">
            <div>
              <strong>{{ labelOf(rev) }}</strong>
              <span>{{ when(rev.createdAt) }}{{ index === 0 ? ' · 当前' : '' }}</span>
            </div>
            <div class="rev-actions">
              <button type="button" class="mm-btn mm-btn--ghost" :disabled="diffLoading" @click="showDiff(rev)">
                查看差异
              </button>
              <button
                type="button"
                class="mm-btn mm-btn--primary"
                :disabled="index === 0 || restoring"
                @click="pendingRestore = rev"
              >
                恢复
              </button>
            </div>
          </li>
        </ul>
        <p v-if="rows.length >= 40" class="rev-note">只显示最近 40 个版本。</p>
        <pre v-if="diffText || diffLoading" class="rev-diff" tabindex="0">{{ diffLoading ? '正在对比…' : diffTitle + '\n\n' + diffText }}</pre>
        <div v-if="pendingRestore" class="rev-confirm" role="alertdialog" aria-labelledby="rev-confirm-title">
          <h3 id="rev-confirm-title">恢复「{{ labelOf(pendingRestore) }}」？</h3>
          <p>当前画布会被这个版本替换，并生成一条新的恢复记录。</p>
          <div class="rev-actions">
            <button type="button" class="mm-btn mm-btn--ghost" :disabled="restoring" @click="pendingRestore = null">取消</button>
            <button type="button" class="mm-btn mm-btn--primary" :disabled="restoring" @click="confirmRestore">
              {{ restoring ? '恢复中…' : '确认恢复' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rev-overlay {
  position: fixed;
  inset: 0;
  z-index: 4600;
  background: rgba(32, 33, 36, 0.42);
  display: flex;
  justify-content: flex-end;
}

.rev-panel {
  width: min(440px, 100%);
  height: 100%;
  background: var(--mm-surface);
  padding: 20px 18px 28px;
  overflow: auto;
  box-shadow: -8px 0 28px rgba(32, 33, 36, 0.12);
  outline: none;
}

.rev-head,
.rev-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

h2, h3 {
  margin: 0;
}

.rev-note,
.rev-list span,
.rev-confirm p {
  color: var(--mm-muted);
  font-size: 13px;
  line-height: 1.5;
}

.rev-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rev-list li {
  border: 1px solid var(--mm-line);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rev-list strong {
  display: block;
  font-size: 14px;
}

.rev-diff {
  margin: 12px 0 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 10px;
  font-size: 12px;
  white-space: pre-wrap;
}

.rev-confirm {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: #fef7e0;
}
</style>
