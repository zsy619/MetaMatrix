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
const busy = ref(false)
const message = ref('')

async function submit() {
  busy.value = true
  message.value = ''
  try {
    await auth.login(email.value.trim(), password.value)
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '登录失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="card" @submit.prevent="submit">
      <p class="eyebrow">MetaMatrix</p>
      <h1>登录</h1>
      <p class="hint">登录后只同步你自己的画布。会话保存在本机，离开账号后不会继续看到别人的文档。</p>
      <label for="login-email">
        邮箱
        <input
          id="login-email"
          v-model="email"
          type="email"
          required
          autocomplete="username"
          placeholder="name@example.com"
          :aria-invalid="Boolean(message)"
        />
      </label>
      <label for="login-password">
        密码
        <input
          id="login-password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          :aria-invalid="Boolean(message)"
        />
      </label>
      <p v-if="message" class="error" role="alert">{{ message }}</p>
      <button type="submit" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
      <p class="footer">
        还没有账号？
        <router-link :to="{ name: 'register', query: route.query }">注册</router-link>
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
