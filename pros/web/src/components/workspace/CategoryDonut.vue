<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    segments: { key: string; label: string; count: number; color: string }[]
    label?: string
  }>(),
  { label: '分类占比' },
)

const total = computed(() => props.segments.reduce((n, s) => n + s.count, 0))

const R = 42
const C = 2 * Math.PI * R

const arcs = computed(() => {
  let offset = 0
  return props.segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const len = total.value > 0 ? (s.count / total.value) * C : 0
      const arc = { ...s, len, offset }
      offset += len
      return arc
    })
})
</script>

<template>
  <div class="donut-wrap">
    <svg viewBox="0 0 120 120" class="donut" role="img" :aria-label="label">
      <circle cx="60" cy="60" r="42" fill="none" stroke="#f1f3f4" stroke-width="16" />
      <circle
        v-for="arc in arcs"
        :key="arc.key"
        cx="60"
        cy="60"
        r="42"
        fill="none"
        :stroke="arc.color"
        stroke-width="16"
        :stroke-dasharray="`${arc.len} ${C - arc.len}`"
        :stroke-dashoffset="-arc.offset"
        transform="rotate(-90 60 60)"
      >
        <title>{{ arc.label }} {{ arc.count }}</title>
      </circle>
      <text x="60" y="56" text-anchor="middle" font-size="18" font-weight="700" fill="#202124">
        {{ total }}
      </text>
      <text x="60" y="72" text-anchor="middle" font-size="9" fill="#5f6368">份画布</text>
    </svg>
    <ul class="legend">
      <li v-for="s in segments" :key="s.key">
        <span class="swatch" :style="{ background: s.color }" />
        <span class="name">{{ s.label }}</span>
        <span class="num">{{ s.count }}</span>
        <span class="pct">{{ total ? Math.round((s.count / total) * 100) : 0 }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
}

.donut {
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend li {
  display: grid;
  grid-template-columns: 8px 1fr auto auto;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num,
.pct {
  color: #5f6368;
  font-variant-numeric: tabular-nums;
}

.pct {
  width: 36px;
  text-align: right;
}
</style>
