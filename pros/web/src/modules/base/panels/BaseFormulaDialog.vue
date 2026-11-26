<script setup lang="ts">
/**
 * 公式编辑弹窗：校验 → 预览 → 保存。
 *
 * 公式语法使用 {字段名} 引用其它字段，
 * 服务端负责解析成 AST、建立依赖图并重算历史记录。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, MagicStick } from '@element-plus/icons-vue'
import { createField, previewFormula, saveFormula, validateFormula } from '../api'
import type { FieldMeta, FormulaValidation } from '../types'

const props = defineProps<{
  projectId: string
  tableId: string
  fields: FieldMeta[]
  field?: FieldMeta
  sample?: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const expression = ref('')
const validation = ref<FormulaValidation | null>(null)
const preview = ref<FormulaValidation | null>(null)
const busy = ref(false)
const name = ref(props.field?.name ?? '')

const usableFields = computed(() => props.fields.filter((item) => item.type !== 'formula'))

function insertField(field: FieldMeta) {
  expression.value = `${expression.value}{${field.name}}`
}

async function validate() {
  if (!props.tableId) {
    validation.value = { valid: false, error: '当前多维表格还没有数据表，请先新建数据表' }
    return
  }
  if (!expression.value.trim()) {
    validation.value = { valid: false, error: '公式不能为空' }
    return
  }
  try {
    validation.value = await validateFormula(props.projectId, props.tableId, expression.value.trim())
  } catch (err) {
    validation.value = { valid: false, error: (err as Error).message }
  }
}

async function runPreview() {
  if (!props.tableId) {
    preview.value = { valid: false, error: '当前多维表格还没有数据表，请先新建数据表' }
    return
  }
  try {
    const sample: Record<string, unknown> = {}
    for (const field of usableFields.value) {
      const value = props.sample?.[field.id]
      if (value !== undefined) sample[field.name] = value
    }
    preview.value = await previewFormula(props.projectId, props.tableId, expression.value.trim(), sample)
  } catch (err) {
    preview.value = { valid: false, error: (err as Error).message }
  }
}

async function save() {
  if (!props.tableId) {
    ElMessage.warning('当前多维表格还没有数据表，请先新建数据表')
    return
  }
  const expr = expression.value.trim()
  if (!expr) {
    ElMessage.warning('公式不能为空')
    return
  }
  busy.value = true
  try {
    let fieldId = props.field?.id
    if (!fieldId) {
      const fieldName = name.value.trim()
      if (!fieldName) {
        ElMessage.warning('请填写公式字段名称')
        busy.value = false
        return
      }
      const created = await createField(props.projectId, props.tableId, {
        name: fieldName,
        type: 'formula',
        config: {},
      })
      fieldId = created.id
    }
    await saveFormula(props.projectId, fieldId, expr)
    ElMessage.success('公式已保存并完成重算')
    emit('saved')
  } catch (err) {
    ElMessage.error((err as Error).message || '公式保存失败')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="field ? `编辑公式 · ${field.name}` : '新增公式字段'"
    width="640px"
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <div class="be-panel be-formula__editor">
      <el-input
        v-if="!field"
        v-model="name"
        placeholder="公式字段名称，如「税额」"
        maxlength="40"
        show-word-limit
      />

      <el-input
        v-model="expression"
        type="textarea"
        :rows="4"
        placeholder="例如：IF({金额} > 1000, {金额} * 0.1, 0)"
      />

      <div class="be-panel__hint">点击字段插入引用：</div>
      <div class="be-chip-list">
        <span
          v-for="field in usableFields"
          :key="field.id"
          class="be-chip"
          @click="insertField(field)"
        >
          {{ field.name }}
        </span>
      </div>

      <div class="be-panel__row">
        <el-button :icon="Check" @click="validate">校验</el-button>
        <el-button :icon="MagicStick" @click="runPreview">预览</el-button>
      </div>

      <div v-if="validation" class="be-formula__result" :class="{ 'is-error': !validation.valid }">
        <template v-if="validation.valid">
          公式合法
          <template v-if="validation.dependencies?.length">
            ，依赖字段：{{ validation.dependencies.join('、') }}
          </template>
        </template>
        <template v-else>{{ validation.error }}</template>
      </div>

      <div v-if="preview" class="be-formula__result" :class="{ 'is-error': !preview.valid }">
        <template v-if="preview.valid">样例结果：{{ preview.value }}</template>
        <template v-else>{{ preview.error }}</template>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="busy" @click="save">保存公式</el-button>
    </template>
  </el-dialog>
</template>
