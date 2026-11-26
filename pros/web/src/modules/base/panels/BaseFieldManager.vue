<script setup lang="ts">
/**
 * 字段管理面板：新增 / 改名 / 改类型 / 必填 / 删除 / 公式。
 *
 * 字段是 Base Engine 的核心元数据，所有变更都走服务端，
 * 服务端会同步投影表结构并触发公式重算。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Delete, Edit, MagicStick, Plus } from '@element-plus/icons-vue'
import {
  createField,
  deleteField,
  migrateField,
  reorderFields,
  updateField,
} from '../api'
import { allFieldPlugins, defaultConfig, fieldPlugin } from '../fields/registry'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import type { FieldMeta, FieldTypeDefinition } from '../types'

const props = defineProps<{
  projectId: string
  tableId: string
  fields: FieldMeta[]
  definitions: FieldTypeDefinition[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
  (e: 'edit-formula', field: FieldMeta): void
}>()

const plugins = allFieldPlugins()
const busy = ref(false)
const reordering = ref(false)

const newName = ref('')
const newType = ref<string>('text')
const newRequired = ref(false)

const typeOptions = computed(() =>
  props.definitions.length
    ? props.definitions.map((def) => ({
        value: def.type,
        label: def.label || fieldPlugin(def.type)?.label || def.type,
        icon: def.icon,
        color: def.color,
        description: def.description,
      }))
    : plugins.map((item) => ({
        value: item.type,
        label: item.label,
        icon: item.icon,
        color: item.color,
        description: item.description,
      })),
)

function labelOf(type: string) {
  return typeOptions.value.find((item) => item.value === type)?.label ?? type
}

function iconOf(type: string) {
  return fieldTypeIcon(type)
}

async function addField() {
  if (!props.tableId) {
    ElMessage.warning('当前多维表格还没有数据表，请先新建数据表')
    return
  }
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请填写字段名称')
    return
  }
  busy.value = true
  try {
    await createField(props.projectId, props.tableId, {
      name,
      type: newType.value,
      config: defaultConfig(newType.value),
      required: newRequired.value,
    })
    newName.value = ''
    newRequired.value = false
    ElMessage.success('字段已添加')
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '字段添加失败')
  } finally {
    busy.value = false
  }
}

async function rename(field: FieldMeta) {
  try {
    const { value } = await ElMessageBox.prompt('新的字段名称', '重命名字段', {
      inputValue: field.name,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    const name = (value ?? '').trim()
    if (!name || name === field.name) return
    await updateField(props.projectId, field.id, { name })
    ElMessage.success('已重命名')
    emit('changed')
  } catch {
    /* 取消 */
  }
}

async function toggleRequired(field: FieldMeta) {
  try {
    await updateField(props.projectId, field.id, { required: !field.required })
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '设置失败')
  }
}

async function changeType(field: FieldMeta, type: string) {
  if (type === field.type) return
  try {
    await ElMessageBox.confirm(
      `将「${field.name}」从 ${labelOf(field.type)} 迁移为 ${labelOf(type)}，已有值会按新类型转换。`,
      '迁移字段类型',
      { confirmButtonText: '迁移', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await migrateField(props.projectId, field.id, type)
    ElMessage.success('字段类型已迁移')
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '迁移失败')
  }
}

async function removeField(field: FieldMeta) {
  try {
    await ElMessageBox.confirm(`删除字段「${field.name}」将同时清除该列的所有值，且不可恢复。`, '删除字段', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteField(props.projectId, field.id)
    ElMessage.success('字段已删除')
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '删除失败')
  }
}

/** 上移 / 下移字段：把新顺序整体提交给服务端，一次事务写回 sort_order。 */
async function moveField(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= props.fields.length || !props.tableId) return
  const ids = props.fields.map((item) => item.id)
  const [moved] = ids.splice(index, 1)
  ids.splice(target, 0, moved)
  reordering.value = true
  try {
    await reorderFields(props.projectId, props.tableId, ids)
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '排序失败')
  } finally {
    reordering.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="字段管理"
    width="720px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <div class="be-panel__hint">
        字段决定列的结构与可用的筛选、排序方式。公式字段由服务端计算，不支持直接编辑。
      </div>

      <div class="be-panel">
        <div v-for="(field, index) in fields" :key="field.id" class="be-field-row">
          <div class="be-field-row__name">
            <el-icon
              class="be-field-row__icon"
              :style="{ color: fieldTypeColor(field.type) }"
            >
              <component :is="iconOf(field.type)" />
            </el-icon>
            <span class="be-field-row__label">{{ field.name }}</span>
            <span class="be-field-row__type">{{ labelOf(field.type) }}</span>
            <el-tag v-if="field.isPrimary" size="small" type="primary" effect="plain">主字段</el-tag>
            <el-tag v-if="field.required" size="small" type="danger" effect="plain">必填</el-tag>
          </div>
          <div class="be-field-row__actions">
            <el-tooltip content="上移" placement="top">
              <el-button
                size="small"
                circle
                :icon="ArrowUp"
                :disabled="index === 0 || reordering"
                aria-label="上移字段"
                @click="moveField(index, -1)"
              />
            </el-tooltip>
            <el-tooltip content="下移" placement="top">
              <el-button
                size="small"
                circle
                :icon="ArrowDown"
                :disabled="index === fields.length - 1 || reordering"
                aria-label="下移字段"
                @click="moveField(index, 1)"
              />
            </el-tooltip>
            <el-button size="small" :icon="Edit" @click="rename(field)">改名</el-button>
            <el-button
              v-if="field.type === 'formula'"
              size="small"
              :icon="MagicStick"
              @click="emit('edit-formula', field)"
            >
              公式
            </el-button>
            <el-button size="small" @click="toggleRequired(field)">
              {{ field.required ? '取消必填' : '设为必填' }}
            </el-button>
            <el-dropdown
              trigger="click"
              @command="(type: string) => changeType(field, type)"
            >
              <el-button size="small">改类型</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="opt in typeOptions"
                    :key="opt.value"
                    :command="opt.value"
                    :disabled="opt.value === field.type"
                  >
                    <el-icon class="be-type-icon" :style="{ color: opt.color }">
                      <component :is="iconOf(opt.value)" />
                    </el-icon>
                    {{ opt.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" :icon="Delete" type="danger" plain @click="removeField(field)">
              删除
            </el-button>
          </div>
        </div>
        <el-empty v-if="!fields.length" description="还没有字段，先添加一个吧" :image-size="72" />
      </div>

      <el-divider content-position="left">新增字段</el-divider>
      <div class="be-panel__row">
        <el-input v-model="newName" placeholder="字段名称，如「负责人」" style="flex: 1" />
        <el-select v-model="newType" style="width: 150px">
          <el-option v-for="opt in typeOptions" :key="opt.value" :label="opt.label" :value="opt.value">
            <el-icon class="be-type-icon" :style="{ color: opt.color }">
              <component :is="iconOf(opt.value)" />
            </el-icon>
            {{ opt.label }}
          </el-option>
        </el-select>
        <el-checkbox v-model="newRequired">必填</el-checkbox>
        <el-button type="primary" :icon="Plus" :loading="busy" @click="addField">添加</el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">完成</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-field-row__icon {
  color: var(--tg-text-2);
  font-size: 14px;
}

/* 类型图标：固定槽位宽度，保证下拉列表里的文字左边缘对齐 */
.be-type-icon {
  margin-right: 6px;
  font-size: 15px;
  vertical-align: -2px;
}

.be-field-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
