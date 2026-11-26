<script setup lang="ts">
/**
 * 多维表格主视图（Base Engine）。
 *
 * 结构分层：
 *   View 层（本组件）——表 / 视图 / 查询状态的编排；
 *   Grid 层（BaseGrid）——网格渲染；
 *   Field 层（BaseFieldCell）——单元格渲染与编辑；
 *   服务端——筛选 / 排序 / 分组 / 公式 / 权限 / 审计的唯一事实来源。
 *
 * 与富文本编辑器的融合路径：
 *   1) 本表可一键导出为 Markdown 表格，粘贴进文档即完成「数据 → 文档」单向同步；
 *   2) 公式字段与文档内变量共用同一套命名，未来可扩展为双向引用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Calendar,
  CopyDocument,
  DataBoard,
  Delete,
  Download,
  Filter,
  Grid,
  InfoFilled,
  MagicStick,
  MoreFilled,
  Picture,
  Plus,
  Search,
  Setting,
  Sort,
  Tickets,
  Upload,
} from '@element-plus/icons-vue'
import BaseGrid from './grid/BaseGrid.vue'
import BaseBoardViews from './views/BaseBoardViews.vue'
import BaseBatchDialog from './panels/BaseBatchDialog.vue'
import BaseFieldManager from './panels/BaseFieldManager.vue'
import BaseFormulaDialog from './panels/BaseFormulaDialog.vue'
import BaseImportDialog from './panels/BaseImportDialog.vue'
import BaseQueryPanel from './panels/BaseQueryPanel.vue'
import BaseRecordDrawer from './panels/BaseRecordDrawer.vue'
import BaseViewSettings from './panels/BaseViewSettings.vue'
import { BaseRealtime, type BaseEvent } from './realtime'
import { getKnowledgeTree, getNodeData } from '../../api/knowledge'
import { migrateSheet, type SheetData } from '../../components/knowledge/sheetModel'
import {
  createRecord,
  createTable,
  createView,
  deleteRecord,
  ensureBase,
  listFieldTypes,
  listTables,
  listViews,
  queryRecords,
  updateRecord,
  updateView,
} from './api'
import type {
  BaseInfo,
  BaseTable,
  BaseView,
  FieldMeta,
  FieldTypeDefinition,
  FilterGroup,
  GroupRule,
  RecordRow,
  SortRule,
  ViewType,
} from './types'
import './base.css'

const props = defineProps<{
  projectId: string
  nodeId: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'open-doc', nodeId: string): void
}>()

const PAGE_SIZE = 200

const base = ref<BaseInfo | null>(null)
const tables = ref<BaseTable[]>([])
const activeTableId = ref('')
const views = ref<BaseView[]>([])
const activeViewId = ref('')
const fields = ref<FieldMeta[]>([])
const rows = ref<RecordRow[]>([])
const definitions = ref<FieldTypeDefinition[]>([])
const total = ref(0)
const cursor = ref<string | undefined>(undefined)
const loading = ref(false)
const keyword = ref('')
const selectedIds = ref<string[]>([])
const sideOpen = ref(true)

const filters = ref<FilterGroup>({ logic: 'AND', conditions: [], children: [] })
const sorts = ref<SortRule[]>([])
const groups = ref<GroupRule[]>([])

const showFieldManager = ref(false)
const showQueryPanel = ref(false)
const showFormula = ref(false)
const showExport = ref(false)
const showImport = ref(false)
const showBatch = ref(false)
const showViewSettings = ref(false)
const formulaField = ref<FieldMeta | undefined>(undefined)
const activeRecord = ref<RecordRow | undefined>(undefined)
const exportFormat = ref<'markdown' | 'csv'>('markdown')
const exportText = ref('')

/** 关联文档字段的标题映射与可选项。 */
const docTitles = ref<Record<string, string>>({})
const docOptions = ref<Array<{ id: string; title: string }>>([])
/** 迁移失败时的只读降级数据。 */
const legacy = ref<SheetData | null>(null)
const legacyReason = ref('')

const realtimeStatus = ref<'connecting' | 'open' | 'closed'>('closed')
let realtime: BaseRealtime | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const activeTable = computed(() => tables.value.find((item) => item.id === activeTableId.value))
const activeView = computed(() => views.value.find((item) => item.id === activeViewId.value))
const viewType = computed<ViewType>(() => activeView.value?.type ?? 'grid')
const boardType = computed<'kanban' | 'calendar' | 'gallery'>(() =>
  viewType.value === 'grid' ? 'kanban' : (viewType.value as 'kanban' | 'calendar' | 'gallery'),
)
const hasFilter = computed(() => filters.value.conditions.length > 0)
const hasSort = computed(() => sorts.value.length > 0)
const groupFieldId = computed(() => groups.value[0]?.fieldId)
const primaryField = computed(() => fields.value.find((item) => item.isPrimary) ?? fields.value[0])
const canEdit = computed(() => true)

const viewIcon = (type: ViewType) =>
  type === 'grid' ? Grid : type === 'kanban' ? DataBoard : type === 'calendar' ? Calendar : Picture

// —— 加载链路 ——

async function bootstrap() {
  loading.value = true
  try {
    base.value = await ensureBase(props.projectId, props.nodeId, props.title)
    await loadDocIndex()
    // 迁移失败不挡门：回落到旧 JSONB 的只读模式。
    if (base.value.migrated?.startsWith('failed')) {
      legacyReason.value = base.value.migrated.slice('failed:'.length)
      await loadLegacyFallback()
      return
    }
    definitions.value = await listFieldTypes(props.projectId)
    tables.value = await listTables(props.projectId, base.value.id)
    if (!activeTableId.value || !tables.value.some((item) => item.id === activeTableId.value)) {
      activeTableId.value = tables.value[0]?.id ?? ''
    }
    if (activeTableId.value) await loadTable()
  } catch (err) {
    ElMessage.error((err as Error).message || '多维表格加载失败')
  } finally {
    loading.value = false
  }
}

/** 关联文档字段：拉取知识库目录，得到节点 ID → 标题。 */
async function loadDocIndex() {
  try {
    const tree = await getKnowledgeTree(props.projectId)
    const titles: Record<string, string> = {}
    const options: Array<{ id: string; title: string }> = []
    for (const node of tree ?? []) {
      titles[node.id] = node.title
      if (node.nodeType === 'doc' || node.nodeType === 'canvas') {
        options.push({ id: node.id, title: node.title })
      }
    }
    docTitles.value = titles
    docOptions.value = options
  } catch {
    docTitles.value = {}
    docOptions.value = []
  }
}

/** 只读降级：读取旧 JSONB 表格。 */
async function loadLegacyFallback() {
  try {
    const raw = await getNodeData(props.projectId, props.nodeId)
    legacy.value = migrateSheet(raw?.data ?? (raw as unknown))
  } catch (err) {
    ElMessage.error((err as Error).message || '旧版表格读取失败')
  }
}

async function loadTable() {
  if (!activeTableId.value) return
  views.value = await listViews(props.projectId, activeTableId.value)
  if (!activeViewId.value || !views.value.some((item) => item.id === activeViewId.value)) {
    const fallback = views.value.find((item) => item.isDefault) ?? views.value[0]
    activeViewId.value = fallback?.id ?? ''
  }
  applyViewConfig()
  await runQuery()
}

function applyViewConfig() {
  const config = activeView.value?.config ?? {}
  filters.value = normalizeFilters(config.filters)
  sorts.value = config.sorts ?? []
  groups.value = config.groups ?? []
}

/** 列顺序：主字段永远第一，其余按 sortOrder。 */
function sortFields(list: FieldMeta[]): FieldMeta[] {
  return [...list].sort(
    (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.sortOrder - b.sortOrder,
  )
}

/** 兼容历史迁移数据：旧版把筛选存成条件数组。 */
function normalizeFilters(raw: unknown): FilterGroup {
  if (Array.isArray(raw)) {
    return { logic: 'AND', conditions: raw as FilterGroup['conditions'], children: [] }
  }
  if (raw && typeof raw === 'object') {
    const group = raw as Partial<FilterGroup>
    return {
      logic: group.logic ?? 'AND',
      conditions: group.conditions ?? [],
      children: group.children ?? [],
    }
  }
  return { logic: 'AND', conditions: [], children: [] }
}

async function runQuery(append = false) {
  if (!activeTableId.value) return
  loading.value = true
  try {
    const result = await queryRecords(props.projectId, {
      tableId: activeTableId.value,
      viewId: activeViewId.value || undefined,
      filters: filters.value,
      sorts: sorts.value,
      groups: groups.value,
      pageSize: PAGE_SIZE,
      cursor: append ? cursor.value : undefined,
      keyword: keyword.value.trim() || undefined,
    })
    rows.value = append ? [...rows.value, ...result.records] : result.records
    fields.value = result.fields?.length ? sortFields(result.fields) : fields.value
    total.value = result.total
    cursor.value = result.page?.nextCursor
  } catch (err) {
    ElMessage.error((err as Error).message || '查询失败')
  } finally {
    loading.value = false
  }
}

// —— 视图 / 表切换 ——

async function switchTable(tableId: string) {
  if (tableId === activeTableId.value) return
  activeTableId.value = tableId
  activeViewId.value = ''
  await loadTable()
}

async function switchView(view: BaseView) {
  activeViewId.value = view.id
  applyViewConfig()
  await runQuery()
}

async function addTable() {
  try {
    const { value } = await ElMessageBox.prompt('新表名称', '新建数据表', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (input) => (input && input.trim() ? true : '请输入表名'),
    })
    const table = await createTable(props.projectId, base.value!.id, (value ?? '').trim())
    tables.value = await listTables(props.projectId, base.value!.id)
    activeTableId.value = table.id
    activeViewId.value = ''
    await loadTable()
    ElMessage.success('数据表已创建')
  } catch {
    /* 取消 */
  }
}

/**
 * 确保存在一张可用的数据表。
 * 所有表级接口都依赖 tableId；Base 为空（刚创建、还没有表）时直接调接口会拼出
 * `/tables//fields` 这种空路径并拿到 404。这里统一兜底：没有就建一张默认表。
 */
async function ensureTable(): Promise<string> {
  if (activeTableId.value) return activeTableId.value
  if (!base.value) return ''
  try {
    const table = await createTable(props.projectId, base.value.id, '数据表')
    // 补一张默认网格视图，否则「视图配置」等视图级入口没有落点。
    await createView(props.projectId, table.id, '表格视图', 'grid', {}).catch(() => undefined)
    tables.value = await listTables(props.projectId, base.value.id)
    activeTableId.value = table.id
    activeViewId.value = ''
    await loadTable()
    ElMessage.success('已创建默认数据表')
    return table.id
  } catch (err) {
    ElMessage.error((err as Error).message || '数据表创建失败')
    return ''
  }
}

/** 打开字段管理：先保证有表。 */
async function openFieldManager() {
  if (!(await ensureTable())) return
  showFieldManager.value = true
}

/** 打开公式面板：先保证有表。 */
async function openFormula() {
  if (!(await ensureTable())) return
  formulaField.value = undefined
  showFormula.value = true
}

/** 打开导入面板：先保证有表。 */
async function openImport() {
  if (!(await ensureTable())) return
  showImport.value = true
}

async function addView() {
  if (!activeTableId.value) return
  try {
    const { value } = await ElMessageBox.prompt('视图名称', '新建视图', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (input) => (input && input.trim() ? true : '请输入视图名'),
    })
    const view = await createView(props.projectId, activeTableId.value, (value ?? '').trim(), 'grid', {
      filters: filters.value,
      sorts: sorts.value,
      groups: groups.value,
    })
    views.value = await listViews(props.projectId, activeTableId.value)
    activeViewId.value = view.id
    await runQuery()
    ElMessage.success('视图已创建')
  } catch {
    /* 取消 */
  }
}

// —— 单元格写入（乐观更新 + 乐观锁） ——

/** 同一条记录的写入串行化：避免批量粘贴时版本号互相打架。 */
const writeQueue = new Map<string, Promise<void>>()

async function onCellUpdate(payload: { recordId: string; fieldId: string; value: unknown }) {
  const previous = writeQueue.get(payload.recordId) ?? Promise.resolve()
  const next = previous.then(() => writeCell(payload)).catch(() => undefined)
  writeQueue.set(payload.recordId, next)
  await next
}

async function writeCell(payload: { recordId: string; fieldId: string; value: unknown }) {
  const row = rows.value.find((item) => item.id === payload.recordId)
  if (!row) return
  const previous = row.fields[payload.fieldId]
  const version = row.version
  row.fields = { ...row.fields, [payload.fieldId]: payload.value }
  try {
    const saved = await updateRecord(props.projectId, payload.recordId, { [payload.fieldId]: payload.value }, version)
    Object.assign(row, saved)
  } catch (err) {
    row.fields[payload.fieldId] = previous
    const status = (err as { status?: number }).status
    if (status === 409) {
      try {
        await ElMessageBox.confirm('这条记录已被他人修改，重新载入最新值？', '版本冲突', {
          confirmButtonText: '重新载入',
          cancelButtonText: '保留我的输入',
          type: 'warning',
        })
        await runQuery()
      } catch {
        /* 保留输入 */
      }
    } else {
      ElMessage.error((err as Error).message || '保存失败')
    }
  }
}

async function onAddRow() {
  if (!(await ensureTable())) return
  try {
    const row = await createRecord(props.projectId, activeTableId.value, {})
    rows.value = [row, ...rows.value]
    total.value += 1
    ElMessage.success('已新增记录')
  } catch (err) {
    ElMessage.error((err as Error).message || '新增失败')
  }
}

function onOpenRecord(recordId: string) {
  activeRecord.value = rows.value.find((item) => item.id === recordId)
}

async function onDeleteRecord(recordId: string) {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除这条记录？', '删除记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteRecord(props.projectId, recordId)
    rows.value = rows.value.filter((item) => item.id !== recordId)
    total.value = Math.max(0, total.value - 1)
    activeRecord.value = undefined
    ElMessage.success('记录已删除')
  } catch (err) {
    ElMessage.error((err as Error).message || '删除失败')
  }
}

// —— 筛选 / 排序 ——

async function applyQuery(payload: { filters: FilterGroup; sorts: SortRule[]; groups: GroupRule[] }) {
  filters.value = payload.filters
  sorts.value = payload.sorts
  groups.value = payload.groups
  showQueryPanel.value = false
  await runQuery()
  await persistViewConfig()
}

async function persistViewConfig() {
  const view = activeView.value
  if (!view) return
  try {
    await updateView(props.projectId, view.id, {
      config: { ...view.config, filters: filters.value, sorts: sorts.value, groups: groups.value },
      version: view.version,
    })
    views.value = await listViews(props.projectId, activeTableId.value)
  } catch {
    /* 视图配置保存失败不打断查询 */
  }
}

function clearQuery() {
  filters.value = { logic: 'AND', conditions: [], children: [] }
  sorts.value = []
  groups.value = []
  void runQuery()
}

// —— 视图配置 ——

const hiddenFieldIds = computed(() => {
  const visibility = activeView.value?.config?.fieldVisibility ?? {}
  return Object.entries(visibility)
    .filter(([, visible]) => visible === false)
    .map(([id]) => id)
})

async function saveViewSettings(payload: { name: string; config: Record<string, unknown> }) {
  const view = activeView.value
  if (!view) return
  try {
    await updateView(props.projectId, view.id, {
      name: payload.name,
      config: payload.config as BaseView['config'],
      version: view.version,
    })
    views.value = await listViews(props.projectId, activeTableId.value)
    showViewSettings.value = false
    ElMessage.success('视图配置已保存')
  } catch (err) {
    ElMessage.error((err as Error).message || '视图配置保存失败')
  }
}

async function onImported() {
  showImport.value = false
  await runQuery()
}

async function onBatchDone() {
  showBatch.value = false
  selectedIds.value = []
  await runQuery()
}

// —— 导出（与富文本融合的关键路径） ——

function cellText(row: RecordRow, field: FieldMeta) {
  const value = row.fields?.[field.id]
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}

function buildExportText(format: 'markdown' | 'csv') {
  const cols = fields.value
  if (format === 'markdown') {
    const head = `| ${cols.map((f) => f.name).join(' | ')} |`
    const sep = `| ${cols.map(() => '---').join(' | ')} |`
    const body = rows.value.map((row) => `| ${cols.map((f) => cellText(row, f).replace(/\|/g, '\\|')).join(' | ')} |`)
    return [head, sep, ...body].join('\n')
  }
  const escape = (text: string) => `"${text.replace(/"/g, '""')}"`
  const head = cols.map((f) => escape(f.name)).join(',')
  const body = rows.value.map((row) => cols.map((f) => escape(cellText(row, f))).join(','))
  return [head, ...body].join('\n')
}

function openExport() {
  exportFormat.value = 'markdown'
  exportText.value = buildExportText('markdown')
  showExport.value = true
}

function refreshExportText() {
  exportText.value = buildExportText(exportFormat.value)
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(exportText.value)
    ElMessage.success('已复制，可直接粘贴到文档中')
  } catch {
    ElMessage.warning('复制失败，请手动选择文本')
  }
}

function downloadExport() {
  const ext = exportFormat.value === 'markdown' ? 'md' : 'csv'
  const mime = exportFormat.value === 'markdown' ? 'text/markdown' : 'text/csv'
  const blob = new Blob([exportText.value], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${activeTable.value?.name ?? 'base'}.${ext}`
  link.click()
  URL.revokeObjectURL(url)
}

// —— 实时协同 ——

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void runQuery(), 400)
}

function onRealtimeEvent(event: BaseEvent) {
  if (event.tableId && event.tableId !== activeTableId.value) return
  scheduleRefresh()
}

function startRealtime() {
  realtime?.stop()
  realtime = new BaseRealtime({
    projectId: props.projectId,
    onEvent: onRealtimeEvent,
    onStatus: (status) => {
      realtimeStatus.value = status
    },
  })
  realtime.start()
}

watch(
  () => props.nodeId,
  () => {
    activeTableId.value = ''
    activeViewId.value = ''
    void bootstrap()
  },
)

watch(keyword, () => {
  void runQuery()
})

onMounted(() => {
  void bootstrap()
  startRealtime()
})

onBeforeUnmount(() => {
  realtime?.stop()
  realtime = null
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<template>
  <div class="be-shell" :class="{ 'is-loading': loading }">
    <header class="be-header">
      <div class="be-header__title">
        <el-icon><Tickets /></el-icon>
        <span class="be-header__name">{{ activeTable?.name || base?.name || title || '多维表格' }}</span>
        <span v-if="base?.migrated?.startsWith('legacy_sheet')" class="be-header__sub">已从旧版表格迁移</span>
      </div>
      <el-select
        v-if="tables.length > 1"
        :model-value="activeTableId"
        size="small"
        style="width: 160px"
        @change="switchTable"
      >
        <el-option v-for="table in tables" :key="table.id" :label="table.name" :value="table.id" />
      </el-select>
      <div class="be-header__spacer" />
      <span class="be-status" :class="`is-${realtimeStatus}`">
        <span class="be-status__dot" />
        {{ realtimeStatus === 'open' ? '实时同步中' : realtimeStatus === 'connecting' ? '连接中' : '离线' }}
      </span>
      <el-dropdown trigger="click">
        <el-button :icon="MoreFilled" circle size="small" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="Plus" @click="addTable">新建数据表</el-dropdown-item>
            <el-dropdown-item :icon="Tickets" @click="addView">新建视图</el-dropdown-item>
            <el-dropdown-item :icon="Download" divided @click="openExport">导出数据</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="显示 / 隐藏信息面板" placement="bottom">
        <el-button :icon="InfoFilled" circle size="small" @click="sideOpen = !sideOpen" />
      </el-tooltip>
    </header>

    <div class="be-toolbar">
      <el-input
        v-model="keyword"
        class="be-toolbar__search"
        size="small"
        placeholder="搜索记录"
        clearable
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <!-- 查询组 -->
      <div class="be-btngroup">
        <el-button size="small" :icon="Filter" :class="{ 'is-active': hasFilter }" @click="showQueryPanel = true">
          筛选
        </el-button>
        <el-button size="small" :icon="Sort" :class="{ 'is-active': hasSort }" @click="showQueryPanel = true">
          排序
        </el-button>
        <el-button
          size="small"
          :icon="Delete"
          :disabled="!hasFilter && !hasSort"
          @click="clearQuery"
        >
          重置
        </el-button>
      </div>
      <!-- 结构组 -->
      <div class="be-btngroup">
        <el-button size="small" :icon="Grid" @click="openFieldManager">字段</el-button>
        <el-button size="small" :icon="MagicStick" @click="openFormula">
          公式
        </el-button>
        <el-button
          size="small"
          :icon="Setting"
          :disabled="!activeView"
          @click="showViewSettings = true"
        >
          视图配置
        </el-button>
      </div>
      <!-- 数据组 -->
      <div class="be-btngroup">
        <el-button size="small" :icon="Download" @click="openExport">导出</el-button>
        <el-button size="small" :icon="Upload" @click="openImport">导入</el-button>
      </div>
      <div class="be-header__spacer" />
      <el-button size="small" type="primary" :icon="Plus" @click="onAddRow">新增记录</el-button>
      <span class="be-toolbar__count">共 {{ total }} 条</span>
    </div>

    <div v-if="views.length" class="be-views">
      <button
        v-for="view in views"
        :key="view.id"
        class="be-views__item"
        :class="{ 'is-active': view.id === activeViewId }"
        @click="switchView(view)"
      >
        <el-icon><component :is="viewIcon(view.type)" /></el-icon>
        {{ view.name }}
      </button>
    </div>

    <div class="be-body">
      <div class="be-body__main">
        <div v-if="legacy" class="be-legacy">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            :title="`迁移到新版表格失败，已进入只读模式：${legacyReason}`"
            description="旧版数据仍完整保留。请联系管理员修复后重新打开；在此之前可以导出旧数据。"
          />
          <div class="be-legacy__table">
            <table>
              <thead>
                <tr>
                  <th v-for="field in legacy.fields" :key="field.id">{{ field.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in legacy.rows" :key="row.id">
                  <td v-for="field in legacy.fields" :key="field.id">{{ row.cells?.[field.id] ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <BaseGrid
          v-else-if="viewType === 'grid'"
          class="be-grid"
          :fields="fields"
          :rows="rows"
          :loading="loading"
          :editable="canEdit"
          :field-widths="activeView?.config?.fieldWidths"
          :hidden-field-ids="hiddenFieldIds"
          :doc-titles="docTitles"
          :doc-options="docOptions"
          @update-cell="onCellUpdate"
          @open-record="onOpenRecord"
          @add-row="onAddRow"
          @selection-change="(ids) => (selectedIds = ids)"
          @open-doc="(nodeId) => emit('open-doc', nodeId)"
        />
        <BaseBoardViews
          v-else-if="!legacy"
          :type="boardType"
          :fields="fields"
          :rows="rows"
          :group-field-id="groupFieldId"
          :editable="canEdit"
          @update-cell="onCellUpdate"
          @open-record="onOpenRecord"
          @add-row="onAddRow"
        />
        <div v-if="!rows.length && !loading" class="be-empty">
          <div class="be-empty__icon"><el-icon><Tickets /></el-icon></div>
          <div>还没有记录</div>
          <el-button type="primary" size="small" :icon="Plus" @click="onAddRow">新增记录</el-button>
        </div>
      </div>
      <aside v-if="primaryField && sideOpen" class="be-body__side">
        <div class="be-panel__row">
          <span class="be-panel__hint">记录（{{ rows.length }} / {{ total }}）</span>
        </div>
        <div class="be-record-list">
          <button
            v-for="row in rows"
            :key="row.id"
            class="be-record-list__item"
            :class="{ 'is-active': activeRecord?.id === row.id }"
            @click="onOpenRecord(row.id)"
          >
            <span class="be-record-list__title">{{ row.fields?.[primaryField.id] ?? '未命名' }}</span>
            <span class="be-record-list__meta">v{{ row.version }}</span>
          </button>
        </div>
        <div class="be-panel__hint">
          双击单元格可直接编辑；公式字段由服务端实时计算。
        </div>
      </aside>
    </div>

    <transition name="be-fade">
      <div v-if="selectedIds.length && !legacy" class="be-batch-bar">
        <span class="be-batch-bar__count">已选 {{ selectedIds.length }} 条</span>
        <el-button size="small" type="primary" @click="showBatch = true">批量操作</el-button>
        <el-button size="small" text @click="selectedIds = []">取消选择</el-button>
      </div>
    </transition>

    <BaseFieldManager
      v-if="showFieldManager"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      :definitions="definitions"
      @close="showFieldManager = false"
      @changed="runQuery()"
      @edit-formula="(field) => { formulaField = field; showFieldManager = false; showFormula = true }"
    />

    <BaseQueryPanel
      v-if="showQueryPanel"
      :fields="fields"
      :filters="filters"
      :sorts="sorts"
      :groups="groups"
      @close="showQueryPanel = false"
      @apply="applyQuery"
    />

    <BaseFormulaDialog
      v-if="showFormula"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      :field="formulaField"
      :sample="rows[0]?.fields"
      @close="showFormula = false"
      @saved="() => { showFormula = false; runQuery() }"
    />

    <BaseRecordDrawer
      v-if="activeRecord"
      :row="activeRecord"
      :fields="fields"
      :editable="canEdit"
      @close="activeRecord = undefined"
      @update="onCellUpdate({ recordId: activeRecord!.id, ...$event })"
      @delete="onDeleteRecord"
    />

    <BaseImportDialog
      v-if="showImport"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      @close="showImport = false"
      @imported="onImported"
    />

    <BaseBatchDialog
      v-if="showBatch"
      :project-id="projectId"
      :table-id="activeTableId"
      :fields="fields"
      :record-ids="selectedIds"
      @close="showBatch = false"
      @done="onBatchDone"
    />

    <BaseViewSettings
      v-if="showViewSettings && activeView"
      :view="activeView"
      :fields="fields"
      @close="showViewSettings = false"
      @save="saveViewSettings"
    />

    <el-dialog
      v-if="showExport"
      :model-value="true"
      title="导出数据"
      width="720px"
      append-to-body
      destroy-on-close
      @close="showExport = false"
    >
      <div class="be-panel">
        <el-radio-group v-model="exportFormat" size="small" @change="refreshExportText">
          <el-radio-button value="markdown">Markdown 表格</el-radio-button>
          <el-radio-button value="csv">CSV</el-radio-button>
        </el-radio-group>
        <div class="be-panel__hint">
          Markdown 表格可直接粘贴进知识库文档，实现「多维表格 → 富文本文档」的内容沉淀。
        </div>
        <div class="be-export__preview">{{ exportText }}</div>
      </div>
      <template #footer>
        <el-button :icon="CopyDocument" @click="copyExport">复制</el-button>
        <el-button :icon="Download" @click="downloadExport">下载文件</el-button>
        <el-button type="primary" @click="showExport = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>
