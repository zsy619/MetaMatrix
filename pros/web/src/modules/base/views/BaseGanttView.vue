<script setup lang="ts">
/**
 * 甘特视图：按开始 / 结束日期把记录排成时间条。
 *
 * 设计要点（对标飞书多维表格甘特视图）：
 *   - 开始 / 结束字段来自视图配置（layout.ganttStartFieldId / ganttEndFieldId），
 *     没配置时自动取表里前两个日期字段；
 *   - 依赖关系来自「关联记录」字段，在条形之间画依赖线；
 *   - 时间轴按天分格，支持左右滚动。
 */
import { computed } from 'vue'
import type { FieldMeta, RecordRow, ViewConfig } from '../types'

const props = defineProps<{
  fields: FieldMeta[]
  rows: RecordRow[]
  editable?: boolean
  viewConfig?: ViewConfig
  linkTitles?: Record<string, string>
  linkOptions?: Record<string, Array<{ id: string; title: string }>>
  projectId?: string
}>()

const emit = defineEmits<{
  (e: 'update-cell', payload: { recordId: string; fieldId: string; value: unknown }): void
  (e: 'open-record', recordId: string): void
  (e: 'open-record-ref', payload: { tableId: string; recordId: string; title: string }): void
}>()

const DAY_WIDTH = 46
const ROW_HEIGHT = 40

/** 视��配置里的开始 / 结束字段。 */
const layout = computed(() => (props.viewConfig?.layout ?? {}) as Record<string, unknown>)

const startField = computed<FieldMeta | undefined>(() => {
  const id = layout.value.ganttStartFieldId
  if (typeof id === 'string') {
    const hit = props.fields.find((f) => f.id === id)
    if (hit) return hit
  }
  return props.fields.find((f) => f.type === 'date' || f.type === 'datetime')
})

const endField = computed<FieldMeta | undefined>(() => {
  const id = layout.value.ganttEndFieldId
  if (typeof id === 'string') {
    const hit = props.fields.find((f) => f.id === id)
    if (hit) return hit
  }
  return props.fields.find((f) => f.id !== startField.value?.id && (f.type === 'date' || f.type === 'datetime'))
})

/** 标题字段（主字段）。 */
const titleField = computed(() => props.fields.find((f) => f.isPrimary) ?? props.fields[0])

/** 依赖关系字段：关联记录字段。 */
const dependencyField = computed(() => props.fields.find((f) => f.type === 'link'))

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value)
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return null
  return d
}

function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / 86400000)
}

/** 时间轴起点：所有条形里最早的日期。 */
const timelineStart = computed(() => {
  let min = Number.POSITIVE_INFINITY
  for (const row of props.rows) {
    const s = parseDate(row.fields?.[startField.value?.id ?? ''])
    if (s) min = Math.min(min, dayIndex(s))
  }
  return Number.isFinite(min) ? min : dayIndex(new Date())
})

/**
 * 时间轴终点。
 *
 * 注意：必须同时看「开始」和「结束」两个字段。
 * 只看结束字段的话，当所有记录都没填结束日期时终点会塌回起点，
 * 时间轴被压成最短跨度，而条形却按开始日期排到了画布之外（表现为条形消失）。
 */
const timelineEnd = computed(() => {
  let max = timelineStart.value
  const startId = startField.value?.id ?? ''
  const endId = endField.value?.id ?? ''
  for (const row of props.rows) {
    const s = parseDate(row.fields?.[startId])
    if (s) max = Math.max(max, dayIndex(s))
    const e = parseDate(row.fields?.[endId])
    if (e) max = Math.max(max, dayIndex(e))
  }
  return max
})

/**
 * 时间轴总天数。
 *
 * 下限 MIN_SPAN_DAYS：所有记录都没填日期时，时间轴会塌成 1 天（28px 宽的一条缝），
 * 视觉上像「没渲染出来」。给它一个最小跨度，保证甘特区始终是可读的网格。
 */
const MIN_SPAN_DAYS = 14

const totalDays = computed(() =>
  Math.max(MIN_SPAN_DAYS, timelineEnd.value - timelineStart.value + 1),
)

/** 每条记录的条形几何信息。 */
const bars = computed(() =>
  props.rows.map((row) => {
    const s = parseDate(row.fields?.[startField.value?.id ?? ''])
    const e = parseDate(row.fields?.[endField.value?.id ?? ''])
    const startDay = s ? dayIndex(s) : timelineStart.value
    const endDay = e ? dayIndex(e) : startDay
    return {
      row,
      startDay,
      endDay,
      /** 未填开始日期 → 未排期：不画条形，只在左侧列表标注。 */
      unscheduled: !s,
      offset: (startDay - timelineStart.value) * DAY_WIDTH,
      width: Math.max(DAY_WIDTH, (endDay - startDay + 1) * DAY_WIDTH),
      title: titleField.value
        ? String(row.fields?.[titleField.value.id] ?? '未命名')
        : '未命名',
    }
  }),
)

/** 依赖线：源记录 → 目标记录。 */
const dependencies = computed(() => {
  const field = dependencyField.value
  if (!field) return []
  const index = new Map(props.rows.map((row) => [row.id, row]))
  const lines: Array<{ fromId: string; toId: string; fromIndex: number; toIndex: number }> = []
  props.rows.forEach((row, rowIndex) => {
    const raw = row.fields?.[field.id]
    const ids = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : []
    ids.forEach((targetId) => {
      const targetIndex = index.has(targetId) ? props.rows.findIndex((r) => r.id === targetId) : -1
      if (targetIndex >= 0 && targetId !== row.id) {
        lines.push({ fromId: row.id, toId: targetId, fromIndex: rowIndex, toIndex: targetIndex })
      }
    })
  })
  return lines
})

/** 时间轴表头（按天）。 */
const days = computed(() =>
  Array.from({ length: totalDays.value }, (_, i) => {
    const d = new Date((timelineStart.value + i) * 86400000)
    // 月份切换时补一个「年-月」标尺，避免跨月时只剩 11/18 这种看不出年份的标签。
    const monthChanged = d.getDate() === 1
    return {
      index: i,
      label: `${d.getDate()}`,
      monthLabel: monthChanged ? `${d.getFullYear()}年${d.getMonth() + 1}月` : '',
      weekend: d.getDay() === 0 || d.getDay() === 6,
    }
  }),
)

</script>

<template>
  <div class="be-gantt">
    <div class="be-gantt__side">
      <div class="be-gantt__side-head">记录</div>
      <div
        v-for="bar in bars"
        :key="bar.row.id"
        class="be-gantt__side-row"
        :style="{ height: `${ROW_HEIGHT}px` }"
        @click="emit('open-record', bar.row.id)"
      >
        <span class="be-gantt__side-title">{{ bar.title }}</span>
        <span v-if="bar.unscheduled" class="be-gantt__side-tag">未排期</span>
      </div>
    </div>

    <div class="be-gantt__main">
      <div class="be-gantt__head" :style="{ width: `${totalDays * DAY_WIDTH}px` }">
        <div
          v-for="day in days"
          :key="day.index"
          class="be-gantt__day"
          :class="{ 'is-weekend': day.weekend }"
          :style="{ width: `${DAY_WIDTH}px` }"
        >
          <span class="be-gantt__day-label">{{ day.label }}</span>
          <span v-if="day.monthLabel" class="be-gantt__day-month">{{
            day.monthLabel
          }}</span>
        </div>
      </div>

      <div class="be-gantt__body" :style="{ width: `${totalDays * DAY_WIDTH}px` }">
        <div class="be-gantt__grid">
          <div
            v-for="day in days"
            :key="day.index"
            class="be-gantt__grid-col"
            :class="{ 'is-weekend': day.weekend }"
            :style="{ width: `${DAY_WIDTH}px` }"
          />
        </div>

        <svg class="be-gantt__lines" :width="totalDays * DAY_WIDTH" :height="bars.length * ROW_HEIGHT">
          <path
            v-for="line in dependencies"
            :key="`${line.fromId}-${line.toId}`"
            :d="`M ${bars[line.fromIndex].offset + bars[line.fromIndex].width} ${line.fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2} L ${bars[line.toIndex].offset} ${line.toIndex * ROW_HEIGHT + ROW_HEIGHT / 2}`"
            class="be-gantt__dep"
          />
        </svg>

        <div
          v-for="bar in bars"
          :key="bar.row.id"
          class="be-gantt__row"
          :style="{ height: `${ROW_HEIGHT}px` }"
        >
          <div
            v-if="!bar.unscheduled"
            class="be-gantt__bar"
            :style="{ left: `${bar.offset}px`, width: `${bar.width}px` }"
            @click="emit('open-record', bar.row.id)"
          >
            <span class="be-gantt__bar-label">{{ bar.title }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.be-gantt {
  display: flex;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--tg-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--tg-surface, #fff);
}

.be-gantt__day {
  position: relative;
}

.be-gantt__day-label {
  display: block;
  font-size: 11px;
  line-height: 1.2;
}

.be-gantt__day-month {
  display: block;
  font-size: 10px;
  line-height: 1.2;
  color: var(--tg-text-3, #94a3b8);
}

.be-gantt__side {
  width: 200px;
  flex: none;
  border-right: 1px solid var(--tg-border);
  overflow: hidden;
}

.be-gantt__side-head {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 12px;
  color: var(--tg-text-2);
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-surface-soft, rgba(15, 23, 42, 0.02));
}

.be-gantt__side-row {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--tg-border);
  cursor: pointer;
}

.be-gantt__side-tag {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  color: var(--tg-text-3, #94a3b8);
  background: var(--tg-surface-soft, rgba(15, 23, 42, 0.04));
}

.be-gantt__side-title {
  font-size: 13px;
  color: var(--tg-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.be-gantt__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.be-gantt__head {
  display: flex;
  height: 32px;
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-surface-soft, rgba(15, 23, 42, 0.02));
}

.be-gantt__day {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--tg-text-2);
  border-right: 1px solid var(--tg-border);
}

.be-gantt__day.is-weekend,
.be-gantt__grid-col.is-weekend {
  background: rgba(15, 23, 42, 0.03);
}

.be-gantt__body {
  position: relative;
}

.be-gantt__grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.be-gantt__grid-col {
  flex: none;
  border-right: 1px solid var(--tg-border);
}

.be-gantt__lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.be-gantt__dep {
  fill: none;
  stroke: var(--tg-blue, #3390ec);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  opacity: 0.6;
}

.be-gantt__row {
  position: relative;
  border-bottom: 1px solid var(--tg-border);
}

.be-gantt__bar {
  position: absolute;
  top: 8px;
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--tg-blue, #3390ec);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.be-gantt__bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
