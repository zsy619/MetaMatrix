<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  labels: string[]
  series: { name: string; color: string; values: number[] }[]
  mode: 'line' | 'bar'
}>()

const W = 720
const H = 248
const pad = { l: 34, r: 10, t: 14, b: 28 }

const n = computed(() => Math.max(1, props.labels.length))

const maxY = computed(() => {
  let m = 1
  for (const s of props.series) {
    for (const v of s.values) if (v > m) m = v
  }
  return m
})

const plotW = W - pad.l - pad.r
const plotH = H - pad.t - pad.b

function xAt(i: number): number {
  return pad.l + ((i + 0.5) * plotW) / n.value
}

function yAt(v: number): number {
  const value = Number.isFinite(v) ? v : 0
  return pad.t + plotH - (value / maxY.value) * plotH
}

const yTicks = computed(() => {
  const m = maxY.value
  const mid = Math.max(1, Math.round(m / 2))
  return [...new Set([m, mid, 0])]
})

const xTicks = computed(() => {
  const count = props.labels.length
  if (count <= 1) return [0]
  if (count <= 8) return props.labels.map((_, i) => i)
  const step = Math.ceil(count / 6)
  const idx: number[] = []
  for (let i = 0; i < count; i += step) idx.push(i)
  if (idx[idx.length - 1] !== count - 1) idx.push(count - 1)
  return idx
})

function linePoints(values: number[]): string {
  return values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')
}

function barGeom(i: number, si: number) {
  const scount = Math.max(1, props.series.length)
  const slot = plotW / n.value
  const gap = Math.min(3, slot * 0.12)
  const inner = Math.max(scount, slot - gap)
  const bw = inner / scount
  const left = pad.l + i * slot + (slot - inner) / 2
  return { x: left + si * bw, w: Math.max(0.6, bw - 0.35) }
}

function tip(i: number): string {
  const parts = props.series.map((s) => `${s.name} ${s.values[i] ?? 0}`)
  return `${props.labels[i] || ''}：${parts.join('，')}`
}

const showDots = computed(() => props.mode === 'line' && props.labels.length <= 42)
</script>

<template>
  <svg
    class="trend"
    :viewBox="`0 0 ${W} ${H}`"
    role="img"
    :aria-label="labels.length ? `趋势图，${labels[0]} 至 ${labels[labels.length - 1]}` : '趋势图'"
  >
    <line
      v-for="tick in yTicks"
      :key="tick"
      :x1="pad.l"
      :x2="W - pad.r"
      :y1="yAt(tick)"
      :y2="yAt(tick)"
      stroke="#f1f3f4"
    />
    <text
      v-for="tick in yTicks"
      :key="`t-${tick}`"
      :x="pad.l - 6"
      :y="yAt(tick) + 3"
      text-anchor="end"
      fill="#9aa0a6"
      font-size="10"
    >
      {{ tick }}
    </text>

    <template v-if="mode === 'bar'">
      <template v-for="(s, si) in series" :key="s.name">
        <rect
          v-for="(v, i) in s.values"
          :key="`${s.name}-${i}`"
          :x="barGeom(i, si).x"
          :y="yAt(v)"
          :width="barGeom(i, si).w"
          :height="Math.max(0, yAt(0) - yAt(v))"
          :fill="s.color"
          rx="1"
        >
          <title>{{ tip(i) }}</title>
        </rect>
      </template>
    </template>
    <template v-else>
      <polyline
        v-for="s in series"
        :key="s.name"
        fill="none"
        :stroke="s.color"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        :points="linePoints(s.values)"
      />
      <template v-if="showDots">
        <template v-for="s in series" :key="`${s.name}-dots`">
          <circle
            v-for="(v, i) in s.values"
            :key="`${s.name}-${i}`"
            :cx="xAt(i)"
            :cy="yAt(v)"
            r="2.4"
            :fill="s.color"
          >
            <title>{{ tip(i) }}</title>
          </circle>
        </template>
      </template>
    </template>

    <rect
      v-for="(label, i) in labels"
      :key="`hit-${label}-${i}`"
      :x="pad.l + (i * plotW) / n"
      y="0"
      :width="plotW / n"
      :height="H"
      fill="transparent"
    >
      <title>{{ tip(i) }}</title>
    </rect>

    <text
      v-for="i in xTicks"
      :key="`x-${i}`"
      :x="xAt(i)"
      :y="H - 8"
      text-anchor="middle"
      fill="#9aa0a6"
      font-size="10"
    >
      {{ labels[i] }}
    </text>
  </svg>
  <table class="visually-hidden">
    <caption>趋势数据</caption>
    <thead>
      <tr>
        <th>时间</th>
        <th v-for="s in series" :key="s.name">{{ s.name }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(label, i) in labels" :key="`${label}-${i}`">
        <td>{{ label }}</td>
        <td v-for="s in series" :key="s.name">{{ s.values[i] ?? 0 }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.trend {
  width: 100%;
  height: auto;
  display: block;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
