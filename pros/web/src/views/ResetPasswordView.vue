<script setup lang="ts">
/**
 * 找回密码页：三步流程。
 *
 *   第一步 填写邮箱  →  服务端发六位数字验证码到邮箱
 *   第二步 填写验证码 →  第三步 设置新密码
 *
 * 为什么做成三步而不是一个长表单：
 * 1. 邮箱和验证码之间必须有一次"等待邮件"的动作，分步能自然地表达这个等待；
 * 2. 用户在第一步填错邮箱时，只有邮箱这一个字段可以错，不用面对一堆字段；
 * 3. 验证码需要冷却重发，单独成步才有地方放倒计时和重发按钮。
 *
 * 安全上的两个约定：
 * - 无论邮箱是否注册，第一步的提示文案完全一样，不泄露账号是否存在；
 * - 提交期间有遮罩并锁住按钮，防止重复提交。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { confirmResetPassword, requestResetCode, verifyResetCode } from '../api/auth'
import { ApiError } from '../api/http'
import { friendlyApiMessage } from '../utils/apiMessage'
import { isResetCodeBlank, isResetCodeComplete } from '../utils/resetCode'
import AuthField from '../components/ui/AuthField.vue'
import AuthSubmitOverlay from '../components/ui/AuthSubmitOverlay.vue'
import ResetCodeField from '../components/ui/ResetCodeField.vue'
import { ICON_LOCK, ICON_MAIL, authIcon } from '../components/ui/authIcons'

const router = useRouter()

/** 当前步骤：0 邮箱、1 验证码、2 新密码。 */
const step = ref(0)
const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const sending = ref(false)
const message = ref('')
/** 重发冷却剩余秒数。 */
const cooldown = ref(0)
/** 开发模式下服务端会把验证码直接返回，省去查日志。 */
const debugCode = ref('')
/**
 * 验证码校验通过后，服务端签发的一次性改密令牌。
 *
 * 为什么不把验证码直接带到第三步去改密码：六位数字只有一百万种组合，
 * 不足以充当写操作的凭证；而且令牌一次性，改完密码立刻作废，
 * 即使令牌在传输中被截获也无法二次使用。
 */
const sessionToken = ref('')
let ticker: ReturnType<typeof setInterval> | undefined

/** 密码是否以明文显示。默认隐藏，防止旁观者一眼看到密码。 */
const showPassword = ref(false)
const passwordType = computed(() => (showPassword.value ? 'text' : 'password'))

/** 步骤标题和说明。 */
const stepTitle = computed(() => {
  if (step.value === 0) return '找回密码'
  if (step.value === 1) return '输入验证码'
  return '设置新密码'
})

const stepHint = computed(() => {
  if (step.value === 0) return '输入注册时使用的邮箱，我们会发送一组六位数字验证码。'
  if (step.value === 1) return `验证码已发送至 ${email.value}，请查收后填入下方。`
  return '验证码已通过验证，请设置一个新的登录密码。'
})

/** 邮箱格式是否合法。 */
const emailValid = computed(() => {
  const mail = email.value.trim()
  return mail.includes('@') && !mail.startsWith('@') && !mail.endsWith('@')
})

/** 密码是否满足服务端规则（至少 6 位、不超过 72 字节）。 */
const passwordValid = computed(() => password.value.length >= 6 && password.value.length <= 72)

/** 两次输入是否一致。 */
const passwordMatched = computed(() => password.value === confirmPassword.value)

/**
 * 从 429 响应体里读出服务端要求等待的秒数。
 *
 * 服务端在限流时既发 Retry-After 头，也在响应体里放 retryAfterSeconds。
 * 前端用的是 fetch，头可以被 CORS 策略裁掉，响应体一定在，所以只读体。
 */
function readRetryAfter(body: unknown): number {
  if (!body || typeof body !== 'object') return 0
  const value = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value)
}

/**
 * 发送验证码。
 *
 * 服务端在「统一响应」模式下，无论邮箱是否存在都返回同样的成功信息，
 * 所以这里不能根据响应判断账号是否存在 —— 那正是服务端要隐藏的信息。
 */
async function sendCode() {
  if (sending.value || cooldown.value > 0) return
  if (!emailValid.value) {
    message.value = '请输入有效的邮箱地址。'
    return
  }
  sending.value = true
  message.value = ''
  // 重新发码意味着旧码作废，之前换到的改密令牌也必须一起丢弃，
  // 否则用户可能用一个"对应旧验证码"的令牌去改密码。
  sessionToken.value = ''
  try {
    const res = await requestResetCode({ email: email.value.trim() })
    debugCode.value = res.debugCode ?? ''
    cooldown.value = res.cooldownSeconds ?? 60
    step.value = 1
    // 开发模式下直接把验证码填进去，省去人工抄写。
    if (debugCode.value) code.value = debugCode.value
  } catch (e: unknown) {
    // 限流时服务端告诉我们要等多少秒，直接拿它驱动倒计时，
    // 让重发按钮和真实冷却保持一致，而不是让用户盲等到下次被拒。
    if (e instanceof ApiError && e.status === 429) {
      const wait = readRetryAfter(e.body)
      if (wait > 0) cooldown.value = wait
      message.value = wait > 0 ? `发送太频繁，请 ${wait} 秒后再试。` : '发送太频繁，请稍后再试。'
    } else {
      message.value = friendlyApiMessage(e, '验证码发送失败')
    }
  } finally {
    sending.value = false
  }
}

/** 校验验证码并进入第三步。 */
async function verifyCode() {
  if (busy.value) return
  // 用户从第三步退回来时，令牌已经拿到了，直接前进即可。
  // 如果这里再打一次 verify，服务端会拒绝（验证码已被本次校验消耗）。
  if (sessionToken.value) {
    step.value = 2
    return
  }
  if (isResetCodeBlank(code.value)) {
    message.value = '请输入邮件里收到的六位数字验证码。'
    return
  }
  if (!isResetCodeComplete(code.value)) {
    message.value = '验证码是六位数字，请填满所有格子。'
    return
  }
  busy.value = true
  message.value = ''
  try {
    // 这一步只校验验证码，不改密码。校验通过后服务端返回一次性令牌，
    // 真正的改密留到第三步，这样新密码不合规时可以原地重填，
    // 不必重新收一封邮件。
    const res = await verifyResetCode({
      email: email.value.trim(),
      code: code.value.trim(),
    })
    sessionToken.value = res.sessionToken
    step.value = 2
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '验证码校验失败')
  } finally {
    busy.value = false
  }
}

/** 设置新密码并提交。 */
async function submitPassword() {
  if (busy.value) return
  if (!sessionToken.value) {
    // 令牌丢了（例如刷新过页面）只能从头再来。
    step.value = 0
    message.value = '本次验证已失效，请重新获取验证码。'
    return
  }
  if (!passwordValid.value) {
    message.value = '密码至少 6 位，且不超过 72 字节。'
    return
  }
  if (!passwordMatched.value) {
    message.value = '两次输入的密码不一致。'
    return
  }
  busy.value = true
  message.value = ''
  try {
    await confirmResetPassword({
      sessionToken: sessionToken.value,
      newPassword: password.value,
    })
    // 令牌已经兑现成新密码，本地不再保留。
    sessionToken.value = ''
    // 重置成功后回到登录页，用户用新密码登录。
    router.replace({ name: 'login', query: { reset: 'done' } })
  } catch (e: unknown) {
    message.value = friendlyApiMessage(e, '密码重置失败')
  } finally {
    busy.value = false
  }
}

/**
 * 表单提交入口。
 *
 * 三步流程里"回车"应该等价于当前步骤的主按钮：
 * 第一步发码、第二步校验、第三步保存，否则用户按回车只会得到一次无反应的表单提交。
 */
function onSubmit() {
  if (busy.value || sending.value) return
  if (step.value === 0) {
    void sendCode()
    return
  }
  if (step.value === 1) {
    void verifyCode()
    return
  }
  void submitPassword()
}

/** 返回上一步。 */
function goBack() {
  if (step.value === 0) {
    router.replace({ name: 'login' })
    return
  }
  // 从第三步退回第二步时保留令牌：验证码已经被消耗，
  // 再让用户填一次同样的码只会换来"验证码已使用"。
  step.value -= 1
  message.value = ''
}

onMounted(() => {
  document.title = '找回密码 · 元矩阵 MetaMatrix'
  ticker = setInterval(() => {
    if (cooldown.value > 0) cooldown.value -= 1
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div class="auth-page">
    <form class="auth-card" novalidate @submit.prevent="onSubmit">
      <div class="auth-brand">
        <span class="auth-brand__mark" aria-hidden="true">M</span>
        <span>
          <span class="auth-brand__name">MetaMatrix</span>
          <span class="auth-brand__sub">元矩阵 · 画布工作台</span>
        </span>
      </div>

      <div class="auth-heading">
        <p class="auth-eyebrow">账号找回</p>
        <h1 class="auth-title">{{ stepTitle }}</h1>
        <p class="auth-hint">{{ stepHint }}</p>
      </div>

      <!-- 步骤指示器：让用户知道自己在流程的哪个位置。 -->
      <ol class="reset-steps" aria-label="重置密码步骤">
        <li
          v-for="(label, index) in ['验证邮箱', '输入验证码', '设置密码']"
          :key="label"
          class="reset-steps__item"
          :class="{
            'is-active': index === step,
            'is-done': index < step,
          }"
          :aria-current="index === step ? 'step' : undefined"
        >
          <span class="reset-steps__dot">{{ index < step ? '✓' : index + 1 }}</span>
          <span class="reset-steps__label">{{ label }}</span>
        </li>
      </ol>

      <div class="auth-fields">
        <!-- 第一步：邮箱 -->
        <template v-if="step === 0">
          <AuthField
            id="reset-email"
            v-model="email"
            label="注册邮箱"
            type="email"
            placeholder="name@example.com"
            :icon="authIcon(ICON_MAIL)"
            required
            autocomplete="username"
            :aria-invalid="Boolean(message)"
          />
        </template>

        <!-- 第二步：验证码 -->
        <template v-else-if="step === 1">
          <ResetCodeField
            v-model="code"
            :cooldown-seconds="cooldown"
            :sending="sending"
            @resend="sendCode"
          />
          <p v-if="debugCode" class="auth-field__hint auth-field__hint--debug">
            开发模式：服务端返回的验证码是 {{ debugCode }}
          </p>
        </template>

        <!-- 第三步：新密码 -->
        <template v-else>
          <AuthField
            id="reset-password"
            v-model="password"
            label="新密码"
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
                <span class="auth-field__toggle-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="3.1" />
                  </svg>
                </span>
              </button>
            </template>
          </AuthField>

          <AuthField
            id="reset-password-2"
            v-model="confirmPassword"
            label="确认新密码"
            :type="passwordType"
            placeholder="再输入一次"
            :icon="authIcon(ICON_LOCK)"
            required
            minlength="6"
            maxlength="72"
            autocomplete="new-password"
            :aria-invalid="Boolean(message) && !passwordMatched"
          />
        </template>
      </div>

      <p v-if="message" class="auth-alert" role="alert">
        <span class="auth-alert__icon" aria-hidden="true">!</span>
        <span>{{ message }}</span>
      </p>

      <div class="reset-actions">
        <button type="button" class="reset-actions__back" @click="goBack">
          {{ step === 0 ? '返回登录' : '上一步' }}
        </button>
        <button
          v-if="step === 0"
          type="button"
          class="auth-submit reset-actions__primary"
          :disabled="sending || !emailValid"
          @click="sendCode"
        >
          {{ sending ? '发送中…' : '发送验证码' }}
        </button>
        <button
          v-else-if="step === 1"
          type="button"
          class="auth-submit reset-actions__primary"
          :disabled="busy || !isResetCodeComplete(code)"
          @click="verifyCode"
        >
          {{ busy ? '校验中…' : '下一步' }}
        </button>
        <button
          v-else
          type="submit"
          class="auth-submit reset-actions__primary"
          :disabled="busy || !passwordValid || !passwordMatched"
        >
          {{ busy ? '保存中…' : '确认修改密码' }}
        </button>
      </div>

      <p class="auth-footer">
        想起来了？
        <router-link :to="{ name: 'login' }">返回登录</router-link>
      </p>
    </form>

    <AuthSubmitOverlay
      :visible="busy && step === 2"
      title="正在保存新密码"
      :stages="['正在校验改密令牌', '正在生成密码摘要', '正在写入数据库']"
    />
  </div>
</template>
