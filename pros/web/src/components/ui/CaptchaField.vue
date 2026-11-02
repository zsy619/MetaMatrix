<script setup lang="ts">
/**
 * 图形验证码输入区：左边输入答案，右边显示服务端下发的图片。
 * 点击图片即可刷新。验证码由服务端校验，前端只负责取图和提交。
 */
import { onMounted, ref } from 'vue'
import { fetchCaptcha } from '../../api/auth'
import { normalizeCaptchaCode } from '../../utils/captcha'

const model = defineModel<string>({ default: '' })

const image = ref('')
const captchaId = ref('')
const debugAnswer = ref('')
const loading = ref(false)
const failed = ref('')

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const challenge = await fetchCaptcha()
    image.value = challenge.image
    captchaId.value = challenge.captchaId
    // 只有 API 开了 CAPTCHA_DEBUG 才会有这个值，供本地/CI 自动化脚本读取。
    debugAnswer.value = challenge.debugAnswer ?? ''
  } catch {
    image.value = ''
    captchaId.value = ''
    debugAnswer.value = ''
    failed.value = '验证码加载失败，点击图片重试。'
  } finally {
    loading.value = false
  }
}

function refresh() {
  model.value = ''
  void load()
}

onMounted(load)

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
      <input
        id="captcha-code"
        v-model="model"
        class="auth-input captcha__input"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="8"
        placeholder="请输入右侧字符"
        aria-describedby="captcha-hint"
      />
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
      <span v-else>看不清？点击图片换一张，5 分钟内有效。</span>
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
.captcha__input {
  flex: 1 1 auto;
  min-width: 0;
  letter-spacing: 0.08em;
}
.captcha__image {
  flex: 0 0 auto;
  width: 132px;
  height: 43px;
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
  object-fit: cover;
}
.captcha__placeholder {
  font-size: 12px;
  color: var(--mm-muted);
}
@media (max-width: 420px) {
  .captcha__image {
    width: 112px;
  }
}
</style>
