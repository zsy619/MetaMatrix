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
import BrandProgressBar from '../components/ui/BrandProgressBar.vue'
import { useSubmitProgress } from '../composables/useSubmitProgress'
import { ICON_EYE, ICON_EYE_OFF, ICON_LOCK, ICON_MAIL, authIcon } from '../components/ui/authIcons'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const captchaCode = ref('')
const busy = ref(false)
const message = ref('')
const captchaRef = ref<InstanceType<typeof CaptchaField> | null>(null)

/** 认证过程的阶段文案，驱动进度条与遮罩面板的文案同步。 */
const STAGES = ['正在校验图形验证码', '正在核对账号密码', '正在建立会话']

/** 提交进度（百分比 + 阶段）。 */
const progress = useSubmitProgress()

/** 密码是否以明文显示。默认隐藏，防止旁观者一眼看到密码。 */
const showPassword = ref(false)
/** 输入框类型随 showPassword 切换。 */
const passwordType = computed(() => (showPassword.value ? 'text' : 'password'))
const passwordToggleIcon = computed(() =>
  authIcon(showPassword.value ? ICON_EYE_OFF : ICON_EYE),
)

/**
 * 是否刚从"找回密码"流程回来。
 * 重置成功后路由会带 ?reset=done，这里据此显示一条成功提示，
 * 否则用户改完密码回到登录页会以为什么都没发生。
 */
const resetDone = computed(() => route.query.reset === 'done')

/**
 * 提交期间锁定输入区。
 * 用 v-bind 传对象而不是 :inert="busy"，是因为 Vue 没有把 inert 当布尔属性，
 * 直接绑定 false 会渲染成 inert="false"，而 inert 只要存在就生效。
 */
const fieldsAttrs = computed<Record<string, unknown>>(() => (busy.value ? { inert: '' } : {}))

onMounted(() => {
  document.title = '登录 · 元矩阵 MetaMatrix'
})

/**
 * 提交登录。
 *
 * 防二次提交有两道闸：
 * 1. 遮罩层（AuthSubmitOverlay）铺满视口，鼠标点不到底下的表单；
 * 2. 这里的 busy 守卫，拦住键盘回车触发的表单提交 —— 遮罩挡不住回车。
 * 单靠按钮 disabled 不够：表单里的 input 按 Enter 依然会触发 submit 事件。
 */
async function submit() {
  if (busy.value) return
  message.value = ''
  // 本地校验放在 busy 置位之前，校验失败直接返回，不会闪现遮罩。
  if (isCaptchaBlank(captchaCode.value)) {
    message.value = '请输入图形验证码。'
    captchaRef.value?.refresh()
    return
  }
  busy.value = true
  progress.start(STAGES.length)
  try {
    await auth.login(email.value.trim(), password.value, {
      captchaId: captchaRef.value?.getCaptchaId() ?? '',
      captchaCode: captchaRef.value?.getCaptchaCode() ?? '',
    })
    progress.complete()
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch (e: unknown) {
    progress.stop()
    message.value = friendlyApiMessage(e, '登录失败')
    // 验证码是一次性的：服务端在校验通过后就把这张图作废，不管密码对不对。
    // 所以只要这次提交失败就得换一张，否则用户会拿着已经作废的图重试，
    // 然后收到一句莫名其妙的「图形验证码不正确」。
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
        <p class="auth-eyebrow">账号登录</p>
        <h1 class="auth-title">欢迎回来</h1>
        <p class="auth-hint">登录后只同步你自己的画布。会话保存在本机，离开账号后不会继续看到别人的文档。</p>
      </div>

      <!-- 提交期间锁定输入，避免用户在等待时改动凭证造成状态不一致。 -->
      <div class="auth-fields" v-bind="fieldsAttrs">
        <AuthField
          id="login-email"
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
          id="login-password"
          v-model="password"
          label="密码"
          :type="passwordType"
          placeholder="请输入密码"
          :icon="authIcon(ICON_LOCK)"
          has-trailing
          required
          autocomplete="current-password"
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
        </AuthField>

        <!-- 忘记密码入口：放在密码框正下方，符合"想不起密码"时就近找出口的习惯。 -->
        <div class="auth-field__aux">
          <router-link class="auth-link" :to="{ name: 'reset-password' }">忘记密码？</router-link>
        </div>

        <CaptchaField ref="captchaRef" v-model="captchaCode" />
      </div>

      <p v-if="resetDone" class="auth-notice" role="status">
        <span class="auth-notice__icon" aria-hidden="true">✓</span>
        <span>密码已重置，请用新密码登录。</span>
      </p>

      <p v-if="message" class="auth-alert" role="alert">
        <span class="auth-alert__icon" aria-hidden="true">!</span>
        <span>{{ message }}</span>
      </p>

      <button
        type="submit"
        class="auth-submit"
        :class="{ 'is-busy': busy }"
        :disabled="busy"
        :aria-busy="busy"
      >
        <span class="auth-submit__label">{{ busy ? '登录中…' : '登录' }}</span>
        <!--
          按钮内的品牌进度条。始终占位（空闲时透明），
          这样按钮高度在提交前后完全一致，不会出现跳动。
        -->
        <BrandProgressBar
          class="auth-submit__progress"
          :percent="progress.percent.value"
          :active="busy"
          variant="light"
          size="sm"
          label="登录进度"
        />
      </button>

      <p class="auth-footer">
        还没有账号？
        <router-link :to="{ name: 'register', query: route.query }">注册</router-link>
      </p>
    </form>

    <!--
      提交遮罩。放在 .auth-page 内部而不是 body，避免 Teleport 带来的层级问题。
      stages 描述认证的三个真实阶段，让等待有节奏感。
    -->
    <AuthSubmitOverlay
      :visible="busy"
      title="正在登录"
      :stages="STAGES"
      :percent="progress.percent.value"
    />
  </div>
</template>
