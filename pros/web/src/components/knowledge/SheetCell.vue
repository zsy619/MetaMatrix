<script setup lang="ts">
/** 多维表格单元格：按字段类型渲染展示 / 编辑两种形态。 */
import { computed, nextTick, ref, watch } from 'vue'
import type { SheetCellValue, SheetField } from './sheetModel'
import { cellText } from './sheetModel'

const props = defineProps<{
  field: SheetField
  value: SheetCellValue | undefined
  /** 详情抽屉里常驻编辑态 */
  alwaysEdit?: boolean
}>()
const emit = defineEmits<{ update: [value: SheetCellValue] }>()

const editing = ref(false)
const draft = ref<SheetCellValue | undefined>(undefined)
const textInput = ref<HTMLInputElement | null>(null)
const textArea = ref<HTMLTextAreaElement | null>(null)

const display = computed(() => cellText(props.value))

watch(
  () => props.value,
  (v) => {
    if (!editing.value) draft.value = v
  },
  { immediate: true },
)

function startEdit() {
  if (props.alwaysEdit) return
  editing.value = true
  draft.value = props.value
  void nextTick(() => {
    textInput.value?.focus()
    textArea.value?.focus()
  })
}

function commit() {
  if (!editing.value) return
  editing.value = false
  emit('update', normalize(draft.value))
}

function cancel() {
  editing.value = false
  draft.value = props.value
}

function normalize(v: SheetCellValue | undefined): SheetCellValue {
  if (props.field.type === 'number' || props.field.type === 'progress' || props.field.type === 'rating') {
    const n = Number(v ?? 0)
    return Number.isNaN(n) ? 0 : n
  }
  if (props.field.type === 'multiSelect' || props.field.type === 'person') {
    return Array.isArray(v) ? v : v ? [String(v)] : []
  }
  if (props.field.type === 'checkbox') return !!v
  return v === null || v === undefined ? '' : String(v)
}

/** 展示态：不同类型不同排版。 */
function displayValue() {
  const v = props.value
  switch (props.field.type) {
    case 'checkbox':
      return ''
    case 'progress':
      return `${Math.round(Number(v ?? 0))}%`
    case 'rating':
      return Number(v ?? 0) > 0 ? '★'.repeat(Math.round(Number(v ?? 0))) : ''
    case 'multiSelect':
    case 'person': {
      const arr = Array.isArray(v) ? v : []
      if (!arr.length) return ''
      return arr.map((x) => x).join('、')
    }
    default:
      return cellText(v)
  }
}
</script>

<template>
  <div class="sheet-cell" :class="{ 'is-editing': editing || alwaysEdit }">
    <!-- 编辑态 -->
    <template v-if="editing || alwaysEdit">
      <input
        v-if="field.type === 'text' || field.type === 'link'"
        ref="textInput"
        class="sheet-cell__input"
        :value="cellText(draft)"
        :placeholder="field.type === 'link' ? 'https://' : '输入内容'"
        @input="draft = ($event.target as HTMLInputElement).value"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />

      <textarea
        v-else-if="field.type === 'longtext'"
        ref="textArea"
        class="sheet-cell__textarea"
        :value="cellText(draft)"
        rows="3"
        @input="draft = ($event.target as HTMLTextAreaElement).value"
        @blur="commit"
        @keydown.esc.prevent="cancel"
      />

      <input
        v-else-if="field.type === 'number'"
        ref="textInput"
        class="sheet-cell__input"
        type="number"
        :value="Number(draft ?? 0)"
        @input="draft = Number(($event.target as HTMLInputElement).value)"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />

      <el-date-picker
        v-else-if="field.type === 'date'"
        class="sheet-cell__picker"
        type="date"
        size="small"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        :model-value="cellText(draft) || null"
        @update:model-value="(v: string | null) => { draft = v ?? '' }"
        @blur="commit"
      />

      <el-select
        v-else-if="field.type === 'select'"
        class="sheet-cell__select"
        size="small"
        filterable
        allow-create
        default-first-option
        placeholder="单选"
        :model-value="cellText(draft)"
        @update:model-value="(v: string) => { draft = v; commit() }"
      >
        <el-option v-for="opt in field.options ?? []" :key="opt" :label="opt" :value="opt" />
      </el-select>

      <el-select
        v-else-if="field.type === 'multiSelect' || field.type === 'person'"
        class="sheet-cell__select"
        size="small"
        multiple
        collapse-tags
        collapse-tags-tooltip
        filterable
        allow-create
        default-first-option
        :placeholder="field.type === 'person' ? '选择人员' : '多选'"
        :model-value="Array.isArray(draft) ? draft : []"
        @update:model-value="(v: string[]) => { draft = v; commit() }"
      >
        <el-option v-for="opt in field.options ?? []" :key="opt" :label="opt" :value="opt" />
      </el-select>

      <el-checkbox
        v-else-if="field.type === 'checkbox'"
        :model-value="!!draft"
        @change="(v: boolean | string | number) => { draft = !!v; commit() }"
      />

      <template v-else-if="field.type === 'progress'">
        <el-slider
          class="sheet-cell__slider"
          size="small"
          :min="0"
          :max="100"
          :model-value="Number(draft ?? 0)"
          @update:model-value="(v: number) => { draft = v }"
          @change="(v: number | number[]) => { draft = Array.isArray(v) ? v[0] : v; commit() }"
        />
      </template>

      <el-rate
        v-else-if="field.type === 'rating'"
        size="small"
        :max="5"
        :model-value="Number(draft ?? 0)"
        @change="(v: number) => { draft = v; commit() }"
      />

      <template v-else>
        <span class="sheet-cell__text">{{ displayValue() }}</span>
      </template>
    </template>

    <!-- 展示态 -->
    <template v-else>
      <el-checkbox v-if="field.type === 'checkbox'" :model-value="!!value" @click.stop="startEdit" />
      <span v-else-if="field.type === 'progress'" class="sheet-cell__progress">
        <span class="sheet-cell__bar">
          <span class="sheet-cell__bar-fill" :style="{ width: `${Number(value ?? 0)}%` }" />
        </span>
        <span class="sheet-cell__num">{{ Math.round(Number(value ?? 0)) }}%</span>
      </span>
      <span v-else-if="field.type === 'rating'" class="sheet-cell__rating">{{ displayValue() }}</span>
      <span
        v-else-if="field.type === 'link' && display"
        class="sheet-cell__link"
        @click.stop="startEdit"
      >{{ display }}</span>
      <span
        v-else-if="(field.type === 'multiSelect' || field.type === 'person') && Array.isArray(value) && value.length"
        class="sheet-cell__tags"
      >
        <span v-for="tag in value" :key="tag" class="sheet-cell__tag">{{ tag }}</span>
      </span>
      <span v-else class="sheet-cell__text" @click.stop="startEdit">{{ displayValue() || ' ' }}</span>
    </template>
  </div>
</template>

<style scoped>
.sheet-cell {
  min-height: 28px;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--mm-text, #1d2129);
  overflow: hidden;
}
.sheet-cell__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}
.sheet-cell__input,
.sheet-cell__textarea {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  resize: vertical;
}
.sheet-cell__picker,
.sheet-cell__select {
  width: 100%;
}
.sheet-cell__slider {
  width: 100%;
  margin: 0;
}
.sheet-cell__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.sheet-cell__bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--mm-hover, #f2f3f5);
  overflow: hidden;
}
.sheet-cell__bar-fill {
  display: block;
  height: 100%;
  background: var(--mm-blue, #3370ff);
}
.sheet-cell__num {
  font-size: 11px;
  color: var(--mm-muted, #86909c);
}
.sheet-cell__rating {
  color: #f5a623;
  letter-spacing: 1px;
}
.sheet-cell__link {
  color: var(--mm-blue, #3370ff);
  text-decoration: underline;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet-cell__tags {
  display: flex;
  gap: 4px;
  overflow: hidden;
}
.sheet-cell__tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--mm-hover, #f2f3f5);
  font-size: 11px;
  white-space: nowrap;
}
</style>
