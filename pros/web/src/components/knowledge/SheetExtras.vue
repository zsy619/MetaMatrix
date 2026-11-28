<script setup lang="ts">
/**
 * 表格增强：CSV 导入导出与汇总行（038 / 039 / 040）。
 *
 * 独立成一个组件，表格主体不用改；汇总结果按视图的筛选与排序计算。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  parseCSV,
  summaryValues,
  toCSV,
  viewRows,
  type SheetData,
  type SheetView,
} from './sheetModel'

const props = defineProps<{
  data: SheetData
  view?: SheetView | null
}>()
const emit = defineEmits<{
  'import-csv': [payload: { fields: SheetData['fields']; rows: SheetData['rows'] }]
}>()

const showSummary = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const rows = computed(() => (props.view ? viewRows(props.data, props.view) : props.data.rows))

const aggregates = computed(() => {
  const out: Record<string, 'sum'> = {}
  for (const field of props.data.fields) {
    if (field.type === 'number' || field.type === 'progress') out[field.id] = 'sum'
  }
  return out
})

const summary = computed(() => summaryValues(rows.value, props.data.fields, aggregates.value))

watch(
  () => props.view?.id,
  (id) => {
    if (!id) return
    showSummary.value = localStorage.getItem(`sheet-summary-${id}`) === '1'
  },
  { immediate: true },
)

function toggleSummary() {
  showSummary.value = !showSummary.value
  if (props.view?.id) {
    localStorage.setItem(`sheet-summary-${props.view.id}`, showSummary.value ? '1' : '0')
  }
}

function exportCsv() {
  const csv = toCSV(props.data, props.view ?? undefined)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '表格导出.csv'
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('CSV 已导出')
}

function pickCsv() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  const parsed = parseCSV(text)
  if (!parsed.rows.length) {
    ElMessage.warning('CSV 里没有数据行')
    input.value = ''
    return
  }
  emit('import-csv', parsed)
  ElMessage.success(`已导入 ${parsed.rows.length} 行`)
  input.value = ''
}

function numberText(fieldId: string): string {
  const value = summary.value[fieldId]
  if (value === undefined || value === '') return '—'
  return value
}
</script>

<template>
  <div class="sheet-extras">
    <el-button class="mm-bar__btn" text size="small" @click="pickCsv">导入 CSV</el-button>
    <el-button class="mm-bar__btn" text size="small" @click="exportCsv">导出 CSV</el-button>
    <el-button class="mm-bar__btn" text size="small" @click="toggleSummary">
      {{ showSummary ? '隐藏汇总' : '显示汇总' }}
    </el-button>
    <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="onFile" />

    <div v-if="showSummary" class="sheet-extras__summary">
      <span class="sheet-extras__label">汇总（{{ rows.length }} 行）</span>
      <span v-for="field in data.fields" :key="field.id" class="sheet-extras__item">
        {{ field.name }}：{{ aggregates[field.id] ? numberText(field.id) : '—' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* 按钮并入外层 mm-bar__group，汇总面板改成工具条下方的浮层 */
.sheet-extras {
  display: contents;
}
.sheet-extras__summary {
  /* 汇总就地显示在动作组里（同排、同一高度）；浮层会被粘性表头的 backdrop-filter 压住 */
  flex: none;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  max-width: 60vw;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--mm-text, #1d2129);
  font-size: 12px;
}
.sheet-extras__label {
  color: var(--el-text-color-secondary);
}
.sheet-extras__item {
  color: var(--mm-text, #1d2129);
}
</style>
