<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { friendlyApiMessage } from '../utils/apiMessage'
import { downloadBackup, restoreBackup, type BackupBundle } from '../api/documents'
import { listActivityLogs, type ActivityLogEntry } from '../api/logs'
import {
  ArrowLeft,
  Download,
  FolderOpened,
  Lock,
  Monitor,
  Refresh,
  SwitchButton,
  Tickets,
  Upload,
  User,
} from '@element-plus/icons-vue'

const auth = useAuthStore()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const message = ref('')
const tone = ref<'error' | 'ok'>('error')
const busy = ref(false)
function readDensity(): 'comfortable' | 'compact' {
  try {
    return localStorage.getItem('metamatrix:density') === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}
const density = ref(readDensity())

// ---------- 活动日志（登录 / 退出 / 写操作） ----------
const logs = ref<ActivityLogEntry[]>([])
const logCategory = ref('')
const logsBusy = ref(false)
const logMsg = ref('')
const logTabs = [
  { label: '全部', value: '' },
  { label: '登录', value: 'login' },
  { label: '退出', value: 'logout' },
  { label: '操作', value: 'operation' },
]

async function loadLogs() {
  logsBusy.value = true
  logMsg.value = ''
  try {
    const res = await listActivityLogs({ category: logCategory.value, limit: 50 })
    logs.value = res.items || []
  } catch (e) {
    logs.value = []
    logMsg.value = friendlyApiMessage(e, '日志加载失败')
  } finally {
    logsBusy.value = false
  }
}

function switchLogCategory(value: string) {
  logCategory.value = value
  void loadLogs()
}

function categoryLabel(category: string) {
  if (category === 'login') return '登录'
  if (category === 'logout') return '退出'
  if (category === 'operation') return '操作'
  return category
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

const userInitial = computed(() => (auth.user?.displayName || auth.user?.email || '?').slice(0, 1).toUpperCase())

const expiryLabel = computed(() => {
  const raw = auth.token
  if (!raw) return '未登录'
  const part = raw.split('.')[1]
  if (!part) return '会话时间未知'
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (typeof json.exp !== 'number') return '会话时间未知'
    return new Date(json.exp * 1000).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '会话时间未知'
  }
})

onMounted(async () => {
  document.title = '账户 · 元矩阵 MetaMatrix'
  if (!auth.isAuthenticated) {
    router.replace({ name: 'login', query: { redirect: '/account' } })
    return
  }
  if (auth.token) await auth.fetchMe()
  void loadLogs()
})

async function submit() {
  message.value = ''
  if (newPassword.value.length < 6) {
    tone.value = 'error'
    message.value = '新密码至少 6 位。'
    return
  }
  if (newPassword.value.length > 72) {
    tone.value = 'error'
    message.value = '新密码过长。请控制在 72 个字节以内。'
    return
  }
  if (newPassword.value === currentPassword.value) {
    tone.value = 'error'
    message.value = '新密码需要和当前密码不同。'
    return
  }
  busy.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    tone.value = 'ok'
    message.value = '密码已更新。当前登录仍然有效。'
  } catch (e) {
    tone.value = 'error'
    message.value = friendlyApiMessage(e, '修改密码失败')
  } finally {
    busy.value = false
  }
}

function setDensity(mode: 'comfortable' | 'compact') {
  density.value = mode
  window.dispatchEvent(new CustomEvent('metamatrix:density', { detail: mode }))
}

const backupMsg = ref('')
const backupBusy = ref(false)

async function exportBackup() {
  backupMsg.value = ''
  backupBusy.value = true
  try {
    // 服务端已经逐批编码为合法 JSON；直接下载响应 Blob，不再读取整份 bundle 后
    // JSON.stringify 一次，避免导出期间同时占用文档、JSON 字符串和 Blob 三份内存。
    const blob = await downloadBackup()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'metamatrix-backup.json'
    link.click()
    URL.revokeObjectURL(url)
    backupMsg.value = '备份文件已下载。若画布超过 200 份，文件只包含最近 200 份，更早内容请用数据库备份。'
  } catch (e) {
    backupMsg.value = friendlyApiMessage(e, '导出失败')
  } finally {
    backupBusy.value = false
  }
}

async function importBackup(file: File | undefined) {
  if (!file) return
  backupMsg.value = ''
  backupBusy.value = true
  try {
    const text = await file.text()
    const bundle = JSON.parse(text) as BackupBundle
    // 一次文件选择就是一次导入意图；restoreBackup 内部的网络重试会复用此 id。
    // 不使用 X-Request-Id，因为它标识单次 HTTP 尝试，不能跨重试去重。
    const importBatchId = crypto.randomUUID()
    const result = await restoreBackup(bundle, importBatchId)
    backupMsg.value = `已作为新画布导入 ${result.imported} 份，跳过 ${result.skipped} 份。`
  } catch (e) {
    backupMsg.value = friendlyApiMessage(e, '导入失败')
  } finally {
    backupBusy.value = false
  }
}

function logout() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="account">
    <div class="account__inner">
      <header class="account__top">
        <router-link class="account__back" :to="{ name: 'guide' }">
          <el-icon><ArrowLeft /></el-icon>返回模板库
        </router-link>
        <h1 class="account__title">账户设置</h1>
        <p class="account__subtitle">管理个人资料、界面偏好、画布备份与登录记录。</p>
      </header>

      <div class="account__grid">
        <div class="account__col">
          <section class="acct-card">
            <header class="acct-card__head">
              <span class="acct-card__icon"><el-icon><User /></el-icon></span>
              <div class="acct-card__heading">
                <h2 class="acct-card__title">个人资料</h2>
                <p class="acct-card__desc">账号信息与会话状态</p>
              </div>
            </header>
            <div class="acct-profile">
              <el-avatar :size="52" class="acct-profile__avatar">{{ userInitial }}</el-avatar>
              <div class="acct-profile__meta">
                <span class="acct-profile__name">{{ auth.user?.displayName || '未设置' }}</span>
                <span class="acct-profile__mail">{{ auth.user?.email || '—' }}</span>
              </div>
              <el-tag type="success" effect="light" size="small">已登录</el-tag>
            </div>
            <dl class="acct-kv">
              <div>
                <dt>邮箱</dt>
                <dd>{{ auth.user?.email || '—' }}</dd>
              </div>
              <div>
                <dt>会话有效至</dt>
                <dd>{{ expiryLabel }}</dd>
              </div>
            </dl>
          </section>

          <section class="acct-card">
            <header class="acct-card__head">
              <span class="acct-card__icon"><el-icon><Monitor /></el-icon></span>
              <div class="acct-card__heading">
                <h2 class="acct-card__title">界面密度</h2>
                <p class="acct-card__desc">只收紧间距，画布分色保持不变</p>
              </div>
            </header>
            <el-radio-group
              :model-value="density"
              size="small"
              @change="(value: string) => setDensity(value as 'comfortable' | 'compact')"
            >
              <el-radio-button value="comfortable">标准</el-radio-button>
              <el-radio-button value="compact">紧凑</el-radio-button>
            </el-radio-group>
          </section>

          <section class="acct-card">
            <header class="acct-card__head">
              <span class="acct-card__icon"><el-icon><Lock /></el-icon></span>
              <div class="acct-card__heading">
                <h2 class="acct-card__title">修改密码</h2>
                <p class="acct-card__desc">6–72 位，更新后当前登录仍然有效</p>
              </div>
            </header>
            <el-form label-position="top" @submit.prevent="submit">
              <el-form-item label="当前密码">
                <el-input
                  v-model="currentPassword"
                  type="password"
                  show-password
                  autocomplete="current-password"
                  placeholder="请输入当前密码"
                />
              </el-form-item>
              <el-form-item label="新密码">
                <el-input
                  v-model="newPassword"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  placeholder="请输入新密码"
                />
              </el-form-item>
            </el-form>
            <el-alert
              v-if="message"
              :type="tone === 'ok' ? 'success' : 'error'"
              :title="message"
              show-icon
              :closable="false"
            />
            <div class="acct-actions">
              <el-button type="primary" :icon="Lock" :loading="busy" @click="submit">
                更新密码
              </el-button>
              <el-button :icon="SwitchButton" @click="logout">退出登录</el-button>
            </div>
          </section>

          <section class="acct-card">
            <header class="acct-card__head">
              <span class="acct-card__icon"><el-icon><FolderOpened /></el-icon></span>
              <div class="acct-card__heading">
                <h2 class="acct-card__title">画布备份</h2>
                <p class="acct-card__desc">仅当前账号未归档的画布，最多 200 份</p>
              </div>
            </header>
            <p class="acct-hint">导入会新建画布，不会覆盖原件；整库恢复仍用数据库备份。</p>
            <div class="acct-actions">
              <el-button type="primary" :icon="Download" :loading="backupBusy" @click="exportBackup">
                下载备份
              </el-button>
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                accept="application/json,.json"
                :on-change="(file: { raw: File }) => importBackup(file.raw)"
              >
                <el-button :icon="Upload" :disabled="backupBusy">从备份导入</el-button>
              </el-upload>
            </div>
            <el-alert v-if="backupMsg" type="info" :title="backupMsg" show-icon :closable="false" />
          </section>
        </div>

        <div class="account__col">
          <section class="acct-card">
            <header class="acct-card__head">
              <span class="acct-card__icon"><el-icon><Tickets /></el-icon></span>
              <div class="acct-card__heading">
                <h2 class="acct-card__title">登录与操作日志</h2>
                <p class="acct-card__desc">仅记录本账号，其他账号不可见</p>
              </div>
              <div class="acct-card__tools">
                <el-radio-group v-model="logCategory" size="small" @change="switchLogCategory">
                  <el-radio-button v-for="tab in logTabs" :key="tab.value" :value="tab.value">
                    {{ tab.label }}
                  </el-radio-button>
                </el-radio-group>
                <el-button :icon="Refresh" :loading="logsBusy" circle title="刷新" @click="loadLogs" />
              </div>
            </header>
            <el-alert v-if="logMsg" type="error" :title="logMsg" show-icon :closable="false" />
            <el-table v-if="logs.length" :data="logs" size="small" stripe class="acct-table" max-height="560">
              <el-table-column label="时间" width="180">
                <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column label="类别" width="84">
                <template #default="{ row }">
                  <el-tag
                    size="small"
                    effect="light"
                    :type="row.category === 'login' ? 'success' : row.category === 'logout' ? 'warning' : 'info'"
                  >
                    {{ categoryLabel(row.category) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="动作" width="170" show-overflow-tooltip>
                <template #default="{ row }"><code class="acct-code">{{ row.action }}</code></template>
              </el-table-column>
              <el-table-column label="结果" width="86">
                <template #default="{ row }">
                  <el-tag size="small" effect="light" :type="row.status === 'success' ? 'success' : 'danger'">
                    {{ row.status === 'success' ? '成功' : '失败' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="detail" label="详情" min-width="240" show-overflow-tooltip />
            </el-table>
            <el-empty v-else-if="!logsBusy" description="暂无记录" :image-size="72" />
            <el-skeleton v-else :rows="4" animated />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account {
  min-height: 100%;
  overflow: auto;
  padding: 24px 20px 48px;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, var(--mm-blue-soft) 0%, transparent 60%),
    var(--mm-bg);
}
.account__inner {
  width: min(1180px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.account__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  color: var(--mm-blue);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}
.account__back:hover { color: var(--mm-blue-deep); }
.account__title {
  margin: 4px 0 0;
  font-size: 26px;
  letter-spacing: -0.02em;
  color: var(--mm-text);
}
.account__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--mm-muted);
}
.account__grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 16px;
  align-items: start;
}
.account__col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
/* 卡片：企业级分区 + 标题栏 */
.acct-card {
  background: var(--ent-surface, #fff);
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-lg, 16px);
  box-shadow: var(--ent-shadow-xs, 0 1px 2px rgba(15, 23, 42, 0.05));
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.acct-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.acct-card__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ent-radius-sm, 8px);
  background: var(--ent-primary-soft, #eaf1fe);
  color: var(--ent-primary, #1a73e8);
  font-size: 16px;
}
.acct-card__heading { min-width: 0; flex: 1; }
.acct-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--ent-text, #1f2733);
}
.acct-card__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ent-text-3, #8a94a3);
}
.acct-card__tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.acct-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-md, 12px);
  background: var(--ent-surface-2, #f8fafc);
}
.acct-profile__avatar {
  background: var(--ent-primary, #1a73e8);
  color: #fff;
  font-weight: 650;
}
.acct-profile__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.acct-profile__name { font-size: 14px; font-weight: 650; color: var(--ent-text, #1f2733); }
.acct-profile__mail {
  font-size: 12px;
  color: var(--ent-text-2, #5a6472);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.acct-kv { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.acct-kv div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.acct-kv dt { color: var(--ent-text-2, #5a6472); }
.acct-kv dd { margin: 0; text-align: right; color: var(--ent-text, #1f2733); }
.acct-hint { margin: 0; font-size: 12.5px; color: var(--ent-text-2, #5a6472); }
.acct-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.acct-code { font-size: 12px; color: var(--ent-text-2, #5a6472); }
.acct-table { border-radius: var(--ent-radius-sm, 8px); }
@media (max-width: 1024px) {
  .account__grid { grid-template-columns: 1fr; }
}
</style>
