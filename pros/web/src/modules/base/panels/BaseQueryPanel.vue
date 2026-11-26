<script setup lang="ts">
/**
 * 筛选 / 排序 / 分组面板。
 *
 * 三者最终都编译成服务端的 QueryRequest，
 * 前端不执行任何数据运算，保证与后端口径一致。
 */
import { ref, watch } from 'vue'
import { Delete, Plus, Sort } from '@element-plus/icons-vue'
import type { Condition, FieldMeta, FilterGroup, GroupRule, SortRule } from '../types'

const props = defineProps<{
  fields: FieldMeta[]
  filters?: FilterGroup
  sorts?: SortRule[]
  groups?: GroupRule[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', payload: { filters: FilterGroup; sorts: SortRule[]; groups: GroupRule[] }): void
}>()

const activeTab = ref<'filter' | 'sort' | 'group'>('filter')

const conditions = ref<Condition[]>([])
const sorts = ref<SortRule[]>([])
const groups = ref<GroupRule[]>([])
const logic = ref<'AND' | 'OR'>('AND')

watch(
  () => [props.filters, props.sorts, props.groups],
  () => {
    conditions.value = (props.filters?.conditions ?? []).map((item) => ({ ...item }))
    logic.value = props.filters?.logic ?? 'AND'
    sorts.value = (props.sorts ?? []).map((item) => ({ ...item }))
    groups.value = (props.groups ?? []).map((item) => ({ ...item }))
  },
  { immediate: true, deep: true },
)

const numericTypes = ['number', 'currency', 'percent', 'rating']
const temporalTypes = ['date', 'datetime']
const multiTypes = ['multi_select', 'user', 'attachment', 'link']

function fieldOf(fieldId?: string) {
  return props.fields.find((item) => item.id === fieldId)
}

function operatorsFor(type?: string) {
  if (!type) return []
  if (numericTypes.includes(type) || temporalTypes.includes(type)) {
    return [
      { value: 'eq', label: '等于' },
      { value: 'ne', label: '不等于' },
      { value: 'gt', label: '大于' },
      { value: 'gte', label: '大于等于' },
      { value: 'lt', label: '小于' },
      { value: 'lte', label: '小于等于' },
      { value: 'isempty', label: '为空' },
      { value: 'isnotempty', label: '不为空' },
    ]
  }
  if (type === 'checkbox') {
    return [
      { value: 'eq', label: '是' },
      { value: 'ne', label: '否' },
      { value: 'isempty', label: '为空' },
      { value: 'isnotempty', label: '不为空' },
    ]
  }
  if (multiTypes.includes(type)) {
    return [
      { value: 'contains', label: '包含' },
      { value: 'notcontains', label: '不包含' },
      { value: 'eq', label: '等于' },
      { value: 'ne', label: '不等于' },
      { value: 'isempty', label: '为空' },
      { value: 'isnotempty', label: '不为空' },
    ]
  }
  return [
    { value: 'contains', label: '包含' },
    { value: 'notcontains', label: '不包含' },
    { value: 'eq', label: '等于' },
    { value: 'ne', label: '不等于' },
    { value: 'startswith', label: '开头是' },
    { value: 'endswith', label: '结尾是' },
    { value: 'isempty', label: '为空' },
    { value: 'isnotempty', label: '不为空' },
  ]
}

function needsValue(op: string) {
  return op !== 'isempty' && op !== 'isnotempty'
}

function optionsOf(field?: FieldMeta) {
  const raw = field?.config?.options
  return Array.isArray(raw) ? raw.map((item) => String(item)) : []
}

function addCondition() {
  const field = props.fields[0]
  if (!field) return
  conditions.value.push({ fieldId: field.id, operator: 'contains', value: '' })
}

function addSort() {
  const field = props.fields[0]
  if (!field) return
  sorts.value.push({ fieldId: field.id, order: 'asc' })
}

function addGroup() {
  const field = props.fields.find((item) => item.type === 'single_select' || item.type === 'multi_select') ?? props.fields[0]
  if (!field) return
  groups.value.push({ fieldId: field.id, order: 'asc' })
}

function apply() {
  const valid = conditions.value.filter((item) => item.fieldId && needsValue(item.operator) && item.value !== '')
  emit('apply', {
    filters: { logic: logic.value, conditions: valid, children: [] },
    sorts: sorts.value.filter((item) => item.fieldId),
    groups: groups.value.filter((item) => item.fieldId),
  })
}
</script>

<template>
  <el-dialog
    :model-value="true"
    title="筛选与排序"
    width="760px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <el-tabs v-model="activeTab" class="be-panel">
      <el-tab-pane label="筛选" name="filter">
        <div class="be-panel">
          <div class="be-panel__row">
            <el-radio-group v-model="logic" size="small">
              <el-radio-button value="AND">同时满足</el-radio-button>
              <el-radio-button value="OR">任一满足</el-radio-button>
            </el-radio-group>
            <div style="flex: 1" />
            <el-button size="small" :icon="Plus" @click="addCondition">添加条件</el-button>
          </div>
          <div v-for="(cond, index) in conditions" :key="index" class="be-panel__row">
            <el-select v-model="cond.fieldId" style="width: 160px">
              <el-option v-for="field in fields" :key="field.id" :label="field.name" :value="field.id" />
            </el-select>
            <el-select v-model="cond.operator" style="width: 130px">
              <el-option
                v-for="op in operatorsFor(fieldOf(cond.fieldId)?.type)"
                :key="op.value"
                :label="op.label"
                :value="op.value"
              />
            </el-select>
            <template v-if="needsValue(cond.operator)">
              <el-select
                v-if="fieldOf(cond.fieldId)?.type === 'single_select'"
                v-model="cond.value"
                style="flex: 1"
              >
                <el-option
                  v-for="opt in optionsOf(fieldOf(cond.fieldId))"
                  :key="opt"
                  :label="opt"
                  :value="opt"
                />
              </el-select>
              <el-select
                v-else-if="fieldOf(cond.fieldId)?.type === 'multi_select'"
                v-model="cond.value"
                multiple
                style="flex: 1"
              >
                <el-option
                  v-for="opt in optionsOf(fieldOf(cond.fieldId))"
                  :key="opt"
                  :label="opt"
                  :value="opt"
                />
              </el-select>
              <el-switch
                v-else-if="fieldOf(cond.fieldId)?.type === 'checkbox'"
                v-model="cond.value"
                active-value="true"
                inactive-value="false"
              />
              <el-input-number
                v-else-if="numericTypes.includes(fieldOf(cond.fieldId)?.type ?? '')"
                v-model="cond.value"
                style="flex: 1"
                :controls="false"
              />
              <el-date-picker
                v-else-if="fieldOf(cond.fieldId)?.type === 'datetime'"
                v-model="cond.value"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="flex: 1"
              />
              <el-date-picker
                v-else-if="fieldOf(cond.fieldId)?.type === 'date'"
                v-model="cond.value"
                type="date"
                value-format="YYYY-MM-DD"
                style="flex: 1"
              />
              <el-input v-else v-model="cond.value" style="flex: 1" placeholder="筛选值" />
            </template>
            <div v-else style="flex: 1" />
            <el-button :icon="Delete" text @click="conditions.splice(index, 1)" />
          </div>
          <el-empty v-if="!conditions.length" description="暂无筛选条件" :image-size="64" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="排序" name="sort">
        <div class="be-panel">
          <div class="be-panel__row">
            <div style="flex: 1" />
            <el-button size="small" :icon="Sort" @click="addSort">添加排序</el-button>
          </div>
          <div v-for="(rule, index) in sorts" :key="index" class="be-panel__row">
            <span class="be-panel__hint">{{ index + 1 }}</span>
            <el-select v-model="rule.fieldId" style="flex: 1">
              <el-option v-for="field in fields" :key="field.id" :label="field.name" :value="field.id" />
            </el-select>
            <el-radio-group v-model="rule.order" size="small">
              <el-radio-button value="asc">升序</el-radio-button>
              <el-radio-button value="desc">降序</el-radio-button>
            </el-radio-group>
            <el-button :icon="Delete" text @click="sorts.splice(index, 1)" />
          </div>
          <el-empty v-if="!sorts.length" description="暂无排序规则" :image-size="64" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分组" name="group">
        <div class="be-panel">
          <div class="be-panel__row">
            <div style="flex: 1" />
            <el-button size="small" :icon="Plus" @click="addGroup">添加分组</el-button>
          </div>
          <div v-for="(rule, index) in groups" :key="index" class="be-panel__row">
            <el-select v-model="rule.fieldId" style="flex: 1">
              <el-option v-for="field in fields" :key="field.id" :label="field.name" :value="field.id" />
            </el-select>
            <el-radio-group v-model="rule.order" size="small">
              <el-radio-button value="asc">升序</el-radio-button>
              <el-radio-button value="desc">降序</el-radio-button>
            </el-radio-group>
            <el-button :icon="Delete" text @click="groups.splice(index, 1)" />
          </div>
          <el-empty v-if="!groups.length" description="暂无分组规则" :image-size="64" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="apply">应用</el-button>
    </template>
  </el-dialog>
</template>
