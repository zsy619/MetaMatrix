<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createShare, listShares, revokeShare } from '../../api/knowledge'
import { setShareAllowList } from '../../api/knowledge_v5'
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
/** 二维码（076）：扫码在手机上打开分享页。 */
const qrOf = ref<Record<string, string>>({})
/** 白名单输入（071）。 */
const allowInput = ref<Record<string, string>>({})

const roleLabel: Record<string, string> = { view: '只读', comment: '可评论', edit: '可编辑' }

async function load() {
  if (!props.visible) return
  loading.value = true
  try {
    shares.value = await listShares(props.documentId)
    for (const share of shares.value) {
      allowInput.value[share.id] = share.allowUsers ?? ''
      void loadQr(share.token)
    }
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

async function loadQr(token: string) {
  if (qrOf.value[token]) return
  try {
    const { default: QRCode } = await import('qrcode')
    qrOf.value[token] = await QRCode.toDataURL(linkOf(token), { width: 160, margin: 1 })
  } catch {
    /* 二维码生成失败不影响分享本身 */
  }
}

async function saveAllowList(share: KnowledgeShare) {
  const users = allowInput.value[share.id] ?? share.allowUsers ?? ''
  try {
    await setShareAllowList(props.documentId, share.id, users)
    ElMessage.success('白名单已保存')
    await load()
  } catch {
    ElMessage.error('白名单保存失败')
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
            <el-tag v-if="share.allowUsers" size="small" type="success">白名单</el-tag>
            <span class="share__time">{{ new Date(share.createdAt).toLocaleString() }}</span>
            <span v-if="share.expiresAt" class="share__time">
              到期：{{ new Date(share.expiresAt).toLocaleString() }}
            </span>
          </div>
          <div class="share__link">{{ linkOf(share.token) }}</div>
          <div class="share__allow">
            <el-input
              v-model="allowInput[share.id]"
              size="small"
              placeholder="白名单：用户 ID，逗号分隔（留空表示公开）"
            />
            <el-button size="small" text type="primary" @click="saveAllowList(share)">保存白名单</el-button>
          </div>
          <div class="share__ops">
            <img v-if="qrOf[share.token]" :src="qrOf[share.token]" class="share__qr" alt="分享二维码" />
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
  gap: 8px;
  align-items: center;
}
.share__allow {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.share__qr {
  width: 72px;
  height: 72px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 4px;
}
.share__empty {
  padding: 16px 0;
  text-align: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
}
</style>
