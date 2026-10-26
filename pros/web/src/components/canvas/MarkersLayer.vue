<script setup lang="ts">
import type { MarkerNode as MarkerNodeType } from '../../types/canvas'
import MarkerNode from './MarkerNode.vue'

defineProps<{
  markers: MarkerNodeType[]
}>()
</script>

<template>
  <div class="markers-layer">
    <MarkerNode v-for="m in markers" :key="m.id" :marker="m" />
  </div>
</template>

<style scoped>
.markers-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  /* 层本身不拦截点击，避免挡住象限「+」等控件；节点单独恢复可点 */
  pointer-events: none;
}
</style>
