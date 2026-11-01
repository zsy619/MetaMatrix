<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits<{ logout: [] }>()

const router = useRouter()
const auth = useAuthStore()
const menuOpen = ref(false)
const rootEl = ref<HTMLElement | null>(null)

/** 昵称：优先 displayName，其次 email */
const nickname = computed(() => {
  if (!auth.isAuthenticated) return '未登录'
  return auth.user?.displayName || auth.user?.email || '已登录用户'
})

/** 计划/层级风格副标题（无 plan 字段时用「已登录」） */
const subtitle = computed(() => {
  if (!auth.isAuthenticated) return '登录后同步文档与搜索'
  return '已登录'
})

/** 圆形头像：取首字符（中文一字 / 拉丁首字母） */
const avatarChar = computed(() => {
  if (!auth.isAuthenticated) return '?'
  const raw = (auth.user?.displayName || auth.user?.email || '').trim()
  if (!raw) return '?'
  const ch = Array.from(raw)[0] || '?'
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch
})

function goLogin() {
  menuOpen.value = false
  router.push({ name: 'login', query: { redirect: '/' } })
}

function goRegister() {
  menuOpen.value = false
  router.push({ name: 'register', query: { redirect: '/' } })
}

function goAccount() {
  menuOpen.value = false
  router.push({ name: 'account' })
}

function onLogout() {
  menuOpen.value = false
  auth.logout()
  emit('logout')
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function onDocPointerDown(e: PointerEvent) {
  if (!menuOpen.value) return
  const el = rootEl.value
  if (el && e.target instanceof Node && !el.contains(e.target)) {
    menuOpen.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="user-card"
    :class="{ 'user-card--guest': !auth.isAuthenticated, 'user-card--menu-open': menuOpen }"
  >
    <div class="avatar" aria-hidden="true">{{ avatarChar }}</div>
    <div class="meta">
      <div class="name" :title="nickname">{{ nickname }}</div>
      <div class="sub" :title="subtitle">{{ subtitle }}</div>
    </div>
    <div class="menu-wrap">
      <button
        type="button"
        class="ellipsis-btn"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        aria-label="账号菜单"
        title="更多"
        @click="toggleMenu"
      >
        <span class="ellipsis-glyph" aria-hidden="true">…</span>
      </button>
      <div v-if="menuOpen" class="menu" role="menu">
        <template v-if="auth.isAuthenticated">
          <button type="button" class="menu-item" role="menuitem" @click="goAccount">
            账户设置
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="onLogout">
            退出登录
          </button>
        </template>
        <template v-else>
          <button type="button" class="menu-item" role="menuitem" @click="goLogin">
            登录
          </button>
          <button type="button" class="menu-item menu-item--primary" role="menuitem" @click="goRegister">
            注册
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 12px;
  background: transparent;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #e8eaed;
  color: #3c4043;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

.user-card--guest .avatar {
  background: #e8eaed;
  color: #9aa0a6;
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  color: #202124;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.25;
  color: #9aa0a6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.ellipsis-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #80868b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.ellipsis-glyph {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  transform: translateY(-1px);
}

.ellipsis-btn:hover,
.user-card--menu-open .ellipsis-btn {
  background: rgba(32, 33, 36, 0.06);
  color: #3c4043;
}

.menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  min-width: 128px;
  padding: 4px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e8eaed;
  box-shadow: 0 8px 24px rgba(32, 33, 36, 0.12);
  z-index: 20;
}

.menu-item {
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 7px;
  background: transparent;
  padding: 8px 10px;
  font-size: 12.5px;
  color: #202124;
  cursor: pointer;
}

.menu-item:hover {
  background: rgba(32, 33, 36, 0.06);
}

.menu-item--primary {
  color: var(--cv-focus, #163044);
  font-weight: 600;
}
</style>
