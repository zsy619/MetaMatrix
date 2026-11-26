<script setup lang="ts">
/**
 * Grid 视图：基于 VXE Table 的网格适配器。
 *
 * 业务层只依赖 GridAdapter 接口（setColumns/setRows/updateCell），
 * 换网格组件时不需要改 Field / Record / View 层逻辑。
 */
import { computed, ref, watch } from 'vue'
import { VxeGrid } from 'vxe-table'
import 'vxe-table/dist/style.css'
import { Plus } from '@element-plus/icons-vue'
import BaseFieldCell from '../fields/BaseFieldCell.vue'
import { fieldTypeColor, fieldTypeIcon } from '../fields/icons'
import { buildPasteCells, cellToText } from '../clipboard'
import type { FieldMeta, RecordRow } from '../types'

const props = defineProps<{
  fields: FieldMeta[]
  rows: RecordRow[]
  loading?: boolean
  fieldWidths?: Record<string, number>
  /** 视图里隐藏的字段。 */
  hiddenFieldIds?: string[]
  editable?: boolean
  docTitles?: Record<string, string>
  docOptions?: Array<{ id: string; title: string }>
}>()

const emit = defineEmits<{
  (e: 'update-cell', payload: { recordId: string; fieldId: string; value: unknown }): void
  (e: 'open-record', recordId: string): void
  (e: 'add-row'): void
  (e: 'selection-change', ids: string[]): void
  (e: 'open-doc', nodeId: string): void
}>()

// —— 键盘导航与剪贴板（对标飞书多维表格 / Excel）——

/** 当前聚焦单元格。 */
const focus = ref<{ rowId: string; fieldId: string } | null>(null)
/** 编辑信号：{key, seq}，seq 变化时命中单元格进入编辑。 */
const editSignal = ref<{ key: string; seq: number }>({ key: '', seq: 0 })

function focusCell(rowId: string, fieldId: string) {
  focus.value = { rowId, fieldId }
}

function focusIndex(): { row: number; col: number } {
  const row = Math.max(0, props.rows.findIndex((item) => item.id === focus.value?.rowId))
  const col = Math.max(0, visibleFields.value.findIndex((item) => item.id === focus.value?.fieldId))
  return { row, col }
}

function moveFocus(deltaRow: number, deltaCol: number) {
  if (!visibleFields.value.length || !props.rows.length) return
  const { row, col } = focusIndex()
  const nextRow = Math.min(props.rows.length - 1, Math.max(0, row + deltaRow))
  const nextCol = Math.min(visibleFields.value.length - 1, Math.max(0, col + deltaCol))
  const nextField = visibleFields.value[nextCol]
  const nextRecord = props.rows[nextRow]
  if (!nextField || !nextRecord) return
  focus.value = { rowId: nextRecord.id, fieldId: nextField.id }
}

/** 把单元格值转成复制用的纯文本。 */
function cellText(row: RecordRow, fieldId: string): string {
  return cellToText(row.fields?.[fieldId])
}

const copyBuffer = ref('')

function onKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey
  if (meta && event.key.toLowerCase() === 'c') {
    if (!focus.value) return
    const row = props.rows.find((item) => item.id === focus.value?.rowId)
    if (!row) return
    copyBuffer.value = cellText(row, focus.value.fieldId)
    event.preventDefault()
    void navigator.clipboard?.writeText(copyBuffer.value).catch(() => undefined)
    return
  }
  if (meta && event.key.toLowerCase() === 'v') {
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        if (text) applyPaste(text)
      })
      .catch(() => undefined)
    return
  }
  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      moveFocus(-1, 0)
      break
    case 'ArrowDown':
      event.preventDefault()
      moveFocus(1, 0)
      break
    case 'ArrowLeft':
      event.preventDefault()
      moveFocus(0, -1)
      break
    case 'ArrowRight':
      event.preventDefault()
      moveFocus(0, 1)
      break
    case 'Enter':
    case 'F2': {
      if (!focus.value) return
      event.preventDefault()
      editSignal.value = {
        key: `${focus.value.rowId}:${focus.value.fieldId}`,
        seq: editSignal.value.seq + 1,
      }
      break
    }
    case 'Escape':
      focus.value = null
      break
    case 'Delete':
    case 'Backspace': {
      if (!focus.value) return
      const row = props.rows.find((item) => item.id === focus.value?.rowId)
      if (!row) return
      event.preventDefault()
      emit('update-cell', { recordId: row.id, fieldId: focus.value.fieldId, value: null })
      break
    }
    default:
      break
  }
}

/** 粘贴：以聚焦单元格为起点，按行 × 列写入（TSV）。 */
function applyPaste(text: string) {
  if (!focus.value) return
  const { row, col } = focusIndex()
  const cells = buildPasteCells({
    text,
    rows: props.rows,
    fields: visibleFields.value,
    startRow: row,
    startCol: col,
    isReadonly: (fieldId) => fieldOf(fieldId)?.type === 'formula',
  })
  for (const cell of cells) {
    emit('update-cell', { recordId: cell.recordId, fieldId: cell.fieldId, value: cell.value })
  }
}

function onCopy(event: ClipboardEvent) {
  if (!copyBuffer.value) return
  event.clipboardData?.setData('text/plain', copyBuffer.value)
  event.preventDefault()
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!text) return
  event.preventDefault()
  applyPaste(text)
}

const visibleFields = computed(() => {
  const hidden = new Set(props.hiddenFieldIds ?? [])
  return props.fields.filter((field) => !hidden.has(field.id))
})

/** 行选择：用自绘复选框，样式与项目其它列表保持一致。 */
const selected = ref<string[]>([])

watch(
  () => props.rows.map((row) => row.id).join(','),
  () => {
    const ids = new Set(props.rows.map((row) => row.id))
    selected.value = selected.value.filter((id) => ids.has(id))
  },
)

function isSelected(recordId: string) {
  return selected.value.includes(recordId)
}

function toggleRow(recordId: string, checked: boolean) {
  selected.value = checked
    ? [...new Set([...selected.value, recordId])]
    : selected.value.filter((id) => id !== recordId)
  emit('selection-change', selected.value)
}

function toggleAll(checked: boolean) {
  selected.value = checked ? props.rows.map((row) => row.id) : []
  emit('selection-change', selected.value)
}

const allChecked = computed(() => props.rows.length > 0 && selected.value.length === props.rows.length)
const someChecked = computed(() => selected.value.length > 0 && !allChecked.value)

const columns = computed(() => [
  {
    field: '__select',
    width: 44,
    fixed: 'left' as const,
    resizable: true,
    slots: { default: 'select', header: 'selectHeader' },
  },
  ...visibleFields.value.map((field, index) => ({
    field: field.id,
    title: field.name,
    width: props.fieldWidths?.[field.id],
    minWidth: props.fieldWidths?.[field.id] ?? (index === 0 ? 200 : 140),
    resizable: true,
    sortable: false,
    fixed: index === 0 ? ('left' as const) : undefined,
    slots: { default: 'cell', header: 'fieldHeader' },
  })),
])

const gridData = computed(() =>
  props.rows.map((row) => ({
    ...row,
    __id: row.id,
  })),
)

function fieldOf(fieldId: string): FieldMeta | undefined {
  return props.fields.find((item) => item.id === fieldId)
}

const fallbackField: FieldMeta = {
  id: '',
  name: '',
  type: 'text',
  config: {},
  required: false,
  isPrimary: false,
  sortOrder: 0,
  version: 1,
}

function fieldFor(fieldId: string): FieldMeta {
  return fieldOf(fieldId) ?? { ...fallbackField, id: fieldId, name: fieldId }
}

function onCellUpdate(recordId: string, fieldId: string, value: unknown) {
  emit('update-cell', { recordId, fieldId, value })
}

</script>

<template>
  <div
    class="base-grid"
    v-loading="loading"
    element-loading-text="加载中"
    tabindex="0"
    @keydown="onKeydown"
    @copy="onCopy"
    @paste="onPaste"
  >
    <vxe-grid
      :columns="columns"
      :data="gridData"
      border="none"
      size="small"
      :row-config="{ isHover: true, isCurrent: true }"
      :scroll-y="{ enabled: true, gt: 40 }"
      height="100%"
    >
      <template #selectHeader>
        <el-checkbox
          :model-value="allChecked"
          :indeterminate="someChecked"
          @change="(checked: boolean) => toggleAll(checked)"
        />
      </template>
      <!-- 列头：字段名 + 类型图标（飞书多维表格同款，一眼看出每列是什么类型） -->
      <template #fieldHeader="{ column }">
        <span class="base-grid__head">
          <el-icon
            class="base-grid__head-icon"
            :style="{ color: fieldTypeColor(fieldFor(column.field).type) }"
          >
            <component :is="fieldTypeIcon(fieldFor(column.field).type)" />
          </el-icon>
          <span class="base-grid__head-title">{{ column.title }}</span>
        </span>
      </template>
      <template #select="{ row }">
        <el-checkbox
          :model-value="isSelected(row.id)"
          @change="(checked: boolean) => toggleRow(row.id, checked)"
        />
      </template>
      <template #cell="{ row, column }">
        <div
          class="base-grid__cell"
          @click.stop="focusCell(row.id, column.field)"
          @dblclick.stop="focusCell(row.id, column.field)"
        >
          <BaseFieldCell
            :field="fieldFor(column.field)"
            :model-value="row.fields?.[column.field]"
            :editable="editable"
            :row-id="row.id"
            :focused="focus?.rowId === row.id && focus?.fieldId === column.field"
            :edit-signal="editSignal"
            :doc-titles="docTitles"
            :doc-options="docOptions"
            @update:model-value="(value) => onCellUpdate(row.id, column.field, value)"
            @request-detail="emit('open-record', row.id)"
            @open-doc="(nodeId) => emit('open-doc', nodeId)"
          />
        </div>
      </template>
    </vxe-grid>
    <div class="base-grid__footer">
      <el-button text size="small" @click="emit('add-row')">
        <el-icon><Plus /></el-icon>新增记录
      </el-button>
      <span class="base-grid__count">共 {{ rows.length }} 行</span>
    </div>
  </div>
</template>

<style scoped>
.base-grid {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  outline: none;
}

.base-grid__cell {
  min-height: 24px;
  width: 100%;
}

/* 列头：类型图标 + 字段名 */
.base-grid__head {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.base-grid__head-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.base-grid__head-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-grid__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--tg-border, #e6e9ef);
  font-size: 12px;
  color: var(--tg-text-2, #64748b);
}
</style>
