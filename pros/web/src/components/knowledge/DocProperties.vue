<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import * as knowledgeApiV5 from '../../api/knowledge_v5'
import type { DocProperties } from '../../api/knowledge'
import type { FieldDef } from '../../api/knowledge_v5'

const props = defineProps<{ documentId: string }>()
const emit = defineEmits<{ changed: [props: DocProperties] }>()

const props_ = ref<DocProperties | null>(null)
const saving = ref(false)
const status = ref<'draft' | 'published' | 'archived'>('draft')
const tags = ref('')
const summary = ref('')
const coverColor = ref('')
const dueAt = ref('')
const members = ref('')
const priority = ref('normal')
const milestone = ref('')
const sprint = ref('')
const number = ref(0)

/** 自定义字段定义与取值。 */
const fields = ref<FieldDef[]>([])
const fieldValues = ref<Record<string, unknown>>({})
const newKey = ref('')

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

const TYPE_LABELS: Record<string, string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  select: '单选',
  multi: '多选',
  user: '人员',
  checkbox: '勾选',
  formula: '公式',
}

/** 公式字段的计算结果。 */
const computedValues = computed(() => props_.value?.computed ?? {})

async function load() {
  try {
    const data = await knowledgeApi.getDocProperties(props.documentId)
    props_.value = data
    status.value = data.status
    tags.value = data.tags
    summary.value = data.summary
    coverColor.value = data.coverColor
    dueAt.value = data.dueAt ? new Date(data.dueAt).toISOString().slice(0, 10) : ''
    members.value = data.members ?? ''
    priority.value = data.priority ?? 'normal'
    milestone.value = data.milestone ?? ''
    sprint.value = data.sprint ?? ''
    number.value = data.number ?? 0
    fields.value = [...(data.fields ?? [])]
    fieldValues.value = { ...(data.fieldValues ?? {}) }
  } catch {
    props_.value = null
  }
}

/** 新增自定义字段：key 由标签自动生成，避免手输重复。 */
function addField() {
  const label = newKey.value.trim()
  if (!label) {
    ElMessage.warning('请输入字段名')
    return
  }
  const base =
    label
      .replace(/[^a-zA-Z0-9一-龥]/g, '')
      .toLowerCase() || `field${fields.value.length + 1}`
  let key = base
  let i = 2
  while (fields.value.some((f) => f.key === key)) {
    key = `${base}${i++}`
  }
  fields.value.push({ key, label, type: 'text', required: false, order: fields.value.length + 1 })
  newKey.value = ''
}

function removeField(key: string) {
  fields.value = fields.value.filter((f) => f.key !== key)
  const next = { ...fieldValues.value }
  delete next[key]
  fieldValues.value = next
}

function moveField(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= fields.value.length) return
  const list = [...fields.value]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  list.forEach((f, i) => (f.order = i + 1))
  fields.value = list
}

function fieldValue(key: string) {
  const value = fieldValues.value[key]
  return value === undefined || value === null ? '' : String(value)
}

function setFieldValue(key: string, value: string) {
  fieldValues.value = { ...fieldValues.value, [key]: value }
}

async function save() {
  saving.value = true
  try {
    const updated = await knowledgeApi.updateDocProperties(props.documentId, {
      status: status.value,
      tags: tags.value,
      summary: summary.value,
      coverColor: coverColor.value,
      dueAt: dueAt.value ? new Date(dueAt.value).toISOString() : null,
      clearDueAt: !dueAt.value,
      members: members.value,
      priority: priority.value,
      milestone: milestone.value,
      sprint: sprint.value,
      number: number.value,
    })
    props_.value = updated
    // 自定义字段单独保存：定义与取值走 fields 接口。
    const saved = await knowledgeApiV5.updateDocFields(
      props.documentId,
      fields.value,
      fieldValues.value,
    )
    props_.value = saved
    emit('changed', saved)
    ElMessage.success('属性已保存')
  } catch (err) {
    ElMessage.error(`属性保存失败：${(err as Error)?.message ?? '未知错误'}`)
  } finally {
    saving.value = false
  }
}

watch(() => props.documentId, () => void load())
onMounted(load)
</script>

<template>
  <section class="doc-props">
    <div class="doc-props__title">页面属性</div>
    <label class="doc-props__field">
      <span>状态</span>
      <el-select v-model="status" size="small">
        <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
    </label>
    <label class="doc-props__field">
      <span>负责人</span>
      <el-input :model-value="props_?.reviewerUserId || ''" size="small" disabled placeholder="暂未指定" />
    </label>
    <label class="doc-props__field">
      <span>截止日期</span>
      <el-input v-model="dueAt" size="small" type="date" />
    </label>
    <label class="doc-props__field">
      <span>标签</span>
      <el-input v-model="tags" size="small" placeholder="用逗号分隔，如：会议,纪要" />
    </label>
    <label class="doc-props__field">
      <span>摘要</span>
      <el-input v-model="summary" size="small" type="textarea" :rows="3" maxlength="255" show-word-limit />
    </label>
    <label class="doc-props__field">
      <span>参与人</span>
      <el-input v-model="members" size="small" placeholder="用户 ID，逗号分隔" />
    </label>
    <label class="doc-props__field">
      <span>优先级</span>
      <el-select v-model="priority" size="small">
        <el-option label="低" value="low" />
        <el-option label="普通" value="normal" />
        <el-option label="高" value="high" />
        <el-option label="紧急" value="urgent" />
      </el-select>
    </label>
    <label class="doc-props__field">
      <span>里程碑</span>
      <el-input v-model="milestone" size="small" placeholder="如：V1 上线" />
    </label>
    <label class="doc-props__field">
      <span>迭代周期</span>
      <el-input v-model="sprint" size="small" placeholder="如：Sprint 7" />
    </label>
    <label class="doc-props__field">
      <span>数值</span>
      <el-input-number v-model="number" size="small" :controls="false" />
    </label>
    <label class="doc-props__field">
      <span>封面色</span>
      <el-color-picker v-model="coverColor" size="small" />
    </label>

    <div class="doc-props__section">自定义字段</div>
    <div v-if="!fields.length" class="doc-props__hint">还没有自定义字段，可添加编号、预算、剩余天数等。</div>
    <div v-for="(field, index) in fields" :key="field.key" class="doc-props__custom">
      <div class="doc-props__custom-head">
        <el-input v-model="field.label" size="small" style="width: 110px" />
        <el-select v-model="field.type" size="small" style="width: 92px">
          <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-checkbox v-model="field.required" size="small">必填</el-checkbox>
        <el-tooltip content="上移" placement="top">
          <el-button size="small" text :disabled="index === 0" @click="moveField(index, -1)">↑</el-button>
        </el-tooltip>
        <el-tooltip content="下移" placement="top">
          <el-button size="small" text :disabled="index === fields.length - 1" @click="moveField(index, 1)">↓</el-button>
        </el-tooltip>
        <el-tooltip content="在面板中隐藏" placement="top">
          <el-button size="small" text @click="field.hidden = !field.hidden">
            {{ field.hidden ? '显示' : '隐藏' }}
          </el-button>
        </el-tooltip>
        <el-button size="small" text type="danger" @click="removeField(field.key)">删除</el-button>
      </div>
      <div v-if="field.type === 'formula'" class="doc-props__value">
        <el-input
          v-model="field.formula"
          size="small"
          placeholder="公式：如 {budget} - {cost}、remainingDays({dueAt})"
        />
        <span class="doc-props__computed">= {{ computedValues[field.key] ?? '—' }}</span>
      </div>
      <div v-else class="doc-props__value">
        <el-input
          :model-value="fieldValue(field.key)"
          size="small"
          :type="field.type === 'number' ? 'number' : 'text'"
          :placeholder="field.required ? '必填' : '填写'"
          @update:model-value="(v: string) => setFieldValue(field.key, v)"
        />
      </div>
    </div>
    <div class="doc-props__add">
      <el-input v-model="newKey" size="small" placeholder="新增字段名，如：预算" @keyup.enter="addField" />
      <el-button size="small" @click="addField">添加</el-button>
    </div>

    <el-button size="small" type="primary" :loading="saving" @click="save">保存属性</el-button>
  </section>
</template>

<style scoped>
.doc-props { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.doc-props__title { font-size: 12px; font-weight: 600; color: var(--mm-muted, #86909c); }
.doc-props__field { display: flex; flex-direction: column; gap: 4px; }
.doc-props__field > span { font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-props__section {
  margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--mm-line, #f2f3f5);
  font-size: 12px; font-weight: 600; color: var(--mm-muted, #86909c);
}
.doc-props__hint { font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-props__custom {
  display: flex; flex-direction: column; gap: 6px; padding: 8px;
  border: 1px solid var(--mm-line, #f2f3f5); border-radius: 6px;
}
.doc-props__custom-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.doc-props__value { display: flex; align-items: center; gap: 6px; }
.doc-props__computed { font-size: 12px; color: var(--mm-blue, #1677ff); white-space: nowrap; }
.doc-props__add { display: flex; gap: 6px; align-items: center; }
</style>
