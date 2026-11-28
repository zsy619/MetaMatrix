<template>
  <div class="app-loading" role="status" aria-live="polite">
    <div class="app-loading__stage" aria-hidden="true">
      <div class="app-loading__ring"></div>
      <div class="app-loading__plate"></div>
      <div class="app-loading__matrix">
        <span
          v-for="(cell, index) in cells"
          :key="index"
          class="app-loading__cell"
          :style="{ '--c': cell.color, '--d': `${cell.delay}s` }"
        ></span>
      </div>
    </div>
    <p class="app-loading__label">
      <span>{{ text }}</span>
      <span class="app-loading__dots"><i></i><i></i><i></i></span>
    </p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '正在加载' })

// 元矩阵品牌五色（与启动页 LaunchSplash 同源）：同一条对角线同色，形成逐格点亮的波纹。
const BRAND = ['#1a73e8', '#34a853', '#f9a825', '#a142f4', '#ea4335']

const cells = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3)
  const col = i % 3
  return { color: BRAND[(row + col) % BRAND.length], delay: (row + col) * 0.12 }
})
</script>

<style scoped>
.app-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  user-select: none;
}

.app-loading__stage {
  position: relative;
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
}

/* 旋转弧环：品牌色 conic 渐变 + 环形遮罩 */
.app-loading__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(26, 115, 232, 0) 0deg,
    #1a73e8 70deg,
    #a142f4 160deg,
    #ea4335 240deg,
    rgba(234, 67, 53, 0) 310deg,
    rgba(26, 115, 232, 0) 360deg
  );
  -webkit-mask: radial-gradient(farthest-side, #0000 calc(100% - 3px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, #0000 calc(100% - 3px), #000 calc(100% - 3px));
  animation: app-loading-spin 1.6s linear infinite;
}

/* 玻璃底盘：给矩阵一个可折射的彩色背景 */
.app-loading__plate {
  position: absolute;
  inset: 18px;
  border-radius: 50%;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-sm);
}

.app-loading__matrix {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 44px;
  height: 44px;
}

.app-loading__cell {
  border-radius: 3px;
  background: var(--c);
  opacity: 0.16;
  transform: scale(0.85);
  animation: app-loading-cell 1.5s ease-in-out infinite;
  animation-delay: var(--d);
}

.app-loading__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-sm);
  color: rgba(15, 23, 42, 0.82);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.app-loading__dots {
  display: inline-flex;
  gap: 4px;
}

.app-loading__dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  animation: app-loading-dot 1.1s ease-in-out infinite;
}

.app-loading__dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.app-loading__dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes app-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes app-loading-cell {
  0%,
  100% {
    opacity: 0.16;
    transform: scale(0.85);
  }
  38% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes app-loading-dot {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-loading__ring,
  .app-loading__cell,
  .app-loading__dots i {
    animation: none !important;
  }
  .app-loading__cell {
    opacity: 0.55;
    transform: none;
  }
}
</style>
