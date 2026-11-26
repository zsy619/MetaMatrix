<script setup lang="ts">
/**
 * CSV 导入：解析 → 列映射 → 批量建行。
 *
 * 导入走服务端批量接口（整批成功或整批失败），
 * 不在前端直接写库，避免绕过必填校验与投影同步。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { batchRecords } from '../api'
import { parseDelimited } from '../csv'
import type { FieldMeta } from '../types'

const props = defineProps<{
  projectId: string
  tableId: string
  fields: FieldMeta[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const rows = ref<string[][]>([])
/** 列索引 → 目标字段 ID（空串表示忽略该列）。 */
const mapping = ref<Record<number, string>>({})
const busy = ref(false)
const useHeader = ref(true)

const headers = computed(() => (rows.value.length ? rows.value[0] : []))
const dataRows = computed(() => (useHeader.value ? rows.value.slice(1) : rows.value))

const preview = computed(() => dataRows.value.slice(0, 5))

function pickFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const text = await file.text()
  rows.value = parseDelimited(text)
  autoMap()
  input.value = ''
}

/** 按列名匹配字段名，匹配不到就按顺序兜底。 */
function autoMap() {
  const next: Record<number, string> = {}
  const used = new Set<string>()
  headers.value.forEach((header, index) => {
    const hit = props.fields.find((field) => field.name === header.trim())
    if (hit && !used.has(hit.id)) {
      next[index] = hit.id
      used.add(hit.id)
    }
  })
  props.fields.forEach((field) => {
    if (used.has(field.id)) return
    const free = Object.keys(next).length
    if (free < props.fields.length) {
      const emptyIndex = headers.value.findIndex((_, index) => !next[index])
      if (emptyIndex >= 0) next[emptyIndex] = field.id
      used.add(field.id)
    }
  })
  mapping.value = next
}

const mappingFields = computed(() =>
  headers.value.map((_, index) => ({
    index,
    header: headers.value[index],
    fieldId: mapping.value[index] ?? '',
  })),
)

const mappedCount = computed(() => Object.values(mapping.value).filter(Boolean).length)

function convert(value: string, field?: FieldMeta): unknown {
  if (!field) return ''
  const text = (value ?? '').trim()
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating': {
      const num = Number(text)
      return Number.isNaN(num) ? 0 : num
    }
    case 'checkbox':
      return /^(1|true|是|y|yes)$/i.test(text)
    case 'multi_select':
    case 'user':
    case 'attachment':
    case 'link':
    case 'doc':
      return text ? text.split(/[、,;|]/).map((item) => item.trim()).filter(Boolean) : []
    default:
      return text
  }
}

async function runImport() {
  if (!props.tableId) {
    ElMessage.warning('当前多维表格还没有数据表，请先新建数据表')
    return
  }
  if (!dataRows.value.length) {
    ElMessage.warning('没有可导入的数据')
    return
  }
  const payload = dataRows.value.map((row) => {
    const fields: Record<string, unknown> = {}
    for (const [indexStr, fieldId] of Object.entries(mapping.value)) {
      if (!fieldId) continue
      const index = Number(indexStr)
      const field = props.fields.find((item) => item.id === fieldId)
      fields[fieldId] = convert(row[index] ?? '', field)
    }
    return { fields }
  })
  busy.value = true
  try {
    await batchRecords(props.projectId, props.tableId, { action: 'create', rows: payload })
    ElMessage.success(`已导入 ${payload.length} 条记录`)
    emit('imported', payload.length)
  } catch (err) {
    ElMessage.error((err as Error).message || '导入失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="导入数据（CSV）"
    width="860px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <div class="be-panel__row">
        <el-button :icon="Upload" @click="pickFile">选择 CSV 文件</el-button>
        <span v-if="fileName" class="be-panel__hint">{{ fileName }}</span>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.txt,text/csv"
          class="be-import__input"
          @change="onFile"
        />
        <div style="flex: 1" />
        <el-checkbox v-model="useHeader">首行是表头</el-checkbox>
      </div>

      <template v-if="rows.length">
        <div class="be-panel__hint">
          共解析 {{ dataRows.length }} 行 · 已映射 {{ mappedCount }} 列 · 未映射的列会被忽略
        </div>

        <div class="be-import__mapping">
          <div v-for="item in mappingFields" :key="item.index" class="be-import__map">
            <span class="be-import__map-header">{{ item.header || `第 ${item.index + 1} 列` }}</span>
            <el-select v-model="mapping[item.index]" size="small" placeholder="不导入">
              <el-option value="" label="不导入" />
              <el-option v-for="field in fields" :key="field.id" :label="field.name" :value="field.id" />
            </el-select>
          </div>
        </div>

        <div class="be-import__preview">
          <table>
            <thead>
              <tr>
                <th v-for="(item, index) in mappingFields" :key="index">{{ item.header || `列 ${index + 1}` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in preview" :key="rowIndex">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <el-empty v-else description="选择一个 CSV 文件开始导入" :image-size="80" />
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="busy" :disabled="!dataRows.length" @click="runImport">
        导入 {{ dataRows.length }} 行
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-import__input {
  display: none;
}

.be-import__mapping {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.be-import__map {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.be-import__map-header {
  font-size: 12px;
  color: var(--tg-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.be-import__preview {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
}

.be-import__preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.be-import__preview th,
.be-import__preview td {
  border-bottom: 1px solid var(--tg-border);
  padding: 6px 10px;
  text-align: left;
  white-space: nowrap;
}

.be-import__preview th {
  background: var(--tg-surface-2);
  color: var(--tg-text-2);
  font-weight: 600;
}
</style>
