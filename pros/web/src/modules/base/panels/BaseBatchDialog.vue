<script setup lang="ts">
/**
 * 批量操作：改字段值 / 删除记录。
 *
 * 写操作全部走服务端批量接口（整批成功或整批失败），
 * 不做「一半成功一半失败」的静默处理。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Edit } from '@element-plus/icons-vue'
import { batchRecords } from '../api'
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
    await batchRecords(props.projectId, props.tableId, {
      action: 'update',
      ids: props.recordIds,
      fields: { [field.value.id]: normalizedValue() },
    })
    ElMessage.success(`已更新 ${props.recordIds.length} 条记录`)
    emit('done')
  } catch (err) {
    ElMessage.error((err as Error).message || '批量更新失败')
  } finally {
    busy.value = false
  }
}

async function removeAll() {
  busy.value = true
  try {
    await batchRecords(props.projectId, props.tableId, { action: 'delete', ids: props.recordIds })
    ElMessage.success(`已删除 ${props.recordIds.length} 条记录`)
    emit('done')
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
        批量操作是整批事务：任意一条失败，整批都不会写入。
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

    <template #footer>
      <el-button :icon="Delete" type="danger" plain :loading="busy" @click="removeAll">
        删除选中记录
      </el-button>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>
