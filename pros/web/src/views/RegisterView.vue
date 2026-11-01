<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { friendlyApiMessage } from '../utils/apiMessage'
import { safeRedirect } from '../utils/safeRedirect'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const displayName = ref('')
const busy = ref(false)
const message = ref('')

async function submit() {
  message.value = ''
  const mail = email.value.trim()
  if (!mail.includes('@') || mail.startsWith('@') || mail.endsWith('@')) {
    message.value = '请输入有效的邮箱地址。'
    return
  }
  if (password.value.length < 6) {
    message.value = '密码至少 6 位。'
    return
  }
  if (password.value.length > 72) {
    message.value = '密码过长。请控制在 72 个字节以内。'
    return
  }
  busy.value = true
  try {
    await auth.register(mail, password.value, displayName.value.trim() || undefined)
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '注册失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="card" @submit.prevent="submit">
      <p class="eyebrow">MetaMatrix</p>
      <h1>注册</h1>
      <p class="hint">创建账号后，画布按登录用户隔离保存。密码至少 6 位，且不超过 72 个字节。</p>
      <label for="reg-name">
        显示名（可选）
        <input id="reg-name" v-model="displayName" type="text" maxlength="64" autocomplete="nickname" />
      </label>
      <label for="reg-email">
        邮箱
        <input
          id="reg-email"
          v-model="email"
          type="email"
          required
          autocomplete="username"
          :aria-invalid="Boolean(message)"
        />
      </label>
      <label for="reg-password">
        密码
        <input
          id="reg-password"
          v-model="password"
          type="password"
          required
          minlength="6"
          maxlength="72"
          autocomplete="new-password"
          :aria-invalid="Boolean(message)"
        />
      </label>
      <p v-if="message" class="error" role="alert">{{ message }}</p>
      <button type="submit" :disabled="busy">{{ busy ? '注册中…' : '注册' }}</button>
      <p class="footer">
        已有账号？
        <router-link :to="{ name: 'login', query: route.query }">登录</router-link>
      </p>
    </form>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, var(--mm-blue-soft) 0%, transparent 60%),
    var(--mm-bg);
}
.card {
  width: min(420px, 100%);
  background: var(--mm-surface);
  border: 1px solid var(--mm-line);
  border-radius: var(--mm-radius);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mm-blue);
  font-weight: 700;
}
h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.03em;
}
.hint {
  margin: 0 0 8px;
  color: var(--mm-muted);
  font-size: 13px;
  line-height: 1.55;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #3c4043;
}
input {
  border: 1px solid var(--mm-line-strong);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}
button {
  margin-top: 8px;
  border: none;
  border-radius: 999px;
  padding: 10px 14px;
  background: var(--mm-blue);
  color: #fff;
  font-weight: 650;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: var(--mm-red);
  font-size: 13px;
  margin: 0;
}
.footer {
  font-size: 13px;
  color: var(--mm-muted);
  margin: 4px 0 0;
}
.footer a {
  color: var(--mm-blue);
}
</style>
