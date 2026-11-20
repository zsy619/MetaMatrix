<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRevisions, materializeRevision } from '../../api/documents'
import type { RevisionSummary } from '../../api/documents'
import { friendlyApiMessage } from '../../utils/apiMessage'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ restored: [html: string] }>()

const revisions = ref<RevisionSummary[]>([])
const loading = ref(false)
const restoring = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const res = await listRevisions(props.documentId, { limit: 30 })
    revisions.value = Array.isArray(res) ? res : res.items
  } catch {
    revisions.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.documentId, load, { immediate: true })

async function restore(rev: RevisionSummary) {
  try {
    await ElMessageBox.confirm(
      `恢复到「${rev.label || '历史版本'}」？当前未保存内容会被覆盖。`,
      '恢复历史版本',
      { type: 'warning' },
    )
  } catch {
    return
  }
  restoring.value = rev.id
  try {
    const res = await materializeRevision(props.documentId, rev.id)
    const data = res.data as { html?: string } | undefined
    emit('restored', data?.html ?? '')
    ElMessage.success('已恢复到历史版本')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '恢复失败'))
  } finally {
    restoring.value = null
  }
}

function timeLabel(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="doc-history">
    <div class="doc-history__title">历史版本</div>
    <p v-if="loading" class="doc-history__empty">加载中…</p>
    <p v-else-if="!revisions.length" class="doc-history__empty">暂无历史</p>
    <ul v-else class="doc-history__list">
      <li v-for="rev in revisions" :key="rev.id" class="doc-history__item">
        <span class="doc-history__label">{{ rev.label || rev.revisionType }}</span>
        <span class="doc-history__time">{{ timeLabel(rev.createdAt) }}</span>
        <el-button
          size="small"
          text
          :loading="restoring === rev.id"
          @click="restore(rev)"
        >恢复</el-button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.doc-history { border-top: 1px solid var(--mm-line, #e5e6eb); padding: 12px 8px 12px 14px; font-size: 13px; }
.doc-history__title { font-size: 12px; color: var(--mm-muted, #86909c); margin-bottom: 8px; font-weight: 600; }
.doc-history__empty { font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-history__list { list-style: none; margin: 0; padding: 0; }
.doc-history__item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; }
.doc-history__item:hover { background: var(--mm-hover, #f2f3f5); }
.doc-history__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--mm-text, #1d2129); }
.doc-history__time { flex: none; font-size: 11px; color: var(--mm-muted, #86909c); }
</style>
