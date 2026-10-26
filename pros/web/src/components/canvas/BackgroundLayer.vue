<script setup lang="ts">
import type { ThemeBackground } from '../../types/canvas'

defineProps<{
  background: ThemeBackground
}>()
</script>

<template>
  <div
    class="background-layer"
    :style="{ backgroundColor: background.color }"
    aria-hidden="true"
  >
    <div
      v-if="background.pattern === 'diagonal-lines'"
      class="diagonal-lines"
    />
  </div>
</template>

<style scoped>
.background-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.diagonal-lines {
  position: absolute;
  inset: 0;
  opacity: 0.55;
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 10px,
    rgba(0, 0, 0, 0.035) 10px,
    rgba(0, 0, 0, 0.035) 11px
  );
}
</style>
