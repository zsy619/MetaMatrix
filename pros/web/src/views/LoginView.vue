<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { friendlyApiMessage } from '../utils/apiMessage'
import { safeRedirect } from '../utils/safeRedirect'
import { isCaptchaBlank, isCaptchaErrorCode } from '../utils/captcha'
import { ApiError } from '../api/http'
import CaptchaField from '../components/ui/CaptchaField.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const captchaCode = ref('')
const busy = ref(false)
const message = ref('')
const captchaRef = ref<InstanceType<typeof CaptchaField> | null>(null)

onMounted(() => {
  document.title = '登录 · 元矩阵 MetaMatrix'
})

async function submit() {
  busy.value = true
  message.value = ''
  try {
    if (isCaptchaBlank(captchaCode.value)) {
      message.value = '请输入图形验证码。'
      captchaRef.value?.refresh()
      return
    }
    await auth.login(email.value.trim(), password.value, {
      captchaId: captchaRef.value?.getCaptchaId() ?? '',
      captchaCode: captchaRef.value?.getCaptchaCode() ?? '',
    })
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '登录失败')
    // 验证码提交一次就作废，失败时自动换一张，避免用户反复提交同一张。
    if (e instanceof ApiError && isCaptchaErrorCode(e.code)) {
      captchaRef.value?.refresh()
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="auth-card" novalidate @submit.prevent="submit">
      <div class="auth-brand">
        <span class="auth-brand__mark" aria-hidden="true">M</span>
        <span>
          <span class="auth-brand__name">MetaMatrix</span>
          <span class="auth-brand__sub">元矩阵 · 画布工作台</span>
        </span>
      </div>

      <div class="auth-heading">
        <p class="auth-eyebrow">账号登录</p>
        <h1 class="auth-title">欢迎回来</h1>
        <p class="auth-hint">登录后只同步你自己的画布。会话保存在本机，离开账号后不会继续看到别人的文档。</p>
      </div>

      <div class="auth-fields">
        <label class="auth-field" for="login-email">
          <span class="auth-field__label">邮箱</span>
          <input
            id="login-email"
            v-model="email"
            class="auth-input"
            type="email"
            required
            autocomplete="username"
            placeholder="name@example.com"
            :aria-invalid="Boolean(message)"
          />
        </label>

        <label class="auth-field" for="login-password">
          <span class="auth-field__label">密码</span>
          <input
            id="login-password"
            v-model="password"
            class="auth-input"
            type="password"
            required
            autocomplete="current-password"
            placeholder="请输入密码"
            :aria-invalid="Boolean(message)"
          />
        </label>

        <CaptchaField ref="captchaRef" v-model="captchaCode" />
      </div>

      <p v-if="message" class="auth-alert" role="alert">
        <span class="auth-alert__icon" aria-hidden="true">!</span>
        <span>{{ message }}</span>
      </p>

      <button type="submit" class="auth-submit" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>

      <p class="auth-footer">
        还没有账号？
        <router-link :to="{ name: 'register', query: route.query }">注册</router-link>
      </p>
    </form>
  </div>
</template>
