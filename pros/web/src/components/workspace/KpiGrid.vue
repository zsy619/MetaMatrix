<script setup lang="ts">
import type { DeltaTone } from './statsFormat'
import AnimatedNumber from './AnimatedNumber.vue'

export type Kpi = {
  key: string
  label: string
  value: number
  delta: string
  tone: DeltaTone
  compare: string
  sub?: string
}

defineProps<{ items: Kpi[]; label: string }>()
</script>

<template>
  <section class="metrics" :aria-label="label">
    <article v-for="item in items" :key="item.key" class="metric">
      <span class="metric-k">{{ item.label }}</span>
      <strong><AnimatedNumber :value="item.value" /></strong>
      <span class="delta" :class="item.tone">{{ item.delta }} {{ item.compare }}</span>
      <span v-if="item.sub" class="metric-sub">{{ item.sub }}</span>
    </article>
  </section>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric {
  background: var(--mm-surface);
  border: 1px solid var(--mm-line);
  border-radius: var(--mm-radius);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-k {
  font-size: 12px;
  color: var(--mm-muted);
}

.metric strong {
  font-size: 28px;
  letter-spacing: -0.03em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.delta,
.metric-sub {
  font-size: 12px;
  line-height: 1.45;
}

.delta.up { color: var(--mm-green); }
.delta.down { color: var(--mm-red); }
.delta.flat { color: var(--mm-muted); }
.metric-sub { color: var(--mm-muted); }

@media (max-width: 980px) {
  .metrics { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 560px) {
  .metrics { grid-template-columns: 1fr; }
}
</style>
