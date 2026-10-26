<script setup lang="ts">
import type { QuadrantCell as QuadrantCellType } from '../../types/canvas'
import QuadrantCell from './QuadrantCell.vue'

defineProps<{
  quadrants: QuadrantCellType[]
}>()

const order = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

function byPosition(list: QuadrantCellType[], pos: string) {
  return list.find((q) => q.position === pos)
}
</script>

<template>
  <div class="quadrant-grid">
    <QuadrantCell
      v-for="pos in order"
      :key="pos"
      v-show="byPosition(quadrants, pos)"
      :cell="byPosition(quadrants, pos)!"
    />
  </div>
</template>

<style scoped>
.quadrant-grid {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 0;
}
</style>
