<script setup lang="ts">
/**
 * Base 设置：名称 / 图标 / 描述 + 删除 Base。
 *
 * 补齐共享方案 §10.2 缺失的 Base 写接口（POST /bases、PATCH /bases/:id、DELETE /bases/:id）。
 * 样式遵循全局 Telegram 规范（弹窗白底 + 12px 圆角 + 发丝线输入框）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, EditPen } from '@element-plus/icons-vue'
import { deleteBase, updateBase } from '../api'
import type { BaseInfo } from '../types'

const props = defineProps<{
  modelValue: boolean
  projectId: string
  base: BaseInfo | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', base: BaseInfo): void
  (e: 'deleted'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const name = ref('')
const description = ref('')
const icon = ref('')
const saving = ref(false)
const removing = ref(false)

watch(
  () => [props.modelValue, props.base] as const,
  ([open, base]) => {
    if (!open || !base) return
    name.value = base.name ?? ''
    description.value = base.description ?? ''
    icon.value = base.icon ?? ''
  },
  { immediate: true },
)

async function save() {
  if (!props.base) return
  const trimmed = name.value.trim()
  if (!trimmed) {
    ElMessage.warning('名称不能为空')
    return
  }
  saving.value = true
  try {
    const updated = await updateBase(props.projectId, props.base.id, {
      name: trimmed,
      description: description.value.trim(),
      icon: icon.value.trim(),
    })
    ElMessage.success('Base 设置已保存')
    emit('saved', updated)
    visible.value = false
  } catch (err) {
    ElMessage.error((err as Error)?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.base) return
  try {
    await ElMessageBox.confirm(
      props.base.nodeId
        ? `删除「${props.base.name}」会同时移除其下的数据表、字段、记录与视图，且不可恢复。若它绑定在知识库节点上，再次打开该节点会重新生成一个空表。`
        : `删除「${props.base.name}」会同时移除其下的数据表、字段、记录与视图，且不可恢复。`,
      '删除 Base',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  removing.value = true
  try {
    await deleteBase(props.projectId, props.base.id)
    ElMessage.success('Base 已删除')
    emit('deleted')
    visible.value = false
  } catch (err) {
    ElMessage.error((err as Error)?.message || '删除失败')
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="Base 设置"
    width="480px"
    append-to-body
    modal-class="be-modal"
    :close-on-click-modal="false"
  >
    <el-form label-width="72px" label-position="left">
      <el-form-item label="名称">
        <el-input v-model="name" maxlength="120" show-word-limit placeholder="多维表格名称" />
      </el-form-item>
      <el-form-item label="图标">
        <el-input v-model="icon" placeholder="图标标识（可选）" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          v-model="description"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
          placeholder="这个表用来做什么"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="be-settings__footer">
        <el-button type="danger" plain :icon="Delete" :loading="removing" @click="remove">
          删除 Base
        </el-button>
        <div class="be-settings__actions">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :icon="EditPen" :loading="saving" @click="save">
            保存
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-settings__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.be-settings__actions {
  display: flex;
  gap: 8px;
}
</style>
