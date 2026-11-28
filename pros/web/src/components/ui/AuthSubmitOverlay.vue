<script setup lang="ts">
/**
 * 登录 / 注册提交时的全屏遮罩 + 进度动画。
 *
 * 目的有两个：
 * 1. 阻断交互 —— 遮罩铺满视口并接管所有指针事件，用户点不到底下的表单，
 *    因此不可能二次提交。这比只把按钮置灰可靠：按钮置灰挡不住表单回车提交，
 *    也不挡得住用户连点 Enter。
 * 2. 给出"正在做什么"的反馈 —— 认证要跑一次网络往返（校验验证码 + 校验凭证 +
 *    签发令牌），期间必须告诉用户系统在忙，否则用户会以为没点上而重复操作。
 *
 * 视觉上复用 LaunchSplash 的"元矩阵"九宫格语言，让它和产品的开场动画是同一套符号，
 * 而不是随手塞一个通用 spinner。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BrandProgressBar from './BrandProgressBar.vue'

const props = withDefaults(
  defineProps<{
    /** 是否显示遮罩。 */
    visible: boolean
    /** 主文案，例如「正在登录」。 */
    title: string
    /**
     * 阶段文案，随时间推进依次展示。
     * 认证是一次不透明的网络往返，无法拿到真实进度，
     * 所以这里用阶段化的文案让等待显得有节奏，而不是一根卡住的进度条。
     */
    stages?: string[]
    /** 每个阶段的停留时长（毫秒）。 */
    stageInterval?: number
    /**
     * 确定进度百分比（0~100）。
     * 传入时面板显示确定进度条并由该值推导阶段文案；
     * 不传时退回内部计时器驱动的阶段切换 + 不确定进度条。
     */
    percent?: number
  }>(),
  { stages: () => [], stageInterval: 900, percent: -1 },
)

const stageIndex = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

/** 当前阶段文案。没有配置阶段时回落到主文案。 */
const stageText = computed(() => props.stages[stageIndex.value] ?? '')

/** 是否还有后续阶段，决定要不要显示阶段文案。 */
const hasStages = computed(() => props.stages.length > 0)

/** 是否由外部驱动确定进度。 */
const determinate = computed(() => props.percent >= 0)

function clearTimer() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  clearTimer()
  stageIndex.value = 0
  // 外部给定进度时阶段由进度推导，内部计时器让位，避免两套节奏打架。
  if (determinate.value) return
  if (props.stages.length <= 1) return
  timer = setInterval(() => {
    // 走到最后一个阶段就停住，不再循环。
    if (stageIndex.value < props.stages.length - 1) {
      stageIndex.value += 1
    } else {
      clearTimer()
    }
  }, props.stageInterval)
}

// 遮罩每次出现时重置阶段，从头开始播。
watch(
  () => props.visible,
  (visible) => {
    if (visible) startTimer()
    else clearTimer()
  },
  { immediate: true },
)

// 外部驱动时，阶段序号跟随进度走，保证"百分比"和"阶段文案"讲同一件事。
watch(
  () => props.percent,
  (value) => {
    if (!determinate.value || props.stages.length === 0) return
    const next = Math.min(
      props.stages.length - 1,
      Math.floor((Math.max(0, Math.min(100, value)) / 100) * props.stages.length),
    )
    stageIndex.value = Math.max(0, next)
  },
)

onBeforeUnmount(clearTimer)
</script>

<template>
  <Transition name="auth-overlay">
    <!--
      role="dialog" + aria-modal：告诉读屏软件这是个模态层。
      aria-busy：告诉读屏软件这里正在忙，不要抢读。
      遮罩本身吃掉指针事件，配合表单层的守卫共同防重复提交。
    -->
    <div
      v-if="visible"
      class="auth-overlay"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      :aria-label="title"
    >
      <div class="auth-overlay__panel">
        <!--
          头部：九宫格动画 + 文案并排。
          九宫格进度动画：八个外围格子依次脉冲，中心格子持续呼吸，
          每个格子的动画延迟由 --i 决定，形成对角线推进的波纹。
        -->
        <div class="auth-overlay__head">
          <div class="auth-overlay__matrix" aria-hidden="true">
            <span
              v-for="i in 8"
              :key="i"
              class="auth-overlay__cell"
              :style="{ '--i': i - 1 }"
            />
            <span class="auth-overlay__cell auth-overlay__cell--core" aria-hidden="true">
              <span class="auth-overlay__core-dot" />
            </span>
          </div>
          <div class="auth-overlay__text">
            <p class="auth-overlay__title">{{ title }}</p>
            <!-- 阶段文案用 aria-live 播报，视觉用户看到动画，读屏用户听到进展。 -->
            <p v-if="hasStages" class="auth-overlay__stage" aria-live="polite">{{ stageText }}</p>
          </div>
        </div>

        <!--
          进度条。外部给定 percent 时是确定进度（百分比数字同步显示）；
          否则退回不确定进度，表达"还在进行中但不知道还要多久"。
        -->
        <BrandProgressBar
          v-if="determinate"
          class="auth-overlay__progress"
          :percent="percent"
          active
          size="sm"
          show-percent
          :label="`${title}进度`"
        />
        <div v-else class="auth-overlay__bar" aria-hidden="true">
          <span class="auth-overlay__bar-fill" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14px;
  /*
   * 极淡的半透明：只负责吃掉指针事件（防重复提交），
   * 刻意不做模糊，保证卡片与按钮内的进度条始终清晰可见。
   */
  background: rgba(250, 250, 250, 0.18);
}

.auth-overlay__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 18px 14px;
  border-radius: 16px;
  background: var(--mm-surface);
  border: 1px solid var(--mm-line);
  box-shadow: 0 16px 40px rgba(32, 33, 36, 0.14);
  min-width: 268px;
}

/* 头部：动画 + 文案并排，压低面板高度，避免遮住登录卡片顶部。 */
.auth-overlay__head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.auth-overlay__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 九宫格：3x3 布局，中心格放核心点。 */
.auth-overlay__matrix {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, 14px);
  grid-template-rows: repeat(3, 14px);
  gap: 3px;
}

.auth-overlay__cell {
  border-radius: 6px;
  background: var(--mm-blue-soft);
  border: 1px solid transparent;
  animation: overlay-pulse 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  /* 对角线推进：延迟按格子序号递增。 */
  animation-delay: calc(var(--i) * 0.11s);
}

/* 中心格：持续呼吸的强调色，代表"正在处理"。 */
.auth-overlay__cell--core {
  display: grid;
  place-items: center;
  background: var(--mm-blue);
  animation: overlay-breathe 1.5s ease-in-out infinite;
  animation-delay: 0s;
}

.auth-overlay__core-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: overlay-dot 1.5s ease-in-out infinite;
}

.auth-overlay__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--mm-text);
  letter-spacing: 0.01em;
}

.auth-overlay__stage {
  margin: 0;
  font-size: 12px;
  color: var(--mm-muted);
  min-height: 16px;
}

/* 面板内的确定进度条：宽度固定，和文案对齐。 */
.auth-overlay__progress {
  width: 100%;
}

/* 不确定进度条：一条来回滑动的短条。 */
.auth-overlay__bar {
  width: 180px;
  height: 3px;
  border-radius: 999px;
  background: var(--mm-line);
  overflow: hidden;
}

.auth-overlay__bar-fill {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: 999px;
  background: var(--mm-blue);
  animation: overlay-slide 1.15s ease-in-out infinite;
}

@keyframes overlay-pulse {
  0%,
  100% {
    background: var(--mm-blue-soft);
    border-color: transparent;
    transform: scale(0.86);
  }
  45% {
    background: var(--mm-blue);
    border-color: var(--mm-blue);
    transform: scale(1);
  }
}

@keyframes overlay-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(26, 115, 232, 0.35);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 7px rgba(26, 115, 232, 0);
    transform: scale(1.08);
  }
}

@keyframes overlay-dot {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

@keyframes overlay-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(250%);
  }
}

/* 遮罩淡入淡出。 */
.auth-overlay-enter-active,
.auth-overlay-leave-active {
  transition: opacity 0.18s ease;
}
.auth-overlay-enter-from,
.auth-overlay-leave-to {
  opacity: 0;
}

/* 尊重系统的"减少动态效果"偏好。 */
@media (prefers-reduced-motion: reduce) {
  .auth-overlay__cell,
  .auth-overlay__cell--core,
  .auth-overlay__core-dot,
  .auth-overlay__bar-fill {
    animation: none !important;
  }
  .auth-overlay__cell {
    background: var(--mm-blue-soft);
    opacity: 0.7;
  }
  .auth-overlay__cell--core {
    background: var(--mm-blue);
  }
  .auth-overlay-enter-active,
  .auth-overlay-leave-active {
    transition: none;
  }
}
</style>
