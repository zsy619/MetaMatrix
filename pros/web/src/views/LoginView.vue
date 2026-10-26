<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('demo@metamatrix.local')
const password = ref('demo123456')
const busy = ref(false)
const message = ref('')

async function submit() {
  busy.value = true
  message.value = ''
  try {
    await auth.login(email.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect || '/')
  } catch (e: unknown) {
    message.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="card" @submit.prevent="submit">
      <h1>登录 MetaMatrix</h1>
      <p class="hint">使用邮箱登录后，画布会同步到服务端（多用户隔离）。</p>
      <label>
        邮箱
        <input v-model="email" type="email" required autocomplete="username" />
      </label>
      <label>
        密码
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="message" class="error">{{ message }}</p>
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
  background: #f8f9fa;
}
.card {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 12px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: 22px;
}
.hint {
  margin: 0 0 8px;
  color: #5f6368;
  font-size: 13px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #3c4043;
}
input {
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}
button {
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  background: #1a73e8;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #d93025;
  font-size: 13px;
  margin: 0;
}
.footer {
  font-size: 13px;
  color: #5f6368;
  margin: 4px 0 0;
}
</style>
