<script setup lang="ts">
/** 多维表格（飞书 Bitable）：表格 / 看板 / 画廊三种视图，字段类型化单元格，筛选排序分组。 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getNodeData, saveNodeData } from '../../api/knowledge'
import SheetCell from './SheetCell.vue'
import SheetExtras from './SheetExtras.vue'
import SheetCalendarView from './SheetCalendarView.vue'
import ShareDialog from './ShareDialog.vue'
import {
  cellText,
  FIELD_TYPES,
  FILTER_OPS,
  createField,
  createRow,
  createView,
  emptySheet,
  fieldMeta,
  filterRows,
  groupRows,
  migrateSheet,
  sortRows,
  uid,
  type SheetCellValue,
  type SheetData,
  type SheetField,
  type SheetFieldType,
  type SheetRow,
  type SheetViewType,
} from './sheetModel'

const props = defineProps<{ projectId: string; nodeId: string; title?: string }>()

const data = ref<SheetData>(emptySheet())
const activeViewId = ref('')
const keyword = ref('')
const selected = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const fieldPanel = ref(false)
const detailRowId = ref('')
const shareVisible = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const view = computed(
  () => data.value.views.find((v) => v.id === activeViewId.value) ?? data.value.views[0],
)
const fields = computed(() => data.value.fields)
const groupField = computed(
  () => fields.value.find((f) => f.id === view.value?.groupBy) ?? null,
)
const rows = computed(() => {
  if (!view.value) return data.value.rows
  const filtered = filterRows(data.value.rows, view.value.filters, keyword.value)
  return sortRows(filtered, view.value.sortBy, view.value.sortOrder)
})
const groups = computed(() => groupRows(rows.value, groupField.value))
const detailRow = computed(() => data.value.rows.find((r) => r.id === detailRowId.value) ?? null)
const primaryField = computed(
  () => fields.value.find((f) => f.type === 'text') ?? fields.value[0] ?? null,
)

async function load() {
  loading.value = true
  try {
    const res = await getNodeData(props.projectId, props.nodeId)
    const sheet = migrateSheet(res.data)
    data.value = sheet
    activeViewId.value = sheet.views[0]?.id ?? ''
    selected.value = []
    dirty.value = false
  } catch {
    ElMessage.error('加载表格失败')
  } finally {
    loading.value = false
  }
}

function scheduleSave() {
  dirty.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void save(), 900)
}

async function save() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saving.value = true
  try {
    await saveNodeData(props.projectId, props.nodeId, 'sheet', data.value)
    dirty.value = false
  } catch {
    ElMessage.error('保存表格失败')
  } finally {
    saving.value = false
  }
}

// —— 记录 ——

function addRow(groupKey?: string) {
  const row = createRow(fields.value)
  if (groupKey && groupField.value) {
    row.cells[groupField.value.id] = groupField.value.options?.includes(groupKey)
      ? groupKey
      : groupKey
  }
  data.value.rows.push(row)
  scheduleSave()
}

function deleteRow(id: string) {
  data.value.rows = data.value.rows.filter((r) => r.id !== id)
  selected.value = selected.value.filter((x) => x !== id)
  if (detailRowId.value === id) detailRowId.value = ''
  scheduleSave()
}

function duplicateRow(id: string) {
  const src = data.value.rows.find((r) => r.id === id)
  if (!src) return
  const copy: SheetRow = { id: uid('r'), cells: { ...src.cells } }
  data.value.rows.splice(data.value.rows.indexOf(src) + 1, 0, copy)
  scheduleSave()
}

function setCell(rowId: string, fieldId: string, value: unknown) {
  const row = data.value.rows.find((r) => r.id === rowId)
  if (!row) return
  row.cells[fieldId] = value as never
  scheduleSave()
}

function toggleSelected(id: string, checked: boolean) {
  selected.value = checked ? [...new Set([...selected.value, id])] : selected.value.filter((x) => x !== id)
}

const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((r) => selected.value.includes(r.id)),
)
function toggleSelectAll(checked: boolean) {
  selected.value = checked ? rows.value.map((r) => r.id) : []
}

async function deleteSelected() {
  const count = selected.value.length
  if (!count) return
  await ElMessageBox.confirm(`确定删除选中的 ${count} 条记录？`, '删除记录', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  data.value.rows = data.value.rows.filter((r) => !selected.value.includes(r.id))
  selected.value = []
  scheduleSave()
}

// —— 字段 ——

function addField(type: SheetFieldType) {
  const field = createField(type)
  data.value.fields.push(field)
  scheduleSave()
  fieldPanel.value = true
}

function updateField(_field: SheetField) {
  scheduleSave()
}

function removeField(field: SheetField) {
  data.value.fields = data.value.fields.filter((f) => f.id !== field.id)
  for (const row of data.value.rows) delete row.cells[field.id]
  if (view.value?.sortBy === field.id) view.value.sortBy = null
  if (view.value?.groupBy === field.id) view.value.groupBy = null
  scheduleSave()
}

function moveField(field: SheetField, dir: -1 | 1) {
  const list = data.value.fields
  const i = list.findIndex((f) => f.id === field.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const [item] = list.splice(i, 1)
  list.splice(j, 0, item)
  scheduleSave()
}

/** 导入 CSV：把列与行追加到当前表格。 */
function applyCsv(payload: { fields: SheetData['fields']; rows: SheetData['rows'] }) {
  const fields = [...data.value.fields]
  const rows = [...data.value.rows]
  const idMap = new Map<string, string>()
  for (const field of payload.fields) {
    const existing = fields.find((f) => f.name === field.name)
    if (existing) {
      idMap.set(field.id, existing.id)
      continue
    }
    fields.push(field)
    idMap.set(field.id, field.id)
  }
  for (const row of payload.rows) {
    const cells: Record<string, SheetCellValue> = {}
    for (const [sourceId, value] of Object.entries(row.cells)) {
      const targetId = idMap.get(sourceId)
      if (targetId) cells[targetId] = value
    }
    rows.push({ id: row.id, cells })
  }
  data.value.fields = fields
  data.value.rows = rows
  scheduleSave()
}

// —— 视图 ——

function addView(type: SheetViewType) {
  const name =
    type === 'grid'
      ? '表格视图'
      : type === 'kanban'
        ? '看板视图'
        : type === 'gallery'
          ? '画廊视图'
          : '日历视图'
  const v = createView(type, `${name} ${data.value.views.length + 1}`)
  data.value.views.push(v)
  activeViewId.value = v.id
  scheduleSave()
}

async function removeView(id: string) {
  if (data.value.views.length <= 1) {
    ElMessage.warning('至少保留一个视图')
    return
  }
  const v = data.value.views.find((x) => x.id === id)
  if (!v) return
  await ElMessageBox.confirm(`确定删除视图「${v.name}」？`, '删除视图', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  data.value.views = data.value.views.filter((x) => x.id !== id)
  if (activeViewId.value === id) activeViewId.value = data.value.views[0].id
  scheduleSave()
}

// —— 筛选 / 排序 / 分组 ——

function addFilter() {
  if (!view.value) return
  const fieldId = fields.value[0]?.id ?? ''
  view.value.filters.push({ fieldId, op: 'contains', value: '' })
  scheduleSave()
}

function removeFilter(index: number) {
  if (!view.value) return
  view.value.filters.splice(index, 1)
  scheduleSave()
}

function setSort(fieldId: string | null) {
  if (!view.value) return
  view.value.sortBy = fieldId
  scheduleSave()
}

function setGroup(fieldId: string | null) {
  if (!view.value) return
  view.value.groupBy = fieldId
  scheduleSave()
}


async function onFieldCommand(cmd: string, field: SheetField) {
  if (cmd === 'left') return moveField(field, -1)
  if (cmd === 'right') return moveField(field, 1)
  if (cmd === 'delete') return removeField(field)
  if (cmd === 'rename') {
    const { value } = await ElMessageBox.prompt('字段名称', '重命名字段', {
      inputValue: field.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    field.name = value || field.name
    updateField(field)
  }
}

function onTypeChange(field: SheetField, type: SheetFieldType) {
  const meta = fieldMeta(type)
  field.type = type
  if (meta.options && !field.options?.length) field.options = ['选项 1', '选项 2']
  updateField(field)
}

watch(
  () => props.nodeId,
  () => void load(),
)
onMounted(() => void load())
</script>

<template>
  <section class="sheet">
    <header class="sheet__bar">
      <div class="sheet__left">
        <span class="sheet__icon">📊</span>
        <span class="sheet__name">{{ props.title || '多维表格' }}</span>
      </div>

      <nav class="sheet__views">
        <button
          v-for="v in data.views"
          :key="v.id"
          type="button"
          class="sheet__chip"
          :class="{ 'is-active': v.id === view?.id }"
          @click="activeViewId = v.id"
          @contextmenu.prevent="removeView(v.id)"
        >
          {{ v.name }}
        </button>
        <el-dropdown trigger="click" @command="(t: SheetViewType) => addView(t)">
          <button type="button" class="sheet__chip sheet__chip--add">+</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="grid">表格视图</el-dropdown-item>
              <el-dropdown-item command="kanban">看板视图</el-dropdown-item>
              <el-dropdown-item command="gallery">画廊视图</el-dropdown-item>
              <el-dropdown-item command="calendar">日历视图</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>

      <div class="sheet__tools">
        <el-input
          v-model="keyword"
          class="sheet__search"
          size="small"
          clearable
          placeholder="搜索记录"
        />
        <el-popover placement="bottom-end" :width="320" trigger="click">
          <template #reference>
            <el-button size="small">
              筛选<template v-if="view?.filters.length"> ({{ view.filters.length }})</template>
            </el-button>
          </template>
          <div class="sheet__filters">
            <div v-for="(f, i) in view?.filters ?? []" :key="i" class="sheet__filter">
              <el-select v-model="f.fieldId" size="small" placeholder="字段">
                <el-option v-for="fd in fields" :key="fd.id" :label="fd.name" :value="fd.id" />
              </el-select>
              <el-select v-model="f.op" size="small">
                <el-option v-for="op in FILTER_OPS" :key="op.op" :label="op.label" :value="op.op" />
              </el-select>
              <el-input
                v-if="f.op !== 'empty' && f.op !== 'notEmpty'"
                v-model="f.value"
                size="small"
                placeholder="值"
                @change="scheduleSave"
              />
              <el-button link size="small" @click="removeFilter(i)">✕</el-button>
            </div>
            <el-button link size="small" @click="addFilter">+ 添加筛选条件</el-button>
          </div>
        </el-popover>

        <el-popover placement="bottom-end" :width="240" trigger="click">
          <template #reference>
            <el-button size="small">
              排序<template v-if="view?.sortBy"> ({{ fields.find(f => f.id === view?.sortBy)?.name }})</template>
            </el-button>
          </template>
          <div class="sheet__sort">
            <el-select
              :model-value="view?.sortBy ?? ''"
              size="small"
              clearable
              placeholder="不排序"
              @update:model-value="(v: string) => setSort(v || null)"
            >
              <el-option v-for="fd in fields" :key="fd.id" :label="fd.name" :value="fd.id" />
            </el-select>
            <el-radio-group
              :model-value="view?.sortOrder ?? 'asc'"
              size="small"
              @update:model-value="(v: any) => { if (view) { view.sortOrder = v; scheduleSave() } }"
            >
              <el-radio-button value="asc">升序</el-radio-button>
              <el-radio-button value="desc">降序</el-radio-button>
            </el-radio-group>
          </div>
        </el-popover>

        <el-popover placement="bottom-end" :width="240" trigger="click">
          <template #reference>
            <el-button size="small">
              分组<template v-if="groupField"> ({{ groupField.name }})</template>
            </el-button>
          </template>
          <div class="sheet__sort">
            <el-select
              :model-value="view?.groupBy ?? ''"
              size="small"
              clearable
              placeholder="不分组"
              @update:model-value="(v: string) => setGroup(v || null)"
            >
              <el-option v-for="fd in fields" :key="fd.id" :label="fd.name" :value="fd.id" />
            </el-select>
          </div>
        </el-popover>

        <SheetExtras :data="data" :view="view" @import-csv="applyCsv" />
        <el-button size="small" @click="fieldPanel = true">字段</el-button>
        <el-button size="small" @click="shareVisible = true">分享</el-button>
        <span v-if="dirty" class="sheet__dirty">未保存</span>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </header>

    <ShareDialog
      :project-id="props.projectId"
      :node-id="props.nodeId"
      kind="sheet"
      :visible="shareVisible"
      @close="shareVisible = false"
    />

    <div v-if="selected.length" class="sheet__batch">
      已选 {{ selected.length }} 条
      <el-button link size="small" type="danger" @click="deleteSelected">删除</el-button>
      <el-button link size="small" @click="selected = []">取消选择</el-button>
    </div>

    <div v-if="loading" class="sheet__empty">加载中…</div>

    <!-- 日历视图 -->
    <div v-else-if="view?.type === 'calendar'">
      <SheetCalendarView :data="data" :view="view" />
    </div>

    <!-- 表格视图 -->
    <div v-else-if="view?.type === 'grid'" class="sheet__grid-wrap">
      <table class="sheet-grid">
        <thead>
          <tr>
            <th class="sheet-grid__check">
              <el-checkbox
                :model-value="allSelected"
                @change="(v: boolean | string | number) => toggleSelectAll(!!v)"
              />
            </th>
            <th
              v-for="fd in fields"
              :key="fd.id"
              class="sheet-grid__head"
              :style="{ width: `${fd.width ?? 140}px` }"
            >
              <div class="sheet-grid__head-inner">
                <span class="sheet-grid__head-icon">{{ fieldMeta(fd.type).icon }}</span>
                <span class="sheet-grid__head-name">{{ fd.name }}</span>
                <el-dropdown trigger="click" @command="(cmd: string) => onFieldCommand(cmd, fd)">
                  <span class="sheet-grid__head-more">⋯</span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名字段</el-dropdown-item>
                      <el-dropdown-item command="left">左移</el-dropdown-item>
                      <el-dropdown-item command="right">右移</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>删除字段</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </th>
            <th class="sheet-grid__add">
              <el-dropdown trigger="click" @command="(t: SheetFieldType) => addField(t)">
                <span class="sheet-grid__add-btn">+</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="m in FIELD_TYPES" :key="m.type" :command="m.type">
                      {{ m.icon }} {{ m.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in groups" :key="group.key || 'all'">
            <tr v-if="groupField" class="sheet-grid__group">
              <td :colspan="fields.length + 2">
                <span class="sheet-grid__group-label">{{ group.label }}</span>
                <span class="sheet-grid__group-count">{{ group.rows.length }}</span>
              </td>
            </tr>
            <tr v-for="row in group.rows" :key="row.id" class="sheet-grid__row">
              <td class="sheet-grid__check">
                <el-checkbox
                  :model-value="selected.includes(row.id)"
                  @change="(v: boolean | string | number) => toggleSelected(row.id, !!v)"
                />
              </td>
              <td v-for="fd in fields" :key="fd.id" class="sheet-grid__cell">
                <SheetCell
                  :field="fd"
                  :value="row.cells[fd.id]"
                  @update="(v) => setCell(row.id, fd.id, v)"
                />
              </td>
              <td class="sheet-grid__ops">
                <el-dropdown trigger="click">
                  <span class="sheet-grid__ops-btn">⋯</span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="detailRowId = row.id">展开记录</el-dropdown-item>
                      <el-dropdown-item @click="duplicateRow(row.id)">复制记录</el-dropdown-item>
                      <el-dropdown-item divided @click="deleteRow(row.id)">删除记录</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <button type="button" class="sheet__add-row" @click="addRow()">+ 新增记录</button>
    </div>

    <!-- 看板视图 -->
    <div v-else-if="view?.type === 'kanban'" class="sheet__kanban">
      <div v-if="!groupField" class="sheet__empty">
        看板视图需要一个分组字段，在右上角「分组」里选择单选字段。
      </div>
      <div v-else class="sheet__kanban-board">
        <div v-for="opt in groupField.options ?? []" :key="opt" class="sheet__kanban-col">
          <header class="sheet__kanban-head">
            <span class="sheet__kanban-title">{{ opt }}</span>
            <span class="sheet__kanban-count">
              {{ rows.filter((r) => r.cells[groupField!.id] === opt).length }}
            </span>
          </header>
          <div class="sheet__kanban-cards">
            <article
              v-for="row in rows.filter((r) => r.cells[groupField!.id] === opt)"
              :key="row.id"
              class="sheet__card"
              @click="detailRowId = row.id"
            >
              <div class="sheet__card-title">
                {{ primaryField ? cellText(row.cells[primaryField.id]) : '' }}
              </div>
              <div class="sheet__card-meta">
                <span
                  v-for="fd in fields.filter((f) => f.id !== primaryField?.id && f.type !== 'longtext')"
                  :key="fd.id"
                  class="sheet__card-chip"
                >
                  {{ fd.name }}：{{ cellText(row.cells[fd.id]) }}
                </span>
              </div>
            </article>
            <button type="button" class="sheet__kanban-add" @click="addRow(opt)">+ 新增记录</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 画廊视图 -->
    <div v-else class="sheet__gallery">
      <article
        v-for="row in rows"
        :key="row.id"
        class="sheet__gallery-card"
        @click="detailRowId = row.id"
      >
        <div class="sheet__gallery-title">
          {{ primaryField ? cellText(row.cells[primaryField.id]) : '未命名' }}
        </div>
        <div v-for="fd in fields.filter((f) => f.id !== primaryField?.id)" :key="fd.id" class="sheet__gallery-line">
          <span class="sheet__gallery-label">{{ fd.name }}</span>
          <span class="sheet__gallery-value">{{ cellText(row.cells[fd.id]) }}</span>
        </div>
      </article>
    </div>

    <!-- 字段管理 -->
    <el-drawer v-model="fieldPanel" title="字段管理" size="420px">
      <div class="sheet__field-list">
        <div v-for="fd in fields" :key="fd.id" class="sheet__field">
          <div class="sheet__field-head">
            <span class="sheet__field-icon">{{ fieldMeta(fd.type).icon }}</span>
            <el-input v-model="fd.name" size="small" @change="updateField(fd)" />
            <el-select
              :model-value="fd.type"
              size="small"
              class="sheet__field-type"
              @update:model-value="(t: SheetFieldType) => onTypeChange(fd, t)"
            >
              <el-option v-for="m in FIELD_TYPES" :key="m.type" :label="m.label" :value="m.type" />
            </el-select>
          </div>
          <div v-if="fieldMeta(fd.type).options" class="sheet__field-options">
            <el-select
              v-model="fd.options"
              multiple
              filterable
              allow-create
              default-first-option
              size="small"
              placeholder="添加选项"
              @change="updateField(fd)"
            />
          </div>
          <div class="sheet__field-ops">
            <el-button link size="small" @click="moveField(fd, -1)">左移</el-button>
            <el-button link size="small" @click="moveField(fd, 1)">右移</el-button>
            <el-button link size="small" type="danger" @click="removeField(fd)">删除</el-button>
          </div>
        </div>
      </div>
      <el-dropdown trigger="click" @command="(t: SheetFieldType) => addField(t)">
        <el-button type="primary" plain style="width: 100%">+ 添加字段</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="m in FIELD_TYPES" :key="m.type" :command="m.type">
              {{ m.icon }} {{ m.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </el-drawer>

    <!-- 记录详情 -->
    <el-drawer
      :model-value="!!detailRow"
      title="记录详情"
      size="420px"
      @update:model-value="(v: boolean) => { if (!v) detailRowId = '' }"
    >
      <div v-if="detailRow" class="sheet__detail">
        <div v-for="fd in fields" :key="fd.id" class="sheet__detail-row">
          <span class="sheet__detail-label">{{ fieldMeta(fd.type).icon }} {{ fd.name }}</span>
          <SheetCell
            :field="fd"
            :value="detailRow.cells[fd.id]"
            always-edit
            @update="(v) => setCell(detailRow!.id, fd.id, v)"
          />
        </div>
        <el-button type="danger" plain @click="deleteRow(detailRow.id)">删除记录</el-button>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.sheet {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
}
.sheet__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  flex-wrap: wrap;
}
.sheet__left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sheet__icon {
  font-size: 16px;
}
.sheet__name {
  font-size: 15px;
  font-weight: 600;
}
.sheet__views {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sheet__chip {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--mm-text, #1d2129);
  transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease,
    color 0.18s ease;
}
.sheet__chip:hover {
  background: rgba(255, 255, 255, 0.72);
  border-color: var(--glass-border, rgba(255, 255, 255, 0.7));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
}
.sheet__chip.is-active {
  background: rgba(51, 112, 255, 0.12);
  border-color: rgba(51, 112, 255, 0.28);
  color: var(--mm-blue, #3370ff);
}
.sheet__chip--add {
  font-size: 15px;
  line-height: 1;
}
.sheet__tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet__search {
  width: 160px;
}
.sheet__dirty {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.sheet__batch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: rgba(51, 112, 255, 0.08);
  font-size: 13px;
}
.sheet__filters,
.sheet__sort {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet__filter {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sheet__filter .el-select {
  width: 110px;
}
.sheet__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
}
.sheet__grid-wrap {
  flex: 1;
  overflow: auto;
  margin: 0 16px 16px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.sheet-grid {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
  font-size: 13px;
}
.sheet-grid th,
.sheet-grid td {
  border-right: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  padding: 0;
  text-align: left;
  vertical-align: middle;
}
.sheet-grid thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px)) saturate(var(--glass-saturate, 165%));
  box-shadow: inset 0 -1px 0 var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.sheet-grid__head-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  font-weight: 600;
  font-size: 12px;
}
.sheet-grid__head-icon {
  font-size: 12px;
}
.sheet-grid__head-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet-grid__head-more {
  padding: 0 2px;
  cursor: pointer;
  color: var(--mm-muted, #86909c);
  border-radius: 4px;
  transition: background-color 0.16s ease, color 0.16s ease;
}
.sheet-grid__head-more:hover {
  background: rgba(255, 255, 255, 0.78);
  color: var(--mm-blue, #3370ff);
}
.sheet-grid__check {
  width: 40px;
  text-align: center;
}
.sheet-grid__add {
  width: 44px;
  text-align: center;
}
.sheet-grid__add-btn {
  display: inline-block;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--mm-muted, #86909c);
  border-radius: 6px;
  transition: background-color 0.16s ease, color 0.16s ease;
}
.sheet-grid__add-btn:hover {
  background: rgba(255, 255, 255, 0.78);
  color: var(--mm-blue, #3370ff);
}
.sheet-grid__cell {
  padding: 4px 8px;
  height: 36px;
}
.sheet-grid__ops {
  width: 40px;
  text-align: center;
}
.sheet-grid__ops-btn {
  padding: 2px 6px;
  cursor: pointer;
  color: var(--mm-muted, #86909c);
  border-radius: 6px;
  transition: background-color 0.16s ease, color 0.16s ease;
}
.sheet-grid__ops-btn:hover {
  background: rgba(255, 255, 255, 0.78);
  color: var(--mm-blue, #3370ff);
}
.sheet-grid__row:hover {
  background: rgba(255, 255, 255, 0.58);
}
.sheet-grid__group td {
  background: rgba(255, 255, 255, 0.52);
  padding: 5px 10px;
}
.sheet-grid__group-label {
  font-weight: 600;
  font-size: 12px;
}
.sheet-grid__group-count {
  margin-left: 6px;
  color: var(--mm-muted, #86909c);
  font-size: 11px;
}
.sheet__add-row {
  margin: 8px 12px;
  padding: 6px 12px;
  border: 1px dashed var(--mm-line, #e5e6eb);
  border-radius: 6px;
  background: none;
  color: var(--mm-muted, #86909c);
  cursor: pointer;
  font-size: 13px;
}
.sheet__kanban {
  flex: 1;
  overflow: auto;
}
.sheet__kanban-board {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  min-height: 100%;
  align-items: flex-start;
}
.sheet__kanban-col {
  width: 260px;
  flex: none;
  background: var(--mm-page, #f7f7f7);
  border-radius: 8px;
  padding: 8px;
}
.sheet__kanban-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 13px;
  font-weight: 600;
}
.sheet__kanban-count {
  color: var(--mm-muted, #86909c);
  font-size: 11px;
}
.sheet__kanban-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet__card {
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
}
.sheet__card:hover {
  border-color: var(--mm-blue, #3370ff);
}
.sheet__card-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.sheet__card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sheet__card-chip {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--mm-page, #f7f7f7);
  font-size: 11px;
  color: var(--mm-muted, #86909c);
}
.sheet__kanban-add {
  padding: 6px;
  border: 1px dashed var(--mm-line, #e5e6eb);
  border-radius: 6px;
  background: none;
  color: var(--mm-muted, #86909c);
  cursor: pointer;
  font-size: 12px;
}
.sheet__gallery {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 16px;
  overflow: auto;
  align-content: start;
}
.sheet__gallery-card {
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
}
.sheet__gallery-card:hover {
  border-color: var(--mm-blue, #3370ff);
}
.sheet__gallery-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.sheet__gallery-line {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 2px 0;
}
.sheet__gallery-label {
  color: var(--mm-muted, #86909c);
  min-width: 72px;
}
.sheet__gallery-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet__field-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 16px;
}
.sheet__field {
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  padding: 10px;
}
.sheet__field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet__field-type {
  width: 110px;
}
.sheet__field-options {
  margin-top: 8px;
}
.sheet__field-ops {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
.sheet__detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.sheet__detail-label {
  width: 110px;
  flex: none;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.sheet__detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
