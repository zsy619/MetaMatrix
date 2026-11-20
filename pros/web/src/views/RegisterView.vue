<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { friendlyApiMessage } from '../utils/apiMessage'
import { safeRedirect } from '../utils/safeRedirect'
import { isCaptchaBlank } from '../utils/captcha'
import CaptchaField from '../components/ui/CaptchaField.vue'
import AuthField from '../components/ui/AuthField.vue'
import AuthSubmitOverlay from '../components/ui/AuthSubmitOverlay.vue'
import { ICON_EYE, ICON_EYE_OFF, ICON_LOCK, ICON_MAIL, ICON_USER, authIcon } from '../components/ui/authIcons'

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

/** 密码是否以明文显示。默认隐藏，防止旁观者一眼看到密码。 */
const showPassword = ref(false)
/** 输入框类型随 showPassword 切换。 */
const passwordType = computed(() => (showPassword.value ? 'text' : 'password'))
const passwordToggleIcon = computed(() =>
  authIcon(showPassword.value ? ICON_EYE_OFF : ICON_EYE),
)

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

/**
 * 提交注册。
 *
 * 防二次提交有两道闸：
 * 1. 遮罩层（AuthSubmitOverlay）铺满视口，鼠标点不到底下的表单；
 * 2. 这里的 busy 守卫，拦住键盘回车触发的表单提交 —— 遮罩挡不住回车。
 *
 * 注意顺序：本地校验放在 busy 置位之前，这样校验失败直接 return，
 * 不会闪现一下遮罩又立刻消失（那样看着像出错了）。
 */
async function submit() {
  if (busy.value) return
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
    // 验证码是一次性的：服务端在校验通过后就把这张图作废，不管账号能不能注册。
    // 只要这次提交失败就换一张，避免用户拿着作废的图重试。
    captchaRef.value?.refresh()
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
        <AuthField
          id="reg-name"
          v-model="displayName"
          label="显示名（可选）"
          type="text"
          placeholder="留空则使用邮箱前缀"
          :icon="authIcon(ICON_USER)"
          maxlength="64"
          autocomplete="nickname"
        />

        <AuthField
          id="reg-email"
          v-model="email"
          label="邮箱"
          type="email"
          placeholder="name@example.com"
          :icon="authIcon(ICON_MAIL)"
          required
          autocomplete="username"
          :aria-invalid="Boolean(message)"
        />

        <AuthField
          id="reg-password"
          v-model="password"
          label="密码"
          :type="passwordType"
          placeholder="至少 6 位"
          :icon="authIcon(ICON_LOCK)"
          has-trailing
          required
          minlength="6"
          maxlength="72"
          autocomplete="new-password"
          :aria-invalid="Boolean(message)"
        >
          <template #trailing>
            <button
              type="button"
              class="auth-field__toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              :title="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <span class="auth-field__toggle-icon" aria-hidden="true" v-html="passwordToggleIcon" />
            </button>
          </template>
          <template #hint>
            <p class="auth-strength">
              <span class="auth-strength__bar">
                <span class="auth-strength__fill" :style="{ width: strength.percent + '%', background: strength.color }" />
              </span>
              <span class="auth-strength__text">{{ strength.text }}</span>
            </p>
          </template>
        </AuthField>

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

    <!--
      提交遮罩。放在 .auth-page 内部而不是 body，避免 Teleport 带来的层级问题。
      stages 描述注册的三个真实阶段，让等待有节奏感。
    -->
    <AuthSubmitOverlay
      :visible="busy"
      title="正在创建账号"
      :stages="['正在校验图形验证码', '正在创建账号与密钥', '正在准备工作台']"
    />
  </div>
</template>
