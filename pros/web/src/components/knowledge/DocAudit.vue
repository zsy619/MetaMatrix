<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { listDocAudit, type DocAuditEvent } from '../../api/knowledge_v6'

const props = defineProps<{ documentId: string }>()

const rows = ref<DocAuditEvent[]>([])
const loading = ref(false)
const unavailable = ref(false)

const ACTION_LABEL: Record<string, string> = {
  save: '保存',
  restore: '恢复',
  collab_save: '协同保存',
}

function actionLabel(action: string) {
  return ACTION_LABEL[action] || action
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function shortUser(userId: string) {
  if (!userId) return '未知用户'
  return userId.length > 8 ? userId.slice(0, 8) : userId
}

async function load() {
  if (!props.documentId) {
    rows.value = []
    return
  }
  loading.value = true
  unavailable.value = false
  try {
    rows.value = await listDocAudit(props.documentId, 50)
  } catch {
    // 无权限或文档不存在时保持空态，不打断页面。
    rows.value = []
    unavailable.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.documentId, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="doc-audit">
    <p v-if="loading" class="doc-audit__empty">加载中…</p>
    <p v-else-if="unavailable" class="doc-audit__empty">暂无可以查看的审计记录。</p>
    <p v-else-if="!rows.length" class="doc-audit__empty">还没有审计记录。</p>
    <ul v-else class="doc-audit__list">
      <li v-for="row in rows" :key="row.id" class="doc-audit__item">
        <div class="doc-audit__main">
          <span class="doc-audit__who" :title="row.userId">{{ shortUser(row.userId) }}</span>
          <span class="doc-audit__action">{{ actionLabel(row.action) }}</span>
        </div>
        <div class="doc-audit__meta">
          <time class="doc-audit__time">{{ formatTime(row.createdAt) }}</time>
          <span v-if="row.blockId" class="doc-audit__block" :title="row.blockId">块 {{ row.blockId.slice(0, 8) }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.doc-audit {
  padding: 8px 4px 12px;
}
.doc-audit__empty {
  margin: 12px 4px;
  color: var(--mm-text-secondary, #86909c);
  font-size: 13px;
}
.doc-audit__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.doc-audit__item {
  padding: 8px;
  border-radius: 8px;
  background: var(--mm-fill, rgba(15, 23, 42, 0.04));
}
.doc-audit__main,
.doc-audit__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.doc-audit__who {
  font-weight: 600;
  font-size: 13px;
  color: var(--mm-text, #1d2129);
}
.doc-audit__action {
  font-size: 12px;
  color: var(--mm-text-secondary, #4e5969);
}
.doc-audit__time,
.doc-audit__block {
  margin-top: 4px;
  font-size: 12px;
  color: var(--mm-text-secondary, #86909c);
}
</style>
