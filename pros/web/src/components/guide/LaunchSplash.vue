<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { CATEGORY_ACCENT } from '../workspace/palette'
import type { TemplateCategory } from '../../stores/document'
import { LAUNCH_SKIP_KEY } from './launchSplash'

const emit = defineEmits<{ done: [skipNext: boolean] }>()

const themes: { id: TemplateCategory; label: string; line: string }[] = [
  { id: 'method', label: '方法框架', line: '双三角、五步法、Y 模型' },
  { id: 'growth', label: '产品增长', line: '商业模式、精益画布、价值主张' },
  { id: 'industry', label: '行业调研', line: '行业分析、波特五力、OSCAR' },
  { id: 'org', label: '组织协作', line: '7S、RACI、每日看板' },
  { id: 'review', label: '复盘总结', line: '周月季年、故障复盘' },
  { id: 'fde', label: 'FDE', line: '选场景、十格自检、试点' },
]

const coreColors = [
  CATEGORY_ACCENT.method,
  CATEGORY_ACCENT.growth,
  CATEGORY_ACCENT.industry,
  CATEGORY_ACCENT.org,
  CATEGORY_ACCENT.method,
  CATEGORY_ACCENT.review,
  CATEGORY_ACCENT.fde,
  CATEGORY_ACCENT.industry,
  CATEGORY_ACCENT.growth,
]

const skipBtn = ref<HTMLButtonElement | null>(null)
const skipNextInput = ref<HTMLInputElement | null>(null)
const enterBtn = ref<HTMLButtonElement | null>(null)
const leaving = ref(false)
const skipNext = ref(readSkipNext())

function readSkipNext(): boolean {
  try {
    return localStorage.getItem(LAUNCH_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function close() {
  if (leaving.value) return
  leaving.value = true
  window.setTimeout(() => emit('done', skipNext.value), prefersReducedMotion() ? 0 : 280)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const nodes = [skipBtn.value, skipNextInput.value, enterBtn.value].filter((node): node is HTMLElement => node != null)
  if (nodes.length < 2) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  enterBtn.value?.focus()
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="splash" :class="{ 'is-leaving': leaving }" role="dialog" aria-modal="true" aria-labelledby="launch-title" aria-describedby="launch-lead">
    <button ref="skipBtn" type="button" class="skip mm-btn mm-btn--ghost" @click="close">跳过</button>
    <div class="stage">
      <p class="eyebrow">MetaMatrix</p>
      <div class="matrix" aria-hidden="true">
        <div class="cell" style="--d: 0.05s; --x: -40px; --y: -28px">
          <svg viewBox="0 0 72 52">
            <polygon points="36,6 62,44 10,44" fill="none" stroke="#1a73e8" stroke-width="1.6" />
            <polygon points="36,18 52,42 20,42" fill="rgba(26,115,232,0.16)" stroke="#174ea6" stroke-width="1.2" />
          </svg>
        </div>
        <div class="cell" style="--d: 0.12s; --x: 0px; --y: -36px">
          <svg viewBox="0 0 72 52">
            <g fill="rgba(52,168,83,0.16)" stroke="#188038" stroke-width="1">
              <rect x="6" y="6" width="18" height="12" rx="2" />
              <rect x="27" y="6" width="18" height="12" rx="2" />
              <rect x="48" y="6" width="18" height="12" rx="2" />
              <rect x="6" y="20" width="18" height="12" rx="2" />
              <rect x="27" y="20" width="18" height="12" rx="2" fill="#34a853" stroke="#188038" />
              <rect x="48" y="20" width="18" height="12" rx="2" />
              <rect x="6" y="34" width="18" height="12" rx="2" />
              <rect x="27" y="34" width="18" height="12" rx="2" />
              <rect x="48" y="34" width="18" height="12" rx="2" />
            </g>
          </svg>
        </div>
        <div class="cell" style="--d: 0.19s; --x: 40px; --y: -28px">
          <svg viewBox="0 0 72 52">
            <rect x="8" y="28" width="8" height="16" rx="1.5" fill="#f9a825" />
            <rect x="20" y="18" width="8" height="26" rx="1.5" fill="#f9ab00" />
            <rect x="32" y="10" width="8" height="34" rx="1.5" fill="#f9a825" />
            <rect x="44" y="20" width="8" height="24" rx="1.5" fill="rgba(249,168,37,0.55)" />
            <rect x="56" y="14" width="8" height="30" rx="1.5" fill="#e37400" />
          </svg>
        </div>
        <div class="cell" style="--d: 0.28s; --x: -46px; --y: 0px">
          <svg viewBox="0 0 72 52">
            <rect x="6" y="8" width="16" height="36" rx="3" fill="rgba(161,66,244,0.12)" stroke="#a142f4" />
            <rect x="28" y="8" width="16" height="36" rx="3" fill="rgba(161,66,244,0.12)" stroke="#a142f4" />
            <rect x="50" y="8" width="16" height="36" rx="3" fill="rgba(161,66,244,0.12)" stroke="#a142f4" />
            <rect x="9" y="14" width="10" height="6" rx="1.5" fill="#a142f4" />
            <rect x="31" y="14" width="10" height="6" rx="1.5" fill="#a142f4" />
            <rect x="31" y="24" width="10" height="6" rx="1.5" fill="rgba(161,66,244,0.45)" />
            <rect x="53" y="14" width="10" height="6" rx="1.5" fill="#a142f4" />
          </svg>
        </div>
        <div class="cell cell--core" style="--d: 0.7s; --x: 0px; --y: 10px">
          <span
            v-for="(color, index) in coreColors"
            :key="index"
            class="dot"
            :style="{ background: color, animationDelay: `${1.02 + index * 0.04}s` }"
          />
        </div>
        <div class="cell" style="--d: 0.36s; --x: 46px; --y: 0px">
          <svg viewBox="0 0 72 52">
            <circle cx="36" cy="26" r="14" fill="none" stroke="#ea4335" stroke-width="1.6" />
            <path d="M36 14a12 12 0 0 1 10.2 5.8" fill="none" stroke="#ea4335" stroke-width="1.6" stroke-linecap="round" />
            <path d="M44 16.5l3.2 4.2-5.2.2" fill="none" stroke="#ea4335" stroke-width="1.6" stroke-linejoin="round" />
            <circle cx="36" cy="26" r="3" fill="rgba(234,67,53,0.2)" />
          </svg>
        </div>
        <div class="cell" style="--d: 0.44s; --x: -36px; --y: 32px">
          <svg viewBox="0 0 72 52">
            <polygon points="36,8 60,42 12,42" fill="none" stroke="#0f766e" stroke-width="1.4" />
            <polygon points="36,16 52,38 20,38" fill="none" stroke="rgba(15,118,110,0.45)" stroke-width="1" />
            <polygon points="36,14 54,40 22,36" fill="rgba(15,118,110,0.28)" stroke="#0f766e" stroke-width="1.3" />
          </svg>
        </div>
        <div class="cell" style="--d: 0.52s; --x: 0px; --y: 40px">
          <svg viewBox="0 0 72 52">
            <rect x="8" y="10" width="56" height="6" rx="3" fill="#1a73e8" />
            <rect x="14" y="20" width="44" height="6" rx="3" fill="rgba(26,115,232,0.72)" />
            <rect x="20" y="30" width="32" height="6" rx="3" fill="rgba(26,115,232,0.45)" />
            <rect x="26" y="40" width="20" height="6" rx="3" fill="rgba(26,115,232,0.28)" />
          </svg>
        </div>
        <div class="cell" style="--d: 0.6s; --x: 36px; --y: 32px">
          <svg viewBox="0 0 72 52">
            <rect x="8" y="8" width="24" height="16" rx="3" fill="rgba(52,168,83,0.2)" stroke="#188038" />
            <rect x="40" y="8" width="24" height="16" rx="3" fill="#34a853" />
            <rect x="8" y="28" width="24" height="16" rx="3" fill="rgba(52,168,83,0.45)" stroke="#188038" />
            <rect x="40" y="28" width="24" height="16" rx="3" fill="rgba(52,168,83,0.16)" stroke="#188038" />
          </svg>
        </div>
      </div>

      <h1 id="launch-title" class="reveal" style="--d: 1.12s">元矩阵</h1>
      <p id="launch-lead" class="lead reveal" style="--d: 1.26s">
        选择一张画布，把问题拆开、看清，再决定下一步。
      </p>
      <ul class="themes">
        <li
          v-for="(theme, index) in themes"
          :key="theme.id"
          class="reveal"
          :style="{ '--d': `${1.4 + index * 0.06}s`, '--accent': CATEGORY_ACCENT[theme.id] }"
        >
          <strong>{{ theme.label }}</strong>
          <span>{{ theme.line }}</span>
        </li>
      </ul>
      <label class="skip-next reveal" style="--d: 1.72s">
        <input ref="skipNextInput" v-model="skipNext" type="checkbox" />
        下次不再展示
      </label>
      <button ref="enterBtn" type="button" class="go mm-btn mm-btn--primary reveal" style="--d: 1.82s" @click="close">
        开始选择画布
      </button>
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 20px 32px;
  overflow: auto;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, #e8f0fe 0%, transparent 55%),
    #fafafa;
  color: #202124;
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.splash.is-leaving {
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
}
.skip {
  position: absolute;
  top: 16px;
  right: 16px;
}
.stage {
  width: min(680px, 100%);
  text-align: center;
}
.eyebrow {
  margin: 0 0 16px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1a73e8;
  font-weight: 600;
}
.matrix {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 92px));
  gap: 12px;
  width: max-content;
  margin: 0 auto;
}
.matrix::after {
  content: '';
  position: absolute;
  inset: -12px;
  border: 1px solid rgba(26, 115, 232, 0.22);
  border-radius: 22px;
  opacity: 0;
  animation: ring 0.7s ease 0.95s forwards;
  pointer-events: none;
}
.cell {
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 14px;
  box-shadow: 0 8px 18px rgba(32, 33, 36, 0.06);
  opacity: 0;
  transform: translate(var(--x), var(--y)) scale(0.84);
  animation: lock 0.62s cubic-bezier(0.16, 0.84, 0.32, 1) forwards;
  animation-delay: var(--d);
}
.cell svg {
  width: 72px;
  height: 52px;
}
.cell--core {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  padding: 10px;
}
.dot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  opacity: 0;
  transform: scale(0.4);
  animation: pop 0.32s ease forwards;
}
.reveal {
  opacity: 0;
  transform: translateY(10px);
  animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  animation-delay: var(--d, 1s);
}
h1 {
  margin: 18px 0 8px;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.lead {
  margin: 0 auto;
  max-width: 36em;
  color: #5f6368;
  font-size: 16px;
  line-height: 1.6;
}
.themes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 18px 0 20px;
  padding: 0;
  list-style: none;
  text-align: left;
}
.themes li {
  min-width: 0;
  padding: 8px 10px 8px 12px;
  border: 1px solid #e8eaed;
  border-left: 3px solid var(--accent, #1a73e8);
  border-radius: 12px;
  background: #fff;
}
.themes strong,
.themes span {
  display: block;
}
.themes strong {
  font-size: 13px;
  font-weight: 700;
}
.themes span {
  margin-top: 2px;
  color: #5f6368;
  font-size: 12px;
  line-height: 1.4;
}
.skip-next {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin: 0 0 14px;
  color: #5f6368;
  font-size: 14px;
  cursor: pointer;
}
.skip-next input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #1a73e8;
}
.go {
  min-width: 168px;
  padding: 10px 22px;
  font-size: 15px;
}
@keyframes lock {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes pop {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes rise {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ring {
  to {
    opacity: 1;
  }
}
@media (max-width: 720px) {
  .matrix {
    grid-template-columns: repeat(3, minmax(0, 78px));
    gap: 8px;
  }
  .cell {
    height: 58px;
  }
  .themes {
    grid-template-columns: 1fr 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell,
  .dot,
  .reveal,
  .matrix::after {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
  .splash.is-leaving {
    transition: none;
  }
}
</style>
