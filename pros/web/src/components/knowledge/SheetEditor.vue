<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getNodeData, saveNodeData } from '../../api/knowledge'

const props = defineProps<{ projectId: string; nodeId: string }>()

interface SheetData {
  columns: string[]
  rows: string[][]
}

const sheet = ref<SheetData>({ columns: ['列 1'], rows: [['']] })
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

const cell = (row: number, col: number) => sheet.value.rows[row]?.[col] ?? ''

async function load() {
  loading.value = true
  try {
    const res = await getNodeData(props.projectId, props.nodeId)
    const data = res.data as SheetData
    if (data && Array.isArray(data.columns) && Array.isArray(data.rows)) sheet.value = data
  } catch {
    ElMessage.error('加载表格失败')
  } finally {
    loading.value = false
  }
}

function setCell(row: number, col: number, value: string) {
  const rows = sheet.value.rows.map((r) => [...r])
  while (rows[row].length <= col) rows[row].push('')
  rows[row][col] = value
  sheet.value = { ...sheet.value, rows }
  dirty.value = true
}

function addRow() {
  const width = sheet.value.columns.length
  sheet.value = {
    ...sheet.value,
    rows: [...sheet.value.rows, Array.from({ length: width }, () => '')],
  }
  dirty.value = true
}

function removeRow(index: number) {
  sheet.value = { ...sheet.value, rows: sheet.value.rows.filter((_, i) => i !== index) }
  dirty.value = true
}

function addColumn() {
  sheet.value = {
    columns: [...sheet.value.columns, `列 ${sheet.value.columns.length + 1}`],
    rows: sheet.value.rows.map((r) => [...r, '']),
  }
  dirty.value = true
}

function removeColumn(index: number) {
  sheet.value = {
    columns: sheet.value.columns.filter((_, i) => i !== index),
    rows: sheet.value.rows.map((r) => r.filter((_, i) => i !== index)),
  }
  dirty.value = true
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await saveNodeData(props.projectId, props.nodeId, 'sheet', sheet.value)
    dirty.value = false
    ElMessage.success('表格已保存')
  } catch {
    ElMessage.error('保存表格失败')
  } finally {
    saving.value = false
  }
}

watch(() => props.nodeId, load)
onMounted(load)

const canRemoveRow = computed(() => sheet.value.rows.length > 1)
</script>

<template>
  <section class="sheet-editor">
    <header class="sheet-editor__head">
      <span class="sheet-editor__title">多维表格</span>
      <span v-if="dirty" class="sheet-editor__dirty">未保存</span>
      <div class="sheet-editor__actions">
        <el-button size="small" @click="addRow">添加行</el-button>
        <el-button size="small" @click="addColumn">添加列</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </header>
    <div v-if="loading" class="sheet-editor__empty">加载中…</div>
    <div v-else class="sheet-editor__table">
      <table>
        <thead>
          <tr>
            <th v-for="(col, ci) in sheet.columns" :key="ci">
              <input
                :value="col"
                class="sheet-editor__col-name"
                @input="sheet.columns[ci] = ($event.target as HTMLInputElement).value; dirty = true"
              />
              <el-button link size="small" @click="removeColumn(ci)">删列</el-button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(_, ri) in sheet.rows" :key="ri">
            <td v-for="ci in sheet.columns.length" :key="ci">
              <input
                :value="cell(ri, ci - 1)"
                @input="setCell(ri, ci - 1, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="sheet-editor__ops">
              <el-button link size="small" :disabled="!canRemoveRow" @click="removeRow(ri)">
                删行
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.sheet-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--mm-surface, #fff);
}
.sheet-editor__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.sheet-editor__title {
  font-size: 16px;
  font-weight: 600;
}
.sheet-editor__dirty {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.sheet-editor__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.sheet-editor__table {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}
.sheet-editor__table table {
  border-collapse: collapse;
  width: 100%;
  min-width: 480px;
}
.sheet-editor__table th,
.sheet-editor__table td {
  border: 1px solid var(--mm-line, #e5e6eb);
  padding: 4px 6px;
  text-align: left;
}
.sheet-editor__table th {
  background: var(--mm-page, #f7f7f7);
  font-weight: 600;
}
.sheet-editor__table input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
}
.sheet-editor__ops {
  width: 60px;
}
.sheet-editor__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
}
</style>
