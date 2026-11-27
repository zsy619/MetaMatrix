<script setup lang="ts">
/**
 * 批量操作：改字段值 / 删除记录。
 *
 * 走服务端批量接口的「部分成功」模式（partial=true）：
 * 逐条执行，成功 N 条、失败 M 条，失败明细直接列在弹窗里，
 * 不会出现「一半成功一半失败但只弹一句报错」的情况。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Edit } from '@element-plus/icons-vue'
import { batchRecords, type BatchFailure } from '../api'
import type { FieldMeta } from '../types'

const props = defineProps<{
  projectId: string
  tableId: string
  fields: FieldMeta[]
  recordIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const busy = ref(false)
const fieldId = ref('')
const value = ref<unknown>('')
/** 最近一次批量操作的结果明细。 */
const result = ref<{ succeeded: number; failed: number; failures: BatchFailure[] } | null>(null)

const editableFields = computed(() => props.fields.filter((field) => field.type !== 'formula'))
const field = computed(() => editableFields.value.find((item) => item.id === fieldId.value))

const options = computed<string[]>(() => {
  const raw = field.value?.config?.options
  return Array.isArray(raw) ? raw.map((item) => String(item)) : []
})

function normalizedValue(): unknown {
  const type = field.value?.type
  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'rating') {
    const num = Number(value.value)
    return Number.isNaN(num) ? 0 : num
  }
  if (type === 'checkbox') return Boolean(value.value)
  if (type === 'multi_select' || type === 'user' || type === 'attachment' || type === 'link' || type === 'doc') {
    return Array.isArray(value.value) ? value.value : value.value ? [String(value.value)] : []
  }
  return value.value ?? ''
}

async function applyUpdate() {
  if (!field.value) {
    ElMessage.warning('请选择要修改的字段')
    return
  }
  busy.value = true
  try {
    const res = (await batchRecords(props.projectId, props.tableId, {
      action: 'update',
      ids: props.recordIds,
      fields: { [field.value.id]: normalizedValue() },
      partial: true,
    })) as { succeeded: number; failed: number; failures: BatchFailure[] }
    result.value = { succeeded: res.succeeded, failed: res.failed, failures: res.failures ?? [] }
    if (!res.failed) {
      ElMessage.success(`已更新 ${res.succeeded} 条记录`)
      emit('done')
    } else {
      ElMessage.warning(`成功 ${res.succeeded} 条，失败 ${res.failed} 条`)
    }
  } catch (err) {
    ElMessage.error((err as Error).message || '批量更新失败')
  } finally {
    busy.value = false
  }
}

async function removeAll() {
  busy.value = true
  try {
    const res = (await batchRecords(props.projectId, props.tableId, {
      action: 'delete',
      ids: props.recordIds,
      partial: true,
    })) as { succeeded: number; failed: number; failures: BatchFailure[] }
    result.value = { succeeded: res.succeeded, failed: res.failed, failures: res.failures ?? [] }
    if (!res.failed) {
      ElMessage.success(`已删除 ${res.succeeded} 条记录`)
      emit('done')
    } else {
      ElMessage.warning(`成功 ${res.succeeded} 条，失败 ${res.failed} 条`)
    }
  } catch (err) {
    ElMessage.error((err as Error).message || '批量删除失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="`批量操作 · 已选 ${recordIds.length} 条`"
    width="560px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <div class="be-panel__hint">
        批量操作逐条执行：成功与失败分开统计，失败明细列在下方（不会静默丢弃）。
      </div>
      <div class="be-panel__row">
        <el-select v-model="fieldId" style="width: 200px" placeholder="选择字段">
          <el-option v-for="item in editableFields" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select
          v-if="field?.type === 'single_select'"
          v-model="value"
          style="flex: 1"
          placeholder="设置新值"
        >
          <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
        </el-select>
        <el-switch
          v-else-if="field?.type === 'checkbox'"
          v-model="value"
          active-value="true"
          inactive-value="false"
        />
        <el-input-number
          v-else-if="['number', 'currency', 'percent', 'rating'].includes(field?.type ?? '')"
          v-model="value"
          style="flex: 1"
          :controls="false"
        />
        <el-date-picker
          v-else-if="field?.type === 'date'"
          v-model="value"
          type="date"
          value-format="YYYY-MM-DD"
          style="flex: 1"
        />
        <el-date-picker
          v-else-if="field?.type === 'datetime'"
          v-model="value"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="flex: 1"
        />
        <el-input v-else v-model="value" style="flex: 1" placeholder="设置新值" />
        <el-button :icon="Edit" type="primary" :loading="busy" :disabled="!field" @click="applyUpdate">
          应用
        </el-button>
      </div>
    </div>

    <div v-if="result" class="be-batch-result">
      <div class="be-batch-result__head">
        <el-tag type="success" size="small" effect="plain">成功 {{ result.succeeded }}</el-tag>
        <el-tag v-if="result.failed" type="danger" size="small" effect="plain">失败 {{ result.failed }}</el-tag>
      </div>
      <ul v-if="result.failures.length" class="be-batch-result__list">
        <li v-for="(item, index) in result.failures" :key="index">
          <span class="be-batch-result__target">{{ item.target }}</span>
          <span class="be-batch-result__msg">{{ item.message }}</span>
        </li>
      </ul>
    </div>

    <template #footer>
      <el-button :icon="Delete" type="danger" plain :loading="busy" @click="removeAll">
        删除选中记录
      </el-button>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-batch-result {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface-2);
}
.be-batch-result__head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.be-batch-result__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
}
.be-batch-result__list li {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 4px 0;
  font-size: 12px;
  border-top: 1px solid var(--tg-border);
}
.be-batch-result__target {
  flex: none;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tg-text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.be-batch-result__msg {
  color: var(--tg-red);
  word-break: break-all;
}
</style>
