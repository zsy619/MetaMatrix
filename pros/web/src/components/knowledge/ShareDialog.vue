<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, CopyDocument, Delete, Link, QuestionFilled } from '@element-plus/icons-vue'
import {
  createNodeShare,
  createShare,
  listNodeShares,
  listShares,
  revokeNodeShare,
  revokeShare,
} from '../../api/knowledge'
import { setShareAllowList } from '../../api/knowledge_v5'
import { setNodeShareAllowList } from '../../api/knowledge'
import type { KnowledgeShare } from '../../api/knowledge'

const props = defineProps<{
  visible: boolean
  /** 文档分享目标（富文本文档与画布文档）。 */
  documentId?: string
  /** 节点分享目标（思维导图 / 多维表格）。 */
  projectId?: string
  nodeId?: string
  /** 内容类型：doc | canvas | mindmap | sheet。 */
  kind?: string
}>()
const emit = defineEmits<{ close: [] }>()

const shares = ref<KnowledgeShare[]>([])
/** 权限：只读 / 可编辑。评论由「允许评论」单独控制，两者正交。 */
const role = ref<'view' | 'edit'>('view')
/** 是否允许访客评论（分享页出现评论框）。 */
const allowComment = ref(false)
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

/** 分享目标：节点分享走节点接口，文档分享走文档接口。 */
const isNodeShare = computed(() => Boolean(props.nodeId && props.projectId))
/** 分享页只有富文本文档能在线回写正文。 */
const canEdit = computed(() => (props.kind ?? 'doc') === 'doc')
/** 画布有文档正文，可以评论；导图与表格没有评论落地。 */
const canComment = computed(() => canEdit.value || (props.kind ?? 'doc') === 'canvas')

/** 最终落到服务端的角色：可编辑 > 可评论 > 只读。 */
const effectiveRole = computed<'view' | 'comment' | 'edit'>(() => {
  if (canEdit.value && role.value === 'edit') return 'edit'
  if (canComment.value && allowComment.value) return 'comment'
  return 'view'
})

async function load() {
  if (!props.visible) return
  loading.value = true
  try {
    shares.value = isNodeShare.value
      ? await listNodeShares(props.projectId!, props.nodeId!)
      : await listShares(props.documentId!)
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
    if (isNodeShare.value) {
      await setNodeShareAllowList(props.projectId!, props.nodeId!, share.id, users)
    } else {
      await setShareAllowList(props.documentId!, share.id, users)
    }
    ElMessage.success('白名单已保存')
    await load()
  } catch {
    ElMessage.error('白名单保存失败')
  }
}

async function create() {
  busy.value = true
  try {
    const pwd = password.value.trim()
    const input = {
      role: effectiveRole.value,
      // 有效期按本地时间选择，这里换算成 UTC 交给服务端，避免时区偏移。
      expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : null,
      password: pwd,
      allowCopy: allowCopy.value,
    }
    if (isNodeShare.value) {
      await createNodeShare(props.projectId!, props.nodeId!, input)
    } else {
      await createShare(props.documentId!, input)
    }
    password.value = ''
    ElMessage.success('分享链接已创建')
    await load()
    // 口令只存摘要，创建后无法再查看，这里一次性回显给创建者。
    if (pwd) {
      await ElMessageBox.alert(`访问口令：${pwd}。口令只保存摘要，请立即复制给访问者。`, '口令已生效', {
        confirmButtonText: '我已复制',
        type: 'info',
      }).catch(() => undefined)
    }
  } catch {
    ElMessage.error('创建分享链接失败')
  } finally {
    busy.value = false
  }
}

async function revoke(share: KnowledgeShare) {
  try {
    if (isNodeShare.value) {
      await revokeNodeShare(props.projectId!, props.nodeId!, share.id)
    } else {
      await revokeShare(props.documentId!, share.id)
    }
    ElMessage.success('已撤销')
    await load()
  } catch {
    ElMessage.error('撤销失败')
  }
}

/** 有效期的人话描述。 */
function expiryText(share: KnowledgeShare) {
  if (!share.expiresAt) return '永久有效'
  return `有效期至 ${new Date(share.expiresAt).toLocaleString()}`
}

watch(() => props.visible, load)
onMounted(load)
</script>

<template>
  <el-dialog
    :model-value="visible"
    width="860px"
    align-center
    append-to-body
    class="share-dialog"
    @close="emit('close')"
  >
    <template #header>
      <div class="share-dialog__head">
        <span class="share-dialog__bar" />
        <span class="share-dialog__title">分享设置</span>
      </div>
    </template>
    <div class="share">
      <div class="share__panel">
        <div class="share__create">
          <el-select v-model="role" class="share__role">
            <el-option label="只读" value="view" />
            <el-option v-if="canEdit" label="可编辑" value="edit" />
          </el-select>
          <el-date-picker
            v-model="expiresAt"
            type="datetime"
            placeholder="有效期"
            value-format="YYYY-MM-DD HH:mm:ss"
            class="share__date"
          >
            <template #prefix>
              <el-icon><Clock /></el-icon>
            </template>
          </el-date-picker>
          <el-input v-model="password" placeholder="访问口令" class="share__pwd">
            <template #suffix>
              <el-tooltip
                content="设置后访问者需输入口令才能打开分享页；口令只保存摘要，创建后不可再查看。"
                placement="top"
              >
                <el-icon class="share__info"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
          </el-input>
          <div class="share__switches">
            <el-checkbox v-model="allowCopy">允许复制</el-checkbox>
            <el-checkbox
              v-if="canComment"
              v-model="allowComment"
              :disabled="role === 'edit'"
            >
              允许评论
            </el-checkbox>
          </div>
          <el-button type="primary" :loading="busy" @click="create">创建链接</el-button>
        </div>
        <p class="share__hint">
          有效期留空表示永久有效；白名单留空表示公开；口令创建后不可再查看。
          <template v-if="!canEdit">
            {{ canComment ? '画布分享不支持在线编辑正文。' : '思维导图与多维表格分享为只读。' }}
          </template>
        </p>
      </div>
      <div v-if="loading" class="share__empty">加载中…</div>
      <div v-else-if="!shares.length" class="share__empty">
        <el-icon class="share__empty-icon"><Link /></el-icon>
        <span>还没有分享链接。</span>
      </div>
      <template v-else>
        <div class="share__section">
          <span class="share__section-title">已创建的链接</span>
          <span class="share__section-count">{{ shares.length }}</span>
        </div>
        <ul class="share__list">
          <li v-for="share in shares" :key="share.id">
            <div class="share__main">
              <span class="share__link" @click="copy(share.token)">{{ linkOf(share.token) }}</span>
              <el-button
                class="share__link-copy"
                text
                :icon="CopyDocument"
                title="复制链接"
                @click="copy(share.token)"
              />
            </div>
            <div class="share__meta">
              <el-tag size="small" type="info">{{ roleLabel[share.role] }}</el-tag>
              <el-tag v-if="share.hasPassword" size="small" type="warning">有口令</el-tag>
              <el-tag v-if="!share.allowCopy" size="small" type="danger">禁止复制</el-tag>
              <el-tag v-if="share.allowUsers" size="small" type="success">白名单</el-tag>
              <span class="share__time">{{ expiryText(share) }}</span>
              <span class="share__time">创建于 {{ new Date(share.createdAt).toLocaleString() }}</span>
            </div>
            <div class="share__foot">
              <div class="share__allow">
                <span class="share__allow-label">白名单</span>
                <el-input
                  v-model="allowInput[share.id]"
                  size="small"
                  placeholder="用户 ID，逗号分隔（留空表示公开）"
                />
                <el-button size="small" text type="primary" @click="saveAllowList(share)">保存</el-button>
              </div>
              <div class="share__ops">
                <el-popover placement="bottom" :width="180" trigger="hover">
                  <template #reference>
                    <el-button link type="primary">二维码</el-button>
                  </template>
                  <img v-if="qrOf[share.token]" :src="qrOf[share.token]" class="share__qr" alt="分享二维码" />
                  <span v-else class="share__qr-empty">二维码生成中…</span>
                </el-popover>
                <el-button link type="primary" @click="copy(share.token)">复制链接</el-button>
                <el-button link type="danger" :icon="Delete" @click="revoke(share)">撤销</el-button>
              </div>
            </div>
        </li>
        </ul>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.share-dialog__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.share-dialog__bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--ent-primary, #1a73e8);
}
.share-dialog__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ent-text, #1f2733);
}
.share__create {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.share__panel {
  padding: 14px 16px 12px;
  margin-bottom: 18px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: var(--ent-radius-md, 12px);
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.share__hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ent-text-3, #8a94a3);
}
.share__switches {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ent-primary, #1a73e8);
}
/* Element Plus 给复选框留了 30px 右间距，这里按组内间距重排。 */
.share__switches :deep(.el-checkbox) {
  margin-right: 0;
}
.share__role {
  width: 104px;
}
.share__date {
  width: 172px;
}
.share__pwd {
  width: 150px;
}
.share__info {
  color: var(--ent-text-3, #8a94a3);
  cursor: help;
}
.share__section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.share__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ent-text, #1f2733);
}
.share__section-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--ent-primary-soft, #eaf1fe);
  color: var(--ent-primary-strong, #1758b8);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}
.share__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 340px;
  overflow: auto;
}
.share__list li {
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-md, 12px);
  padding: 12px 14px 10px;
  margin-bottom: 8px;
  background: var(--ent-surface, #fff);
}
.share__main {
  display: flex;
  align-items: center;
  gap: 4px;
}
.share__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.share__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
}
.share__link {
  font-size: 13px;
  font-weight: 500;
  word-break: break-all;
  color: var(--ent-primary, #1a73e8);
  cursor: pointer;
}
.share__link-copy {
  color: var(--ent-text-3, #8a94a3);
}
.share__ops {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
  flex-shrink: 0;
}
.share__allow {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.share__allow-label {
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
  flex-shrink: 0;
}
.share__qr {
  width: 72px;
  height: 72px;
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: 4px;
}
.share__qr-empty {
  display: block;
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
}
.share__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 0;
  text-align: center;
  color: var(--ent-text-3, #8a94a3);
  font-size: 13px;
}
.share__empty-icon {
  font-size: 28px;
  color: var(--ent-border-strong, #d7dce5);
}
</style>

<!-- 弹窗被 teleport 到 body，容器样式不进 scoped 作用域。 -->
<style>
.el-dialog.share-dialog {
  padding: 0;
  border-radius: var(--ent-radius-lg, 16px);
  box-shadow: var(--ent-shadow-lg, 0 14px 36px rgba(15, 23, 42, 0.12));
}
.el-dialog.share-dialog .el-dialog__header {
  display: flex;
  align-items: center;
  padding: 20px 24px 16px;
  margin: 0;
  border-bottom: 1px solid var(--ent-border, #e6e9ef);
}
.el-dialog.share-dialog .el-dialog__headerbtn {
  position: static;
  width: 32px;
  height: 32px;
  margin-left: auto;
}
.el-dialog.share-dialog .el-dialog__body {
  padding: 20px 24px 24px;
}
</style>
