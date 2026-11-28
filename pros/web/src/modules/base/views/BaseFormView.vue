<script setup lang="ts">
/**
 * 表单视图：一次填一条记录，适合「收集信息」场景（如报名、报修、需求收集）。
 *
 * 与网格视图共用同一份记录数据：
 *   - 顶部可以切换上一条 / 下一条；
 *   - 未保存时点「提交」新建一条，点「保存」更新当前这条；
 *   - 字段顺序取视图配置 form.fieldIds，没配就用全部字段。
 */
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Check, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import BaseFieldCell from '../fields/BaseFieldCell.vue'
import type { FieldMeta, RecordRow, ViewConfig } from '../types'

const props = defineProps<{
  fields: FieldMeta[]
  rows: RecordRow[]
  editable?: boolean
  viewConfig?: ViewConfig
  linkTitles?: Record<string, string>
  linkOptions?: Record<string, Array<{ id: string; title: string }>>
  projectId?: string
}>()

const emit = defineEmits<{
  (e: 'update-cell', payload: { recordId: string; fieldId: string; value: unknown }): void
  (e: 'create-record', payload: { fields: Record<string, unknown> }): void
  (e: 'open-record', recordId: string): void
  (e: 'open-record-ref', payload: { tableId: string; recordId: string; title: string }): void
}>()

/** 当前编辑的是第几条记录（-1 表示「新建」）。 */
const index = ref(-1)
const draft = ref<Record<string, unknown>>({})
const saving = ref(false)

/** 表单里显示哪些字段：优先取视图配置，否则取全部非计算字段。 */
const formFields = computed<FieldMeta[]>(() => {
  const configured = (props.viewConfig?.layout as { formFieldIds?: string[] } | undefined)?.formFieldIds
  if (Array.isArray(configured) && configured.length) {
    return configured
      .map((id) => props.fields.find((f) => f.id === id))
      .filter((f): f is FieldMeta => Boolean(f))
  }
  return props.fields.filter((f) => f.type !== 'formula' && f.type !== 'lookup' && f.type !== 'rollup')
})

const current = computed<RecordRow | undefined>(() =>
  index.value >= 0 ? props.rows[index.value] : undefined,
)

/** 记录列表变化时重置到第一条，避免越界。 */
watch(
  () => props.rows.length,
  (len) => {
    if (index.value >= len) index.value = len ? len - 1 : -1
    if (index.value < 0 && len) index.value = 0
    syncDraft()
  },
)

watch(current, syncDraft)

/** 把当前记录的值同步到草稿。 */
function syncDraft() {
  const row = current.value
  draft.value = row ? { ...(row.fields ?? {}) } : {}
}

function go(delta: number) {
  const next = index.value + delta
  if (next < 0 || next >= props.rows.length) return
  index.value = next
}

/** 字段值变更：已存在的记录直接写回，新建时只改草稿。 */
function onCellUpdate(fieldId: string, value: unknown) {
  draft.value[fieldId] = value
  const row = current.value
  if (!row) return
  emit('update-cell', { recordId: row.id, fieldId, value })
}

/** 关联记录字段的目标表 ID（未配置时用当前表兜底）。 */
function linkTargetTableOf(fieldId: string): string {
  const field = props.fields.find((item) => item.id === fieldId)
  if (!field || field.type !== 'link') return ''
  const target = field.config?.targetTableId
  return typeof target === 'string' ? target : ''
}

/** 提交：新建一条记录。 */
function submit() {
  saving.value = true
  try {
    emit('create-record', { fields: { ...draft.value } })
    draft.value = {}
    index.value = -1
    ElMessage.success('已提交')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="be-form">
    <div class="be-form__bar">
      <div class="be-form__nav">
        <el-button size="small" circle :icon="ArrowLeft" :disabled="index <= 0" @click="go(-1)" />
        <span class="be-form__counter">
          {{ current ? `第 ${index + 1} / ${rows.length} 条` : '新建记录' }}
        </span>
        <el-button
          size="small"
          circle
          :icon="ArrowRight"
          :disabled="index < 0 || index >= rows.length - 1"
          @click="go(1)"
        />
      </div>
      <el-button size="small" :icon="Plus" @click="index = -1">新建</el-button>
    </div>

    <div class="be-form__body">
      <div v-for="field in formFields" :key="field.id" class="be-form__row">
        <label class="be-form__label">
          {{ field.name }}
          <span v-if="field.required" class="be-form__required">*</span>
        </label>
        <div class="be-form__control">
          <BaseFieldCell
            :field="field"
            :model-value="draft[field.id]"
            :editable="editable"
            :link-titles="linkTitles"
            :link-options="linkOptions?.[linkTargetTableOf(field.id)] ?? []"
            :project-id="projectId"
            @update:model-value="(value: unknown) => onCellUpdate(field.id, value)"
            @open-record-ref="(payload) => emit('open-record-ref', payload)"
          />
        </div>
      </div>
      <el-empty v-if="!formFields.length" description="该视图没有可填写的字段" :image-size="60" />
    </div>

    <div class="be-form__footer">
      <el-button v-if="current" @click="emit('open-record', current.id)">查看详情</el-button>
      <el-button type="primary" :icon="Check" :loading="saving" :disabled="!editable" @click="submit">
        提交
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.be-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.be-form__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.be-form__nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.be-form__counter {
  font-size: 13px;
  color: var(--tg-text-2);
}

.be-form__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--tg-border);
  border-radius: 12px;
  background: var(--tg-surface, #fff);
}

.be-form__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.be-form__label {
  width: 132px;
  flex: none;
  padding-top: 6px;
  font-size: 13px;
  color: var(--tg-text);
}

.be-form__required {
  color: var(--tg-danger, #e53935);
}

.be-form__control {
  flex: 1;
  min-width: 0;
}

.be-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
