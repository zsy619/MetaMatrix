<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
const displayName = ref('')
const captchaCode = ref('')
const busy = ref(false)
const message = ref('')
const captchaRef = ref<InstanceType<typeof CaptchaField> | null>(null)

onMounted(() => {
  document.title = '注册 · 元矩阵 MetaMatrix'
})

/** 密码强度只做展示，最终规则仍以服务端为准。 */
const strength = computed(() => {
  const pwd = password.value
  if (!pwd) return { level: 0, percent: 0, text: '至少 6 位', color: 'var(--mm-line-strong)' }
  let score = 0
  if (pwd.length >= 6) score += 1
  if (pwd.length >= 10) score += 1
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1
  if (/\d/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1
  if (score <= 1) return { level: 1, percent: 25, text: '强度偏弱', color: 'var(--mm-red)' }
  if (score === 2) return { level: 2, percent: 55, text: '强度一般', color: 'var(--mm-amber)' }
  if (score === 3) return { level: 3, percent: 80, text: '强度较好', color: 'var(--mm-green)' }
  return { level: 4, percent: 100, text: '强度很强', color: 'var(--mm-green-solid)' }
})

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
  if (isCaptchaBlank(captchaCode.value)) {
    message.value = '请输入图形验证码。'
    captchaRef.value?.refresh()
    return
  }
  busy.value = true
  try {
    await auth.register(mail, password.value, displayName.value.trim() || undefined, {
      captchaId: captchaRef.value?.getCaptchaId() ?? '',
      captchaCode: captchaRef.value?.getCaptchaCode() ?? '',
    })
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '注册失败')
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
        <p class="auth-eyebrow">创建账号</p>
        <h1 class="auth-title">开始使用</h1>
        <p class="auth-hint">创建账号后，画布按登录用户隔离保存。密码至少 6 位，且不超过 72 个字节。</p>
      </div>

      <div class="auth-fields">
        <label class="auth-field" for="reg-name">
          <span class="auth-field__label">显示名（可选）</span>
          <input
            id="reg-name"
            v-model="displayName"
            class="auth-input"
            type="text"
            maxlength="64"
            autocomplete="nickname"
            placeholder="留空则使用邮箱前缀"
          />
        </label>

        <label class="auth-field" for="reg-email">
          <span class="auth-field__label">邮箱</span>
          <input
            id="reg-email"
            v-model="email"
            class="auth-input"
            type="email"
            required
            autocomplete="username"
            placeholder="name@example.com"
            :aria-invalid="Boolean(message)"
          />
        </label>

        <div class="auth-field">
          <label class="auth-field__label" for="reg-password">密码</label>
          <input
            id="reg-password"
            v-model="password"
            class="auth-input"
            type="password"
            required
            minlength="6"
            maxlength="72"
            autocomplete="new-password"
            placeholder="至少 6 位"
            :aria-invalid="Boolean(message)"
          />
          <p class="auth-strength">
            <span class="auth-strength__bar">
              <span class="auth-strength__fill" :style="{ width: strength.percent + '%', background: strength.color }" />
            </span>
            <span class="auth-strength__text">{{ strength.text }}</span>
          </p>
        </div>

        <CaptchaField ref="captchaRef" v-model="captchaCode" />
      </div>

      <p v-if="message" class="auth-alert" role="alert">
        <span class="auth-alert__icon" aria-hidden="true">!</span>
        <span>{{ message }}</span>
      </p>

      <button type="submit" class="auth-submit" :disabled="busy">
        {{ busy ? '注册中…' : '注册' }}
      </button>

      <p class="auth-footer">
        已有账号？
        <router-link :to="{ name: 'login', query: route.query }">登录</router-link>
      </p>
    </form>
  </div>
</template>
