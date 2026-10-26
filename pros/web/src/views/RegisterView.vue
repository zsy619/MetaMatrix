<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const displayName = ref('')
const busy = ref(false)
const message = ref('')

async function submit() {
  busy.value = true
  message.value = ''
  try {
    await auth.register(email.value.trim(), password.value, displayName.value.trim() || undefined)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect || '/')
  } catch (e: unknown) {
    message.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="card" @submit.prevent="submit">
      <h1>注册 MetaMatrix</h1>
      <p class="hint">创建账号后即可把画布保存到 PostgreSQL（按用户隔离）。</p>
      <label>
        显示名（可选）
        <input v-model="displayName" type="text" autocomplete="nickname" />
      </label>
      <label>
        邮箱
        <input v-model="email" type="email" required autocomplete="username" />
      </label>
      <label>
        密码（至少 6 位）
        <input v-model="password" type="password" required minlength="6" autocomplete="new-password" />
      </label>
      <p v-if="message" class="error">{{ message }}</p>
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
