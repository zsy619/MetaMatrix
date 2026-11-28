<script setup lang="ts">
/**
 * 邮件验证码输入区：六格数字码，单框等分。
 *
 * 与 CaptchaField 用的是同一套"透明 input 盖在格子上"的结构，但有两个区别：
 * 1. 只接受数字（邮件里的码是六位数字）；
 * 2. 右边不是图片，而是一个"重新发送"按钮，倒计时期间禁用。
 *
 * 倒计时由父组件控制，因为"重新发送"和服务端的冷却时间是同一件事，
 * 放在组件内部会和服务端脱节。
 */
import { computed, ref } from 'vue'
import { RESET_CODE_LENGTH, normalizeResetCode } from '../../utils/resetCode'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 重新发送的冷却剩余秒数。大于 0 时禁用重发按钮。 */
    cooldownSeconds?: number
    /** 重发按钮是否处于请求中。 */
    sending?: boolean
    /** 是否显示重发按钮。 */
    showResend?: boolean
  }>(),
  { cooldownSeconds: 0, sending: false, showResend: true },
)

const emit = defineEmits<{ resend: [] }>()

const SLOT_COUNT = RESET_CODE_LENGTH

/** 当前焦点落在第几格，用于高亮"下一个要填"的位置。 */
const activeSlot = ref(0)

const slots = computed(() => {
  const chars = normalizeResetCode(model.value).split('')
  return Array.from({ length: SLOT_COUNT }, (_, i) => chars[i] ?? '')
})

/** 答案是否已经填满所有格子。 */
const filled = computed(() => slots.value.every((c) => c !== ''))

/** 重发按钮是否可用。 */
const canResend = computed(() => !props.sending && props.cooldownSeconds <= 0)

/** 重发按钮上的文字。 */
const resendText = computed(() => {
  if (props.sending) return '发送中…'
  if (props.cooldownSeconds > 0) return `${props.cooldownSeconds}s 后可重发`
  return '重新发送'
})

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  const cleaned = normalizeResetCode(target.value)
  if (target.value !== cleaned) {
    target.value = cleaned
  }
  model.value = cleaned
  activeSlot.value = Math.min(cleaned.length, SLOT_COUNT - 1)
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const cleaned = normalizeResetCode(text)
  if (!cleaned) return
  event.preventDefault()
  model.value = cleaned
  activeSlot.value = Math.min(cleaned.length, SLOT_COUNT - 1)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace' && model.value) {
    activeSlot.value = Math.max(0, model.value.length - 1)
  }
}
</script>

<template>
  <div class="auth-field">
    <span class="auth-field__label">邮件验证码</span>
    <div class="reset-code__row">
      <div class="reset-code__code" :class="{ 'is-filled': filled }">
        <div class="reset-code__slots" aria-hidden="true">
          <span
            v-for="(char, index) in slots"
            :key="index"
            class="reset-code__slot"
            :class="{ 'is-active': index === activeSlot && !filled }"
          >{{ char }}</span>
        </div>
        <input
          id="reset-code"
          class="reset-code__input"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          spellcheck="false"
          :maxlength="SLOT_COUNT"
          :value="model"
          :aria-label="`邮件验证码，${SLOT_COUNT} 位数字`"
          aria-describedby="reset-code-hint"
          @input="onInput"
          @paste="onPaste"
          @keydown="onKeydown"
          @focus="activeSlot = Math.min(model.length, SLOT_COUNT - 1)"
        />
      </div>
      <button
        v-if="showResend"
        type="button"
        class="reset-code__resend"
        :disabled="!canResend"
        :aria-label="resendText"
        @click="emit('resend')"
      >
        {{ resendText }}
      </button>
    </div>
    <p id="reset-code-hint" class="auth-field__hint">
      验证码已发送到该邮箱，10 分钟内有效。
    </p>
  </div>
</template>

<style scoped>
.reset-code__row {
  display: flex;
  gap: 10px;
  align-items: stretch;
  min-width: 0;
}

/* 单框多格：与图形验证码的结构一致。 */
.reset-code__code {
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
.reset-code__code:hover {
  border-color: #c4c7c5;
}
.reset-code__code:focus-within {
  border-color: var(--mm-blue);
  box-shadow: var(--mm-focus);
}

.reset-code__slots {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  min-width: 0;
  pointer-events: none;
}

.reset-code__slot {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-size: 20px;
  font-weight: 650;
  line-height: 1;
  color: var(--mm-text);
  font-family: 'SF Mono', 'Menlo', 'Consolas', 'Courier New', monospace;
  transition: color 0.15s ease;
}

/* 下一个待填的格子：底部横线提示光标位置。 */
.reset-code__slot.is-active {
  color: var(--mm-blue);
}
.reset-code__slot.is-active::after {
  content: '';
  display: block;
  width: 20px;
  height: 2px;
  margin: 6px auto 0;
  border-radius: 2px;
  background: var(--mm-blue);
}

/* 填满以后改用绿色，表示这一格已经完成。 */
.reset-code__code.is-filled .reset-code__slot {
  color: var(--mm-green);
}

/* 真实输入框：铺满容器但文字透明。 */
.reset-code__input {
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
.reset-code__input::selection {
  background: transparent;
}

/* 重新发送按钮。 */
.reset-code__resend {
  flex: 0 0 auto;
  min-width: 96px;
  padding: 0 12px;
  border: 1px solid var(--mm-line-strong);
  border-radius: 10px;
  background: var(--mm-surface);
  color: var(--mm-blue);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.reset-code__resend:hover:not(:disabled) {
  border-color: var(--mm-blue);
  background: var(--mm-blue-soft);
}
.reset-code__resend:focus-visible {
  outline: 2px solid var(--mm-blue);
  outline-offset: 2px;
}
.reset-code__resend:disabled {
  color: var(--mm-faint);
  border-color: var(--mm-line);
  background: var(--mm-bg);
  cursor: default;
}

@media (max-width: 420px) {
  .reset-code__code {
    height: 38px;
  }
  .reset-code__slot {
    font-size: 17px;
  }
  .reset-code__resend {
    min-width: 82px;
    font-size: 12px;
  }
}
</style>
