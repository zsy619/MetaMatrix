<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { friendlyApiMessage } from '../utils/apiMessage'
import { downloadBackup, restoreBackup, type BackupBundle } from '../api/documents'

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
    const bundle = await downloadBackup()
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'metamatrix-backup.json'
    link.click()
    URL.revokeObjectURL(url)
    backupMsg.value = bundle.truncated
      ? `已下载最近 ${bundle.count} 份。更早的画布请用数据库备份。`
      : `已下载 ${bundle.count} 份画布。`
  } catch (e) {
    backupMsg.value = friendlyApiMessage(e, '导出失败')
  } finally {
    backupBusy.value = false
  }
}

async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  backupMsg.value = ''
  backupBusy.value = true
  try {
    const text = await file.text()
    const bundle = JSON.parse(text) as BackupBundle
    const result = await restoreBackup(bundle)
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
    <form class="card" @submit.prevent="submit">
      <router-link class="back" :to="{ name: 'guide' }">← 返回模板库</router-link>
      <p class="eyebrow">MetaMatrix</p>
      <h1>账户</h1>
      <dl>
        <div>
          <dt>显示名</dt>
          <dd>{{ auth.user?.displayName || '未设置' }}</dd>
        </div>
        <div>
          <dt>邮箱</dt>
          <dd>{{ auth.user?.email || '—' }}</dd>
        </div>
        <div>
          <dt>会话有效至</dt>
          <dd>{{ expiryLabel }}</dd>
        </div>
      </dl>
      <h2>界面密度</h2>
      <p class="hint">只收紧间距。画布分色保持不变，不跟随系统深色模式改色。</p>
      <div class="actions">
        <button type="button" class="mm-btn" :class="{ 'mm-btn--primary': density === 'comfortable' }" @click="setDensity('comfortable')">标准</button>
        <button type="button" class="mm-btn" :class="{ 'mm-btn--primary': density === 'compact' }" @click="setDensity('compact')">紧凑</button>
      </div>
      <h2>画布备份</h2>
      <p class="hint">只包含当前账号未归档的画布，最多 200 份。导入会新建画布，不会覆盖原件。整库恢复仍用数据库备份。</p>
      <div class="actions">
        <button type="button" class="mm-btn mm-btn--primary" :disabled="backupBusy" @click="exportBackup">下载备份</button>
        <label class="mm-btn">
          从备份导入
          <input class="file-input" type="file" accept="application/json,.json" :disabled="backupBusy" @change="importBackup" />
        </label>
      </div>
      <p v-if="backupMsg" role="status">{{ backupMsg }}</p>
      <h2>修改密码</h2>
      <label for="cur-pass">
        当前密码
        <input id="cur-pass" v-model="currentPassword" type="password" autocomplete="current-password" required />
      </label>
      <label for="new-pass">
        新密码
        <input id="new-pass" v-model="newPassword" type="password" autocomplete="new-password" minlength="6" maxlength="72" required />
      </label>
      <p v-if="message" :class="tone === 'ok' ? 'ok' : 'err'" role="status">{{ message }}</p>
      <div class="actions">
        <button type="submit" class="mm-btn mm-btn--primary" :disabled="busy">
          {{ busy ? '保存中…' : '更新密码' }}
        </button>
        <button type="button" class="mm-btn mm-btn--ghost" @click="logout">退出登录</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.account {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, var(--mm-blue-soft) 0%, transparent 60%),
    var(--mm-bg);
}
.card {
  width: min(460px, 100%);
  background: var(--mm-surface);
  border: 1px solid var(--mm-line);
  border-radius: var(--mm-radius);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.back {
  color: var(--mm-blue);
  text-decoration: none;
  font-size: 13px;
  font-weight: 650;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mm-blue);
  font-weight: 700;
}
h1, h2 { margin: 0; }
h1 { font-size: 28px; letter-spacing: -0.03em; }
h2 { font-size: 16px; margin-top: 8px; }
dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
dt { color: var(--mm-muted); }
dd { margin: 0; text-align: right; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
input {
  border: 1px solid var(--mm-line-strong);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { margin: 0; color: var(--mm-muted); font-size: 13px; }
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.err { color: var(--mm-red); margin: 0; font-size: 13px; }
.ok { color: var(--mm-green); margin: 0; font-size: 13px; }
</style>
