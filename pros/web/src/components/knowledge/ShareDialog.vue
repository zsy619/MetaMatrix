<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createShare, listShares, revokeShare } from '../../api/knowledge'
import type { KnowledgeShare } from '../../api/knowledge'

const props = defineProps<{ documentId: string; visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const shares = ref<KnowledgeShare[]>([])
const role = ref<'view' | 'comment' | 'edit'>('view')
/** 有效期：留空表示永久有效。 */
const expiresAt = ref('')
/** 访问口令：留空表示无需口令。 */
const password = ref('')
/** 是否允许复制正文（分享页禁用复制与导出）。 */
const allowCopy = ref(true)
const loading = ref(false)
const busy = ref(false)

const roleLabel: Record<string, string> = { view: '只读', comment: '可评论', edit: '可编辑' }

async function load() {
  if (!props.visible) return
  loading.value = true
  try {
    shares.value = await listShares(props.documentId)
  } catch {
    ElMessage.error('加载分享链接失败')
  } finally {
    loading.value = false
  }
}

function linkOf(token: string) {
  return `${window.location.origin}/share/${token}`
}

async function copy(token: string) {
  try {
    await navigator.clipboard.writeText(linkOf(token))
    ElMessage.success('链接已复制')
  } catch {
    ElMessage.warning(`复制失败，请手动复制：${linkOf(token)}`)
  }
}

async function create() {
  busy.value = true
  try {
    await createShare(props.documentId, {
      role: role.value,
      expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : null,
      password: password.value,
      allowCopy: allowCopy.value,
    })
    ElMessage.success('分享链接已创建')
    await load()
  } catch {
    ElMessage.error('创建分享链接失败')
  } finally {
    busy.value = false
  }
}

async function revoke(share: KnowledgeShare) {
  try {
    await revokeShare(props.documentId, share.id)
    ElMessage.success('已撤销')
    await load()
  } catch {
    ElMessage.error('撤销失败')
  }
}

watch(() => props.visible, load)
onMounted(load)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="分享设置"
    width="560px"
    @close="emit('close')"
  >
    <div class="share">
      <div class="share__create">
        <el-select v-model="role" style="width: 120px">
          <el-option label="只读" value="view" />
          <el-option label="可评论" value="comment" />
          <el-option label="可编辑" value="edit" />
        </el-select>
        <el-date-picker
          v-model="expiresAt"
          type="datetime"
          size="default"
          placeholder="有效期"
          value-format="YYYY-MM-DDTHH:mm:ssZ"
          style="width: 200px"
        />
        <el-input v-model="password" placeholder="访问口令（可空）" style="width: 160px" />
        <el-checkbox v-model="allowCopy">允许复制</el-checkbox>
        <el-button type="primary" :loading="busy" @click="create">创建链接</el-button>
      </div>
      <div v-if="loading" class="share__empty">加载中…</div>
      <div v-else-if="!shares.length" class="share__empty">还没有分享链接。</div>
      <ul v-else class="share__list">
        <li v-for="share in shares" :key="share.id">
          <div class="share__meta">
            <el-tag size="small" type="info">{{ roleLabel[share.role] }}</el-tag>
            <el-tag v-if="!share.allowCopy" size="small" type="warning">禁止复制</el-tag>
            <span class="share__time">{{ new Date(share.createdAt).toLocaleString() }}</span>
            <span v-if="share.expiresAt" class="share__time">
              到期：{{ new Date(share.expiresAt).toLocaleString() }}
            </span>
          </div>
          <div class="share__link">{{ linkOf(share.token) }}</div>
          <div class="share__ops">
            <el-button link type="primary" @click="copy(share.token)">复制</el-button>
            <el-button link type="danger" @click="revoke(share)">撤销</el-button>
          </div>
        </li>
      </ul>
    </div>
  </el-dialog>
</template>

<style scoped>
.share__create {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.share__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow: auto;
}
.share__list li {
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.share__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.share__link {
  font-size: 12px;
  word-break: break-all;
  margin: 4px 0;
  color: var(--mm-blue, #1677ff);
}
.share__ops {
  display: flex;
  gap: 4px;
}
.share__empty {
  padding: 16px 0;
  text-align: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
}
</style>
