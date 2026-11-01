<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ value: number }>()
const shown = ref(props.value)
let frame = 0

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

watch(
  () => props.value,
  (next) => {
    cancelAnimationFrame(frame)
    const from = shown.value
    if (prefersReducedMotion() || from === next) {
      shown.value = next
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 280)
      const eased = 1 - (1 - t) * (1 - t)
      shown.value = Math.round(from + (next - from) * eased)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
)

onUnmounted(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="num">{{ shown.toLocaleString('zh-CN') }}</span>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}
</style>
