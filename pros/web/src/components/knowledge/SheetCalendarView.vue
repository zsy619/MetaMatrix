<script setup lang="ts">
/**
 * 表格日历视图（035）：按日期字段把记录铺到月历上。
 */
import { computed, ref, watch } from 'vue'
import { calendarBuckets, calendarMonthDays, cellText, type SheetData, type SheetView } from './sheetModel'

const props = defineProps<{
  data: SheetData
  view?: SheetView | null
}>()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth())

const dateField = computed(() => {
  const explicit = props.view?.groupBy ?? null
  if (explicit) return explicit
  return props.data.fields.find((field) => field.type === 'date')?.id ?? null
})

const titleField = computed(() => props.data.fields[0]?.id ?? null)

const rows = computed(() => props.data.rows)

const buckets = computed(() => calendarBuckets(rows.value, dateField.value))

const days = computed(() => calendarMonthDays(year.value, month.value))

const label = computed(() => `${year.value} 年 ${month.value + 1} 月`)

watch(
  () => props.view?.id,
  () => {
    /* 视图切换后重新按视图的日期字段分组 */
  },
)

function shift(delta: number) {
  const next = new Date(year.value, month.value + delta, 1)
  year.value = next.getFullYear()
  month.value = next.getMonth()
}

function today() {
  const current = new Date()
  year.value = current.getFullYear()
  month.value = current.getMonth()
}
</script>

<template>
  <div class="sheet-calendar">
    <header class="sheet-calendar__head">
      <el-button size="small" @click="shift(-1)">←</el-button>
      <span class="sheet-calendar__label">{{ label }}</span>
      <el-button size="small" @click="shift(1)">→</el-button>
      <el-button size="small" text @click="today">今天</el-button>
      <span class="sheet-calendar__field">
        日期字段：{{ data.fields.find((f) => f.id === dateField)?.name || '未选择' }}
      </span>
    </header>
    <div class="sheet-calendar__week">
      <span v-for="name in ['一', '二', '三', '四', '五', '六', '日']" :key="name">{{ name }}</span>
    </div>
    <div class="sheet-calendar__grid">
      <div v-for="(day, index) in days" :key="index" class="sheet-calendar__cell" :class="{ 'is-empty': !day }">
        <div v-if="day" class="sheet-calendar__date">{{ Number(day.slice(-2)) }}</div>
        <ul v-if="day" class="sheet-calendar__items">
          <li v-for="row in buckets.get(day) ?? []" :key="row.id" class="sheet-calendar__item">
            {{ titleField ? cellText(row.cells[titleField]) : '' }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-calendar {
  padding: 10px;
}
.sheet-calendar__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sheet-calendar__label {
  min-width: 120px;
  text-align: center;
  font-weight: 600;
}
.sheet-calendar__field {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.sheet-calendar__week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.sheet-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.sheet-calendar__cell {
  min-height: 84px;
  padding: 4px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.sheet-calendar__cell.is-empty {
  background: var(--el-fill-color-lighter);
}
.sheet-calendar__date {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.sheet-calendar__items {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.sheet-calendar__item {
  overflow: hidden;
  margin-bottom: 2px;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
