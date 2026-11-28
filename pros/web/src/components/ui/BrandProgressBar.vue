<script setup lang="ts">
/**
 * 品牌进度条。
 *
 * 用途：登录 / 注册这类"一次网络往返、耗时不可预估"的场景。
 * 普通进度条在未知耗时的任务里会骗人（卡在 99% 或乱跳），
 * 所以这里的填充由外部显式给定 percent，配合阶段文案使用，
 * 保证"进度条在动"和"百分比在涨"讲的是同一件事。
 *
 * 两种配色：
 * - brand：浅色底上的品牌蓝紫渐变（面板内使用）
 * - light：品牌蓝按钮内部的白色渐变（按钮内使用）
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 进度百分比，0~100。 */
    percent?: number
    /** 是否处于进行中（进行中才有条纹流动动画）。 */
    active?: boolean
    /** 尺寸。 */
    size?: 'sm' | 'md'
    /** 配色方案。 */
    variant?: 'brand' | 'light'
    /** 无障碍标签。 */
    label?: string
    /** 是否显示百分比数字。 */
    showPercent?: boolean
  }>(),
  {
    percent: 0,
    active: false,
    size: 'md',
    variant: 'brand',
    label: '提交进度',
    showPercent: false,
  },
)

/** 裁剪到 0~100，避免外部传入越界值把布局撑破。 */
const clamped = computed(() => Math.min(100, Math.max(0, Number(props.percent) || 0)))
const rounded = computed(() => Math.round(clamped.value))
</script>

<template>
  <div
    class="brand-progress"
    :class="[`brand-progress--${size}`, `brand-progress--${variant}`, { 'is-active': active }]"
    role="progressbar"
    :aria-valuenow="rounded"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label"
  >
    <div class="brand-progress__track">
      <div class="brand-progress__fill" :style="{ width: `${clamped}%` }">
        <span v-if="active" class="brand-progress__stripes" aria-hidden="true" />
      </div>
    </div>
    <span v-if="showPercent" class="brand-progress__value">{{ rounded }}%</span>
  </div>
</template>

<style scoped>
.brand-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.brand-progress__track {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.08);
}

.brand-progress--sm .brand-progress__track {
  height: 4px;
}

.brand-progress__fill {
  position: relative;
  height: 100%;
  min-width: 4px;
  border-radius: 999px;
  /* 品牌渐变：蓝 → 靛 → 紫，与九宫格启动动画同一套品牌语言。 */
  background: linear-gradient(90deg, var(--mm-blue) 0%, #4f7ef7 45%, #8b5cf6 100%);
  transition: width 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.brand-progress--light .brand-progress__track {
  background: rgba(255, 255, 255, 0.32);
}

.brand-progress--light .brand-progress__fill {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(219, 236, 255, 0.95) 60%, rgba(255, 255, 255, 0.9) 100%);
}

/* 条纹：斜向流动，交代"还在动"。 */
.brand-progress__stripes {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    115deg,
    rgba(255, 255, 255, 0.42) 0,
    rgba(255, 255, 255, 0.42) 6px,
    rgba(255, 255, 255, 0) 6px,
    rgba(255, 255, 255, 0) 14px
  );
  background-size: 200% 100%;
  animation: brand-progress-stripes 0.9s linear infinite;
}

.brand-progress--light .brand-progress__stripes {
  background-image: repeating-linear-gradient(
    115deg,
    rgba(26, 115, 232, 0.35) 0,
    rgba(26, 115, 232, 0.35) 6px,
    rgba(26, 115, 232, 0) 6px,
    rgba(26, 115, 232, 0) 14px
  );
}

.brand-progress__value {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--mm-muted);
}

.brand-progress--light .brand-progress__value {
  color: rgba(255, 255, 255, 0.92);
}

@keyframes brand-progress-stripes {
  from {
    background-position: 0 0;
  }
  to {
    background-position: -28px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-progress__stripes {
    animation: none !important;
  }
  .brand-progress__fill {
    transition: none;
  }
}
</style>
