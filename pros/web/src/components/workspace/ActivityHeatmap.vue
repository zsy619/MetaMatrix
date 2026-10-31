<script setup lang="ts">
import { computed } from 'vue'
import type { HeatCell } from '../../api/documents'
import { shanghaiToday } from './sampleStats'

const props = defineProps<{
  cells: HeatCell[]
}>()

const today = computed(() => shanghaiToday())

const weeks = computed(() => {
  const cols: HeatCell[][] = []
  for (let i = 0; i < props.cells.length; i += 7) {
    cols.push(props.cells.slice(i, i + 7))
  }
  return cols
})

const max = computed(() => props.cells.reduce((m, c) => Math.max(m, c.count), 0))

function level(count: number): number {
  if (count <= 0 || max.value <= 0) return 0
  const r = count / max.value
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

function monthLabel(index: number): string {
  const col = weeks.value[index]
  const date = col?.[0]?.date
  if (!date) return ''
  const prev = weeks.value[index - 1]?.[0]?.date
  if (prev && prev.slice(0, 7) === date.slice(0, 7)) return ''
  return `${Number(date.slice(5, 7))}月`
}

const weekdayLabels = ['一', '', '三', '', '五', '', '']
</script>

<template>
  <div class="heat">
    <div class="heat-scroll">
      <div class="months" :style="{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }">
        <span v-for="(_, i) in weeks" :key="i">{{ monthLabel(i) }}</span>
      </div>
      <div class="grid">
        <div class="wdays" aria-hidden="true">
          <span v-for="(label, i) in weekdayLabels" :key="i">{{ label }}</span>
        </div>
        <div class="cols" :style="{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }">
          <div v-for="(col, ci) in weeks" :key="ci" class="col">
            <span
              v-for="cell in col"
              :key="cell.date"
              class="cell"
              :class="[`lv-${level(cell.count)}`, { future: cell.date > today }]"
              :title="`${cell.date} · ${cell.count} 次活跃`"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="legend" aria-hidden="true">
      <span>少</span>
      <span class="cell lv-0" />
      <span class="cell lv-1" />
      <span class="cell lv-2" />
      <span class="cell lv-3" />
      <span class="cell lv-4" />
      <span>多</span>
    </div>
  </div>
</template>

<style scoped>
.heat-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.months {
  display: grid;
  gap: 3px;
  margin-left: 22px;
  height: 16px;
  font-size: 10px;
  color: #9aa0a6;
}

.months span {
  white-space: nowrap;
}

.grid {
  display: flex;
  gap: 4px;
}

.wdays {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
  font-size: 10px;
  color: #9aa0a6;
  width: 18px;
  line-height: 12px;
}

.cols {
  display: grid;
  gap: 3px;
}

.col {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
}

.cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: #ebedf0;
}

.lv-1 { background: #c6dafc; }
.lv-2 { background: #7baaf7; }
.lv-3 { background: #1a73e8; }
.lv-4 { background: #174ea6; }

.future {
  opacity: 0.45;
}

.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: #9aa0a6;
}
</style>
