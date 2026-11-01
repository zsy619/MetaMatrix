<script setup lang="ts">
import { computed } from 'vue'
import type { CategorySegment } from './statsFormat'

const props = defineProps<{ segments: CategorySegment[] }>()
const max = computed(() => Math.max(1, ...props.segments.map((s) => s.count)))
const total = computed(() => props.segments.reduce((n, s) => n + s.count, 0))
</script>

<template>
  <p v-if="!segments.length" class="muted">还没有可归类的画布。</p>
  <ul v-else class="list">
    <li v-for="s in segments" :key="s.key">
      <div class="top">
        <span class="name">{{ s.label }}</span>
        <span class="num">{{ s.count }} 份 · {{ total ? Math.round((s.count / total) * 100) : 0 }}%</span>
      </div>
      <div class="meter" role="presentation">
        <span :style="{ width: `${Math.max(6, Math.round((s.count / max) * 100))}%`, background: s.color }" />
      </div>
    </li>
  </ul>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num,
.muted {
  color: var(--mm-muted);
  font-size: 12px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.meter {
  height: 6px;
  border-radius: 999px;
  background: #f1f3f4;
  overflow: hidden;
  margin-top: 4px;
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
}
</style>
