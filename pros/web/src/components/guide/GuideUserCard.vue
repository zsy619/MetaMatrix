<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits<{ logout: [] }>()

const router = useRouter()
const auth = useAuthStore()

const displayName = computed(() => {
  if (!auth.isAuthenticated) return '未登录'
  return auth.user?.displayName || auth.user?.email || '已登录用户'
})

const subtitle = computed(() => {
  if (!auth.isAuthenticated) return '登录后同步文档与搜索'
  const email = auth.user?.email
  if (email && email !== displayName.value) return email
  return '已登录'
})

const initials = computed(() => {
  const raw = (auth.user?.displayName || auth.user?.email || '').trim()
  if (!raw) return '?'
  const parts = raw.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return raw.slice(0, 2).toUpperCase()
})

function goLogin() {
  router.push({ name: 'login', query: { redirect: '/' } })
}

function goRegister() {
  router.push({ name: 'register', query: { redirect: '/' } })
}

function onLogout() {
  auth.logout()
  emit('logout')
}
</script>

<template>
  <div class="user-card" :class="{ 'user-card--guest': !auth.isAuthenticated }">
    <div class="avatar" aria-hidden="true">{{ initials }}</div>
    <div class="meta">
      <div class="name" :title="displayName">{{ displayName }}</div>
      <div class="sub" :title="subtitle">{{ subtitle }}</div>
    </div>
    <div class="actions">
      <template v-if="auth.isAuthenticated">
        <button type="button" class="btn-ghost" @click="onLogout">退出</button>
      </template>
      <template v-else>
        <button type="button" class="btn-ghost" @click="goLogin">登录</button>
        <button type="button" class="btn-primary" @click="goRegister">注册</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.user-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 14px 14px 12px;
  background: #ffffff;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%);
  color: #1a73e8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.user-card--guest .avatar {
  background: #f1f3f4;
  color: #80868b;
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13.5px;
  font-weight: 650;
  color: #202124;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  margin-top: 2px;
  font-size: 11.5px;
  color: #9aa0a6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.btn-ghost,
.btn-primary {
  border: 1px solid #dadce0;
  background: #ffffff;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12.5px;
  cursor: pointer;
  color: #202124;
}

.btn-primary {
  background: #1a73e8;
  border-color: #1a73e8;
  color: #ffffff;
}

.btn-ghost:hover {
  background: #f8f9fa;
}

.btn-primary:hover {
  filter: brightness(0.96);
}
</style>
