<script setup lang="ts">
/**
 * 图形验证码输入区：左边是一个"单框六格"的答案框，右边是服务端下发的图片。
 * 点击图片即可刷新。验证码由服务端校验，前端只负责取图和提交。
 *
 * 为什么做成"一个输入框 + 六个等分格子"而不是普通单行文本框：
 * 1. 六个字符在框内等距排布，用户一眼就知道要填几位、填到第几位；
 * 2. 格子给出明确的视觉锚点，比一串挤在一起的字符更易核对；
 * 3. 仍然是同一个原生 input，粘贴、移动端键盘、浏览器自动填充全部照旧。
 *
 * 真正的输入仍然是这个 input（透明文字盖在格子上），格子里显示的是
 * model 的实时映射，因此不会出现"框里显示的和实际提交的不一致"。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCaptcha } from '../../api/auth'
import { CAPTCHA_LENGTH, normalizeCaptchaCode } from '../../utils/captcha'

const model = defineModel<string>({ default: '' })

/** 格子数量与服务端生成的位数保持一致。 */
const SLOT_COUNT = CAPTCHA_LENGTH

const image = ref('')
const captchaId = ref('')
const debugAnswer = ref('')
const loading = ref(false)
const failed = ref('')
const expiresAt = ref('')
const now = ref(Date.now())
/** 当前焦点落在第几格，用于高亮"下一个要填"的位置。 */
const activeSlot = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined

/** 距离这张验证码过期的秒数，用于倒计时提示。 */
const remainSeconds = computed(() => {
  if (!expiresAt.value) return 0
  const left = Math.floor((new Date(expiresAt.value).getTime() - now.value) / 1000)
  return left > 0 ? left : 0
})

/**
 * 已经填好的字符，按格子切开。服务端出的是大写字母 + 数字，所以这里统一
 * 转大写，用户用小写键盘敲字母也照样能对上。
 */
const slots = computed(() => {
  const chars = normalizeCaptchaCode(model.value).split('')
  return Array.from({ length: SLOT_COUNT }, (_, i) => chars[i] ?? '')
})

/** 答案是否已经填满所有格子。 */
const filled = computed(() => slots.value.every((c) => c !== ''))

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const challenge = await fetchCaptcha()
    image.value = challenge.image
    captchaId.value = challenge.captchaId
    expiresAt.value = challenge.expiresAt ?? ''
    now.value = Date.now()
    // 只有 API 开了 CAPTCHA_DEBUG 才会有这个值，供本地/CI 自动化脚本读取。
    debugAnswer.value = challenge.debugAnswer ?? ''
  } catch {
    image.value = ''
    captchaId.value = ''
    expiresAt.value = ''
    debugAnswer.value = ''
    failed.value = '验证码加载失败，点击图片重试。'
  } finally {
    loading.value = false
  }
}

function refresh() {
  model.value = ''
  activeSlot.value = 0
  void load()
}

/**
 * 输入时同步两件事：
 * 1. 把内容规范成大写字母并截断到 4 位，避免多敲的内容影响提交；
 * 2. 更新高亮格子，让用户知道光标"逻辑上"在哪一格。
 */
function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  const cleaned = normalizeCaptchaCode(target.value)
  // 回写 DOM，避免用户看到原始的小写/非法字符。
  if (target.value !== cleaned) {
    target.value = cleaned
  }
  model.value = cleaned
  activeSlot.value = Math.min(cleaned.length, SLOT_COUNT - 1)
}

/** 粘贴整段答案时也走同一套清洗逻辑。 */
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const cleaned = normalizeCaptchaCode(text)
  if (!cleaned) return
  event.preventDefault()
  model.value = cleaned
  activeSlot.value = Math.min(cleaned.length, SLOT_COUNT - 1)
}

/** 退格时高亮格要跟着回退，否则光标位置会"卡"在最后一格。 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace' && model.value) {
    activeSlot.value = Math.max(0, model.value.length - 1)
  }
}

onMounted(() => {
  void load()
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

defineExpose({
  refresh,
  getCaptchaId: () => captchaId.value,
  getCaptchaCode: () => normalizeCaptchaCode(model.value),
})
</script>

<template>
  <div class="auth-field">
    <span class="auth-field__label">图形验证码</span>
    <div class="captcha__row">
      <div class="captcha__code" :class="{ 'is-filled': filled }">
        <!-- 四个等分格子，纯展示。 -->
        <div class="captcha__slots" aria-hidden="true">
          <span
            v-for="(char, index) in slots"
            :key="index"
            class="captcha__slot"
            :class="{ 'is-active': index === activeSlot && !filled }"
          >{{ char }}</span>
        </div>
        <!--
          真正的输入框铺满整个容器，文字设为透明。
          这样点击任意一格都能聚焦，粘贴和移动端键盘也照常工作。
        -->
        <input
          id="captcha-code"
          class="captcha__input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          :maxlength="SLOT_COUNT"
          :value="model"
          :aria-label="`图形验证码，${SLOT_COUNT} 位字母数字`"
          aria-describedby="captcha-hint"
          @input="onInput"
          @paste="onPaste"
          @keydown="onKeydown"
          @focus="activeSlot = Math.min(model.length, SLOT_COUNT - 1)"
        />
      </div>
      <button
        type="button"
        class="captcha__image"
        :disabled="loading"
        :data-captcha-id="captchaId"
        :data-debug-answer="debugAnswer || undefined"
        title="点击刷新验证码"
        aria-label="刷新图形验证码"
        @click="refresh"
      >
        <img v-if="image" :src="image" alt="图形验证码，点击刷新" />
        <span v-else class="captcha__placeholder">{{ loading ? '加载中…' : '点击获取' }}</span>
      </button>
    </div>
    <p id="captcha-hint" class="auth-field__hint">
      <span v-if="failed" class="auth-field__error">{{ failed }}</span>
      <span v-else-if="remainSeconds > 0">看不清？点击图片换一张，{{ remainSeconds }} 秒后过期。</span>
      <span v-else>看不清？点击图片换一张。</span>
    </p>
  </div>
</template>

<style scoped>
.captcha__row {
  display: flex;
  gap: 10px;
  align-items: stretch;
  min-width: 0;
}

/* 单框多格：外层是一个输入框样式的容器，内部等分格子。 */
.captcha__code {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 5px;
  border: 1px solid var(--mm-line-strong);
  border-radius: 10px;
  background: var(--mm-surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.captcha__code:hover {
  border-color: #c4c7c5;
}
.captcha__code:focus-within {
  border-color: var(--mm-blue);
  box-shadow: var(--mm-focus);
}

.captcha__slots {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  min-width: 0;
  pointer-events: none;
}

.captcha__slot {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 650;
  line-height: 1;
  color: var(--mm-text);
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'Courier New', monospace;
  letter-spacing: 0;
  transition: color 0.15s ease;
}

/* 下一个待填的格子：底色提示，用户一眼知道从哪儿继续。 */
.captcha__slot.is-active {
  color: var(--mm-blue);
}
.captcha__slot.is-active::after {
  content: '';
  display: block;
  width: 18px;
  height: 2px;
  margin: 6px auto 0;
  border-radius: 2px;
  background: var(--mm-blue);
}

/* 填满以后不再显示光标提示。 */
.captcha__code.is-filled .captcha__slot {
  color: var(--mm-green);
}

/* 真实输入框：铺满容器但文字透明，交互全部由它承担。 */
.captcha__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: transparent;
  caret-color: transparent;
  font-size: 16px;
  font-family: inherit;
  outline: none;
}
/* 选中文本时不要出现浏览器默认的蓝色高亮块，盖住格子里的字母。 */
.captcha__input::selection {
  background: transparent;
}

.captcha__image {
  flex: 0 0 auto;
  /* 服务端下发的图是 240x64（3.75:1），这里用同比例的盒子，
     配合 object-fit: contain 就不会出现上下留白。 */
  width: 172px;
  height: 46px;
  padding: 0;
  border: 1px solid var(--mm-line-strong);
  border-radius: 10px;
  background: var(--mm-surface);
  cursor: pointer;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.captcha__image:hover:not(:disabled) {
  border-color: var(--mm-blue);
}
.captcha__image:focus-visible {
  outline: 2px solid var(--mm-blue);
  outline-offset: 2px;
}
.captcha__image:disabled {
  cursor: default;
  opacity: 0.7;
}
.captcha__image img {
  display: block;
  width: 100%;
  height: 100%;
  /* 服务端下发的图是 240x64 的 PNG，等比缩放，别把字符裁掉。 */
  object-fit: contain;
}
.captcha__placeholder {
  font-size: 12px;
  color: var(--mm-muted);
}
@media (max-width: 420px) {
  .captcha__image {
    /* 窄屏上图片等比缩小到 141x38，给 6 个格子留出空间。 */
    width: 141px;
    height: 38px;
  }
  .captcha__code {
    height: 38px;
  }
  .captcha__slot {
    font-size: 16px;
  }
}
</style>
