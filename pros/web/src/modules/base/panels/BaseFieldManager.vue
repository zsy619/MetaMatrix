<script setup lang="ts">
/**
 * 字段管理面板：新增 / 改名 / 改类型 / 必填 / 删除 / 公式。
 *
 * 字段是 Base Engine 的核心元数据，所有变更都走服务端，
 * 服务端会同步投影表结构并触发公式重算。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowUp,
  Delete,
  Edit,
  Lock,
  MagicStick,
  Plus,
  Refresh,
  Setting,
  Star,
  StarFilled,
  Switch,
} from '@element-plus/icons-vue'
import {
  createField,
  deleteField,
  fetchTableSchema,
  listTables,
  migrateField,
  recalcLookupRollup,
  reorderFields,
  updateField,
} from '../api'
import { listSpaceMembers, type SpaceMember } from '../../../api/knowledge_v6'
import { allFieldPlugins, defaultConfig, fieldPlugin } from '../fields/registry'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import type { BaseTable, FieldCondition, FieldMeta, FieldTypeDefinition } from '../types'

const props = defineProps<{
  projectId: string
  baseId: string
  tableId: string
  fields: FieldMeta[]
  definitions: FieldTypeDefinition[]
  /** 打开时高亮并滚动到的字段（列头菜单「编辑字段」）。 */
  focusFieldId?: string
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

// —— 字段级权限（可见 / 只读角色）——

const permField = ref<FieldMeta | null>(null)
const permHidden = ref<string[]>([])
const permReadOnly = ref<string[]>([])
/** 按人指定：不可见的成员 / 只读的成员。 */
const permHiddenUsers = ref<string[]>([])
const permReadOnlyUsers = ref<string[]>([])
/** 条件可见：只有满足条件的记录才看得到该字段（第十五轮）。 */
const permVisibleWhen = ref<FieldCondition[]>([])
const permVisibleLogic = ref<'AND' | 'OR'>('AND')
const permSaving = ref(false)
/** 空间成员（按人指定时可选）。 */
const spaceMembers = ref<SpaceMember[]>([])


/** 计算字段（引用 / 汇总）的配置状态。 */
const computedTables = ref<BaseTable[]>([])
const computedTargetFields = ref<FieldMeta[]>([])
const computedTargetTableId = ref('')
const computedTargetFieldId = ref('')
const computedLinkFieldId = ref('')
const computedRollupType = ref<'sum' | 'avg' | 'count' | 'countUnique' | 'min' | 'max'>('sum')
/**
 * 本表里可作为「关联通道」的字段（关联记录类型）。
 *
 * 引用 / 汇总的取值链路是：本行 --(本表的 link 字段)--> 目标表的一行 --> 取目标字段的值。
 * 没指定 linkFieldId 时服务端会自动挑一个 link 字段，但在有多个关联字段时
 * 「自动挑」的结果不可预期 —— 所以界面上必须让用户显式选。
 */
const computedLinkFields = computed(() =>
  props.fields.filter((f) => f.type === 'link'),
)
/** 正在编辑配置的已有计算字段（为空表示「新增字段」阶段）。 */
const computedField = ref<FieldMeta | null>(null)
const computedSaving = ref(false)
const computedBusy = ref(false)

const ROLLUP_OPTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均值' },
  { value: 'count', label: '计数' },
  { value: 'countUnique', label: '去重计数' },
  { value: 'min', label: '最小值' },
  { value: 'max', label: '最大值' },
]

/** 是否为计算字段类型（引用 / 汇总）。 */
function isComputedType(type: string) {
  return type === 'lookup' || type === 'rollup'
}

/** 载入目标表候选（同一个 Base 内的其它表）。 */
async function loadComputedTables() {
  if (!props.baseId || computedTables.value.length) return
  try {
    computedTables.value = await listTables(props.projectId, props.baseId)
  } catch {
    computedTables.value = []
  }
}

/** 载入目标表的字段候选。 */
async function loadTargetFields(tableId: string) {
  if (!tableId) {
    computedTargetFields.value = []
    return
  }
  try {
    const schema = await fetchTableSchema(props.projectId, tableId)
    computedTargetFields.value = schema.fields || []
  } catch {
    computedTargetFields.value = []
  }
}

/** 新建字段时切换到计算类型：自动载入目标表。 */
async function onNewTypeChange(type: string) {
  if (!isComputedType(type)) return
  await loadComputedTables()
  if (!computedTargetTableId.value && computedTables.value.length) {
    const other = computedTables.value.find((t) => t.id !== props.tableId)
    if (other) {
      computedTargetTableId.value = other.id
      await loadTargetFields(other.id)
    }
  }
}

/** 组装计算字段配置。 */
function computedConfig(type?: string) {
  const config: Record<string, unknown> = {
    targetTableId: computedTargetTableId.value,
    targetFieldId: computedTargetFieldId.value,
  }
  if (computedLinkFieldId.value) config.linkFieldId = computedLinkFieldId.value
  // 汇总方式：新建时看 newType，编辑已有字段时看字段自身类型。
  const kind = type || newType.value
  if (kind === 'rollup') config.rollupType = computedRollupType.value
  return config
}

/** 打开已有计算字段的配置弹窗。 */
async function openComputedConfig(field: FieldMeta) {
  computedField.value = field
  await loadComputedTables()
  const cfg = (field.config || {}) as Record<string, string>
  computedTargetTableId.value = cfg.targetTableId || ''
  computedTargetFieldId.value = cfg.targetFieldId || ''
  computedLinkFieldId.value = cfg.linkFieldId || ''
  computedRollupType.value = (cfg.rollupType as typeof computedRollupType.value) || 'sum'
  await loadTargetFields(computedTargetTableId.value)
}

/** 保存计算字段配置。 */
async function saveComputedConfig() {
  if (!computedField.value) return
  computedSaving.value = true
  try {
    await updateField(props.projectId, computedField.value.id, {
      config: computedConfig(computedField.value.type),
    })
    ElMessage.success('配置已保存，正在重算')
    await recalcLookupRollup(props.projectId, props.tableId)
    computedField.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '保存失败')
  } finally {
    computedSaving.value = false
  }
}

/** 立即重算本表的引用 / 汇总字段。 */
async function recalcComputed() {
  computedBusy.value = true
  try {
    const res = await recalcLookupRollup(props.projectId, props.tableId)
    ElMessage.success(`已重算 ${res.updated ?? 0} 条记录`)
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '重算失败')
  } finally {
    computedBusy.value = false
  }
}

const ROLE_OPTIONS = [
  { value: 'viewer', label: '访客（只读成员）' },
  { value: 'editor', label: '编辑者' },
]

/** 读取字段配置里的权限策略。 */
function policyOf(field?: FieldMeta) {
  const raw = field?.config?.permissions as
    | {
        hidden?: unknown
        readOnly?: unknown
        hiddenUsers?: unknown
        readOnlyUsers?: unknown
        visibleWhen?: { logic?: string; conditions?: unknown }
      }
    | undefined
  const pick = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)) : []
  const conditions = Array.isArray(raw?.visibleWhen?.conditions) ? raw!.visibleWhen!.conditions : []
  return {
    hidden: pick(raw?.hidden),
    readOnly: pick(raw?.readOnly),
    hiddenUsers: pick(raw?.hiddenUsers),
    readOnlyUsers: pick(raw?.readOnlyUsers),
    visibleLogic: (raw?.visibleWhen?.logic === 'OR' ? 'OR' : 'AND') as 'AND' | 'OR',
    visibleWhen: conditions
      .map((item) => item as FieldCondition)
      .filter((item) => item && item.fieldId && item.operator),
  }
}

/** 打开权限配置。 */
function openPerm(field: FieldMeta) {
  const policy = policyOf(field)
  permField.value = field
  permHidden.value = [...policy.hidden]
  permReadOnly.value = [...policy.readOnly]
  permHiddenUsers.value = [...policy.hiddenUsers]
  permReadOnlyUsers.value = [...policy.readOnlyUsers]
  permVisibleLogic.value = policy.visibleLogic
  permVisibleWhen.value = policy.visibleWhen.map((item) => ({ ...item }))
  void loadMembers()
}

/** 载入空间成员（按人指定时可选）。 */
async function loadMembers() {
  if (spaceMembers.value.length) return
  try {
    spaceMembers.value = await listSpaceMembers(props.projectId)
  } catch {
    spaceMembers.value = []
  }
}

/** 成员下拉项。 */
const memberOptions = computed(() =>
  spaceMembers.value.map((item: SpaceMember) => ({ value: item.userId, label: item.name || item.email })),
)

/** 可作为条件来源的字段（排除自己，避免自引用死循环）。 */
const permFieldOptions = computed(() =>
  props.fields.filter((item) => item.id !== permField.value?.id),
)

/** 条件运算符（与服务端 matchCondition 保持一致）。 */
const COND_OPERATORS = [
  { value: 'eq', label: '等于', needValue: true },
  { value: 'ne', label: '不等于', needValue: true },
  { value: 'contains', label: '包含', needValue: true },
  { value: 'notcontains', label: '不包含', needValue: true },
  { value: 'startswith', label: '开头是', needValue: true },
  { value: 'endswith', label: '结尾是', needValue: true },
  { value: 'gt', label: '大于', needValue: true, number: true },
  { value: 'gte', label: '大于等于', needValue: true, number: true },
  { value: 'lt', label: '小于', needValue: true, number: true },
  { value: 'lte', label: '小于等于', needValue: true, number: true },
  { value: 'isempty', label: '为空', needValue: false },
  { value: 'isnotempty', label: '不为空', needValue: false },
]

/** 某个运算符是否需要填值。 */
function opNeedValue(op: string): boolean {
  return COND_OPERATORS.find((item) => item.value === op)?.needValue ?? true
}

/** 添加一条条件。 */
function addCondition() {
  const first = permFieldOptions.value[0]
  permVisibleWhen.value.push({
    fieldId: first?.id ?? '',
    operator: 'eq',
    value: '',
  })
}

/** 删除一条条件。 */
function removeCondition(index: number) {
  permVisibleWhen.value.splice(index, 1)
}

/** 保存权限配置（config 是整体覆盖，需要带上原配置）。 */
async function savePerm() {
  const field = permField.value
  if (!field) return
  permSaving.value = true
  try {
    const config = { ...(field.config ?? {}) }
    const empty =
      !permHidden.value.length &&
      !permReadOnly.value.length &&
      !permHiddenUsers.value.length &&
      !permReadOnlyUsers.value.length &&
      !permVisibleWhen.value.length
    if (empty) {
      // 注意：不能「不传 permissions」来表达清除 —— 服务端会把它当成「没改」而保留旧策略。
      // 必须显式传一个空策略，服务端据此删除 permissions 键。
      config.permissions = { hidden: [], readOnly: [], hiddenUsers: [], readOnlyUsers: [] }
    } else {
      config.permissions = {
        hidden: permHidden.value,
        readOnly: permReadOnly.value,
        hiddenUsers: permHiddenUsers.value,
        readOnlyUsers: permReadOnlyUsers.value,
      }
      if (permVisibleWhen.value.length) {
        ;(config.permissions as Record<string, unknown>).visibleWhen = {
          logic: permVisibleLogic.value,
          conditions: permVisibleWhen.value.filter((item) => item.fieldId && item.operator),
        }
      }
    }
    await updateField(props.projectId, field.id, { config })
    ElMessage.success('字段权限已更新')
    permField.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error((err as Error).message || '权限设置失败')
  } finally {
    permSaving.value = false
  }
}

/** 字段是否配置了权限。 */
function hasPerm(field: FieldMeta): boolean {
  const policy = policyOf(field)
  return (
    policy.hidden.length > 0 ||
    policy.readOnly.length > 0 ||
    policy.hiddenUsers.length > 0 ||
    policy.readOnlyUsers.length > 0 ||
    policy.visibleWhen.length > 0
  )
}

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
    const config = isComputedType(newType.value)
      ? computedConfig()
      : defaultConfig(newType.value)
    if (isComputedType(newType.value) && !computedTargetFieldId.value) {
      ElMessage.warning('请选择要引用的目标字段')
      busy.value = false
      return
    }
    await createField(props.projectId, props.tableId, {
      name,
      type: newType.value,
      config,
      required: newRequired.value,
    })
    if (isComputedType(newType.value)) {
      await recalcLookupRollup(props.projectId, props.tableId)
    }
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
    if (!name) {
      // 空名会让表头「没有标题」（只剩一个类型图标），这里明确拒绝而不是静默失败。
      ElMessage.warning('字段名称不能为空')
      return
    }
    if (name === field.name) return
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

/** 字段行 DOM：用于「列头菜单 → 编辑字段」后滚动定位。 */
const rowRefs = ref<Record<string, HTMLElement | undefined>>({})

function setRowRef(el: unknown, fieldId: string) {
  rowRefs.value[fieldId] = (el as HTMLElement | undefined) ?? undefined
}

watch(
  () => props.focusFieldId,
  async (fieldId) => {
    if (!fieldId) return
    await nextTick()
    rowRefs.value[fieldId]?.scrollIntoView({ block: 'center' })
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <el-dialog
    :model-value="true"
    title="字段管理"
    width="720px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel">
      <div class="be-panel__hint">
        字段决定列的结构与可用的筛选、排序方式。公式字段由服务端计算，不支持直接编辑。
      </div>

      <div class="be-panel">
        <div
          v-for="(field, index) in fields"
          :key="field.id"
          :ref="(el) => setRowRef(el, field.id)"
          class="be-field-row"
          :class="{ 'is-focus': focusFieldId === field.id }"
        >
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
            <el-tag v-if="hasPerm(field)" size="small" type="warning" effect="plain">权限</el-tag>
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
            <el-tooltip v-if="isComputedType(field.type)" content="配置引用 / 汇总" placement="top">
              <el-button
                size="small"
                circle
                :icon="Setting"
                aria-label="配置字段"
                @click="openComputedConfig(field)"
              />
            </el-tooltip>
            <el-tooltip content="改名" placement="top">
              <el-button
                size="small"
                circle
                :icon="Edit"
                aria-label="重命名字段"
                @click="rename(field)"
              />
            </el-tooltip>
            <el-tooltip v-if="field.type === 'formula'" content="编辑公式" placement="top">
              <el-button
                size="small"
                circle
                :icon="MagicStick"
                aria-label="编辑公式"
                @click="emit('edit-formula', field)"
              />
            </el-tooltip>
            <el-tooltip :content="field.required ? '取消必填' : '设为必填'" placement="top">
              <el-button
                size="small"
                circle
                :icon="field.required ? StarFilled : Star"
                :type="field.required ? 'danger' : undefined"
                :plain="field.required"
                aria-label="切换必填"
                @click="toggleRequired(field)"
              />
            </el-tooltip>
            <el-tooltip content="字段权限（可见 / 只读角色）" placement="top">
              <el-button
                size="small"
                circle
                :icon="Lock"
                :type="hasPerm(field) ? 'warning' : undefined"
                :plain="hasPerm(field)"
                aria-label="设置字段权限"
                @click="openPerm(field)"
              />
            </el-tooltip>
            <el-dropdown
              trigger="click"
              @command="(type: string) => changeType(field, type)"
            >
              <el-button
                size="small"
                circle
                :icon="Switch"
                title="改类型"
                aria-label="修改字段类型"
              />
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
            <el-tooltip content="删除" placement="top">
              <el-button
                size="small"
                circle
                :icon="Delete"
                type="danger"
                plain
                aria-label="删除字段"
                @click="removeField(field)"
              />
            </el-tooltip>
          </div>
        </div>
        <el-empty v-if="!fields.length" description="还没有字段，先添加一个吧" :image-size="72" />
      </div>

      <el-divider content-position="left">新增字段</el-divider>
      <div v-if="isComputedType(newType)" class="be-computed">
        <div class="be-computed__row">
          <span class="be-computed__label">目标表</span>
          <el-select
            v-model="computedTargetTableId"
            size="small"
            style="flex: 1"
            placeholder="选择目标表"
            @change="(val: string) => loadTargetFields(val)"
          >
            <el-option
              v-for="item in computedTables"
              :key="item.id"
              :label="item.name"
              :value="item.id"
              :disabled="item.id === tableId"
            />
          </el-select>
        </div>
        <div class="be-computed__row">
          <span class="be-computed__label">目标字段</span>
          <el-select
            v-model="computedTargetFieldId"
            size="small"
            style="flex: 1"
            placeholder="选择目标字段"
          >
            <el-option
              v-for="item in computedTargetFields"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>
        <div class="be-computed__row">
          <span class="be-computed__label">关联字段</span>
          <el-select
            v-model="computedLinkFieldId"
            size="small"
            style="flex: 1"
            placeholder="选择本表用来关联的字段"
            clearable
          >
            <el-option
              v-for="item in computedLinkFields"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>
        <div v-if="newType === 'rollup'" class="be-computed__row">
          <span class="be-computed__label">汇总方式</span>
          <el-select v-model="computedRollupType" size="small" style="flex: 1">
            <el-option v-for="opt in ROLLUP_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>
        <div class="be-computed__hint">
          引用 / 汇总是「计算字段」：值由服务端按关联关系算出，改动目标表后会自动重算，
          也可以点「立即重算」手动触发。
        </div>
      </div>
      <div class="be-panel__row">
        <el-input v-model="newName" placeholder="字段名称，如「负责人」" style="flex: 1" />
        <el-select v-model="newType" style="width: 150px" @change="onNewTypeChange">
          <el-option v-for="opt in typeOptions" :key="opt.value" :label="opt.label" :value="opt.value">
            <el-icon class="be-type-icon" :style="{ color: opt.color }">
              <component :is="iconOf(opt.value)" />
            </el-icon>
            {{ opt.label }}
          </el-option>
        </el-select>
        <el-checkbox v-model="newRequired">必填</el-checkbox>
        <el-tooltip content="立即重算引用 / 汇总字段" placement="top">
          <el-button :icon="Refresh" :loading="computedBusy" @click="recalcComputed">重算</el-button>
        </el-tooltip>
        <el-button type="primary" :icon="Plus" :loading="busy" @click="addField">添加</el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">完成</el-button>
    </template>
  </el-dialog>

  <!-- 计算字段配置：引用 / 汇总 -->
  <el-dialog
    :model-value="Boolean(computedField)"
    :title="`计算字段配置 · ${computedField?.name ?? ''}`"
    width="480px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="computedField = null"
  >
    <div class="be-computed">
      <div class="be-computed__row">
        <span class="be-computed__label">目标表</span>
        <el-select
          v-model="computedTargetTableId"
          size="small"
          style="flex: 1"
          placeholder="选择目标表"
          @change="(val: string) => loadTargetFields(val)"
        >
          <el-option
            v-for="item in computedTables"
            :key="item.id"
            :label="item.name"
            :value="item.id"
            :disabled="item.id === tableId"
          />
        </el-select>
      </div>
      <div class="be-computed__row">
        <span class="be-computed__label">目标字段</span>
        <el-select
          v-model="computedTargetFieldId"
          size="small"
          style="flex: 1"
          placeholder="选择目标字段"
        >
          <el-option
            v-for="item in computedTargetFields"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <div class="be-computed__row">
        <span class="be-computed__label">关联字段</span>
        <el-select
          v-model="computedLinkFieldId"
          size="small"
          style="flex: 1"
          placeholder="选择本表用来关联的字段"
          clearable
        >
          <el-option
            v-for="item in computedLinkFields"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <div v-if="computedField?.type === 'rollup'" class="be-computed__row">
        <span class="be-computed__label">汇总方式</span>
        <el-select v-model="computedRollupType" size="small" style="flex: 1">
          <el-option v-for="opt in ROLLUP_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </div>
      <div class="be-computed__hint">
        取值链路：本行 —（关联字段）→ 目标表的一行 → 取「目标字段」的值。
        不选关联字段时服务端会自动挑一个关联记录字段；本表有多个关联字段时建议显式指定。
      </div>
    </div>
    <template #footer>
      <el-button @click="computedField = null">取消</el-button>
      <el-button type="primary" :loading="computedSaving" @click="saveComputedConfig">保存并重算</el-button>
    </template>
  </el-dialog>

  <!-- 字段权限：可见 / 只读角色 -->
  <el-dialog
    :model-value="Boolean(permField)"
    :title="`字段权限 · ${permField?.name ?? ''}`"
    width="440px"
    append-to-body
    modal-class="be-modal"
    destroy-on-close
    @close="permField = null"
  >
    <div v-if="permField" class="be-perm">
      <div class="be-perm__hint">
        「隐藏」的角色在服务端就拿不到该字段（列与值都不返回）；
        「只读」的角色可以查看，但不能写入。不设置则全员可见可编辑。
      </div>
      <div class="be-perm__row">
        <span class="be-perm__label">不可见角色</span>
        <el-select
          v-model="permHidden"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="默认全员可见"
          style="flex: 1"
        >
          <el-option v-for="role in ROLE_OPTIONS" :key="role.value" :label="role.label" :value="role.value" />
        </el-select>
      </div>
      <div class="be-perm__row">
        <span class="be-perm__label">不可见成员</span>
        <el-select
          v-model="permHiddenUsers"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          placeholder="默认全员可见"
          style="flex: 1"
        >
          <el-option v-for="item in memberOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
      <div class="be-perm__row">
        <span class="be-perm__label">只读角色</span>
        <el-select
          v-model="permReadOnly"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="默认全员可编辑"
          style="flex: 1"
        >
          <el-option v-for="role in ROLE_OPTIONS" :key="role.value" :label="role.label" :value="role.value" />
        </el-select>
      </div>
      <div class="be-perm__row">
        <span class="be-perm__label">只读成员</span>
        <el-select
          v-model="permReadOnlyUsers"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          placeholder="默认全员可编辑"
          style="flex: 1"
        >
          <el-option v-for="item in memberOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
      <div class="be-perm__hint">
        「不可见成员」优先级高于角色规则：被单独列出的成员即便属于某个可见角色，
        也拿不到该字段（列与值都不返回）。
      </div>

      <!-- 条件可见（第十五轮）：只有满足条件的记录才看得到该字段 -->
      <div class="be-perm__section">
        <div class="be-perm__section-head">
          <span class="be-perm__label">条件可见</span>
          <el-radio-group v-if="permVisibleWhen.length" v-model="permVisibleLogic" size="small">
            <el-radio-button value="AND">同时满足</el-radio-button>
            <el-radio-button value="OR">任一满足</el-radio-button>
          </el-radio-group>
          <el-button size="small" text :icon="Plus" @click="addCondition">添加条件</el-button>
        </div>
        <div v-if="!permVisibleWhen.length" class="be-perm__hint">
          未设置：所有记录都能看到该字段。设置后，不满足条件的记录在服务端就拿不到该字段的值。
        </div>
        <div v-for="(cond, index) in permVisibleWhen" :key="index" class="be-perm__cond">
          <el-select
            v-model="cond.fieldId"
            class="be-perm__cond-field"
            size="small"
            placeholder="条件字段"
          >
            <el-option
              v-for="item in permFieldOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-select v-model="cond.operator" class="be-perm__cond-op" size="small">
            <el-option v-for="op in COND_OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
          </el-select>
          <el-input
            v-if="opNeedValue(cond.operator)"
            v-model="cond.value as string"
            class="be-perm__cond-value"
            size="small"
            placeholder="值"
          />
          <el-button size="small" text :icon="Delete" @click="removeCondition(index)">删除</el-button>
        </div>
        <div class="be-perm__hint">
          条件可见是按记录判定的：例如「预算 &gt; 10000 时才看得到税额」。
          字段仍然出现在列表里（有的记录看得到），不满足条件的那几行显示为占位符。
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="permField = null">取消</el-button>
      <el-button type="primary" :loading="permSaving" @click="savePerm">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.be-perm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.be-perm__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--tg-border);
}

.be-perm__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.be-perm__cond {
  display: flex;
  align-items: center;
  gap: 6px;
}

.be-perm__cond-field {
  width: 120px;
}

.be-perm__cond-op {
  width: 108px;
}

.be-perm__cond-value {
  flex: 1;
  min-width: 80px;
}

.be-perm__hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tg-text-2);
}

.be-perm__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.be-perm__label {
  width: 84px;
  flex: none;
  font-size: 13px;
  color: var(--tg-text);
}

.be-computed {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--tg-border);
  border-radius: 12px;
  background: var(--tg-surface-soft, rgba(15, 23, 42, 0.02));
}

.be-computed__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.be-computed__label {
  width: 72px;
  flex: none;
  font-size: 13px;
  color: var(--tg-text);
}

.be-computed__hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tg-text-2);
}

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
