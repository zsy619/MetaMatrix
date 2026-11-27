<script setup lang="ts">
/**
 * 操作记录（审计日志）面板。
 *
 * 后端早已把每次记录 / 字段 / 视图变更写进 base_operation_logs，
 * 这里把「谁、什么时候、改了哪个字段、从什么改成什么」直接呈现出来。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Clock, Download, Filter, Refresh } from '@element-plus/icons-vue'
import { listAudit, type BaseAuditLog } from '../api'
import type { FieldMeta } from '../types'
import { listSpaceMembers, type SpaceMember } from '../../../api/knowledge_v6'

const props = defineProps<{
  projectId: string
  baseId: string
  /** 字段元信息：用于把字段 ID 翻译成字段名。 */
  fields?: FieldMeta[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rows = ref<BaseAuditLog[]>([])
const loading = ref(false)
/** 总条数（服务端算好的，筛选后也会变）。 */
const total = ref(0)
/** 单页条数。 */
const PAGE_SIZE = 30
/** 已加载的条数（用于「加载更多」的偏移）。 */
const loaded = ref(0)
/** 筛选条件。 */
const actionFilter = ref('')
/** 操作者过滤（成员 userId）。 */
const operatorFilter = ref('')
/** 记录 ID 过滤（支持前缀）。 */
const recordFilter = ref('')
/** 空间成员（用于操作者下拉）。 */
const members = ref<SpaceMember[]>([])
/** 时间范围（起 / 止），空表示不限。 */
const range = ref<[Date, Date] | null>(null)
/** 时间快捷：today / 7d / 30d / all。 */
const quickRange = ref('')
/** 是否还有更多。 */
const hasMore = computed(() => rows.value.length < total.value)

/** 操作类型 → 中文文案与图标色。 */
const OP_TEXT: Record<string, { label: string; type: 'success' | 'warning' | 'danger' | 'info' }> = {
  'record.created': { label: '新建记录', type: 'success' },
  'record.updated': { label: '更新记录', type: 'info' },
  'record.deleted': { label: '删除记录', type: 'danger' },
  'field.created': { label: '新建字段', type: 'success' },
  'field.updated': { label: '修改字段', type: 'info' },
  'field.deleted': { label: '删除字段', type: 'danger' },
  'view.created': { label: '新建视图', type: 'success' },
  'view.updated': { label: '修改视图', type: 'info' },
  'view.deleted': { label: '删除视图', type: 'danger' },
}

function opText(op: string) {
  return OP_TEXT[op]?.label ?? op
}

function opType(op: string) {
  return OP_TEXT[op]?.type ?? 'info'
}

/** 字段 ID → 字段名：优先用服务端按该条记录所属表解析好的映射。 */
function fieldName(row: BaseAuditLog, id: string): string {
  const fromServer = row.fieldNames?.[id]
  if (fromServer) return fromServer
  return props.fields?.find((item) => item.id === id)?.name ?? id.slice(0, 8)
}

/** 值的可读化。 */
function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  if (Array.isArray(value)) return value.length ? value.map((item) => readable(item)).join('、') : '（空）'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** 计算两条记录的字段级差异。 */
const diffs = computed(() => {
  const map = new Map<string, { fieldId: string; before: string; after: string }[]>()
  for (const row of rows.value) {
    const before = (row.beforeData ?? {}) as Record<string, unknown>
    const after = (row.afterData ?? {}) as Record<string, unknown>
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    const items: { fieldId: string; before: string; after: string }[] = []
    for (const key of keys) {
      const b = readable(before[key])
      const a = readable(after[key])
      if (b !== a) items.push({ fieldId: key, before: b, after: a })
    }
    map.set(row.id, items.slice(0, 4))
  }
  return map
})

/** 把筛选条件翻译成接口参数。 */
function queryParams(offset: number) {
  const params: {
    limit: number
    offset: number
    action?: string
    from?: string
    to?: string
    operator?: string
    recordId?: string
  } = {
    limit: PAGE_SIZE,
    offset,
  }
  if (actionFilter.value) params.action = actionFilter.value
  if (range.value?.length === 2) {
    const [from, to] = range.value
    params.from = from.toISOString()
    params.to = to.toISOString()
  }
  if (operatorFilter.value) params.operator = operatorFilter.value
  if (recordFilter.value.trim()) params.recordId = recordFilter.value.trim()
  return params
}

async function load(append = false) {
  loading.value = true
  try {
    const offset = append ? rows.value.length : 0
    const page = await listAudit(props.projectId, props.baseId, queryParams(offset))
    rows.value = append ? [...rows.value, ...page.items] : page.items
    total.value = page.total ?? page.items.length
    loaded.value = rows.value.length
  } catch (err) {
    ElMessage.error((err as Error).message || '操作记录加载失败')
    if (!append) {
      rows.value = []
      total.value = 0
    }
  } finally {
    loading.value = false
  }
}

/** 重置筛选。 */
function resetFilters() {
  actionFilter.value = ''
  operatorFilter.value = ''
  recordFilter.value = ''
  range.value = null
  quickRange.value = ''
  void load()
}

/** 时间范围快捷选择。 */
function applyQuickRange(kind: string) {
  quickRange.value = kind
  if (!kind) {
    range.value = null
  } else {
    const now = new Date()
    const from = new Date(now)
    if (kind === 'today') {
      from.setHours(0, 0, 0, 0)
    } else {
      const days = kind === '7d' ? 7 : 30
      from.setDate(from.getDate() - days + 1)
      from.setHours(0, 0, 0, 0)
    }
    range.value = [from, now]
  }
  void load()
}

/** 导出当前已加载的审计为 CSV。 */
function exportCSV() {
  if (!rows.value.length) {
    ElMessage.info('当前没有可导出的记录')
    return
  }
  const header = ['时间', '操作', '操作者', '数据表', '记录', '字段', '变更前', '变更后']
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines = [header.map(escape).join(',')]
  for (const row of rows.value) {
    const items = diffs.value.get(row.id) ?? []
    if (!items.length) {
      lines.push(
        [
          timeText(row.createdAt),
          opText(row.operation),
          row.operatorName || row.operatorId.slice(0, 8),
          row.tableName || '',
          row.recordId || '',
          '',
          '',
          '',
        ]
          .map(escape)
          .join(','),
      )
      continue
    }
    for (const item of items) {
      lines.push(
        [
          timeText(row.createdAt),
          opText(row.operation),
          row.operatorName || row.operatorId.slice(0, 8),
          row.tableName || '',
          row.recordId || '',
          fieldName(row, item.fieldId),
          item.before,
          item.after,
        ]
          .map(escape)
          .join(','),
      )
    }
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `操作记录_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${rows.value.length} 条操作记录`)
}

function timeText(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(async () => {
  try {
    members.value = await listSpaceMembers(props.projectId)
  } catch {
    members.value = []
  }
})

watch(() => [props.projectId, props.baseId], () => void load(), { immediate: true })
</script>

<template>
  <el-drawer
    :model-value="true"
    title="操作记录"
    size="520px"
    append-to-body
    destroy-on-close
    modal-class="be-modal be-drawer"
    @close="emit('close')"
  >
    <div v-loading="loading" class="be-audit">
      <div class="be-audit__head">
        <span class="be-panel__hint">共 {{ total }} 条记录{{ loaded < total ? `（已加载 ${loaded}）` : '' }}</span>
        <div class="be-audit__head-actions">
          <el-button size="small" text :icon="Download" @click="exportCSV">导出</el-button>
          <el-button size="small" text :icon="Refresh" @click="load()">刷新</el-button>
        </div>
      </div>
      <!-- 筛选：操作类型 + 时间范围 -->
      <div class="be-audit__filters">
        <el-select
          v-model="actionFilter"
          class="be-audit__filter-select"
          size="small"
          clearable
          placeholder="全部操作"
          @change="load()"
        >
          <el-option
            v-for="(item, key) in OP_TEXT"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </el-select>
        <el-select
          v-model="operatorFilter"
          class="be-audit__filter-select"
          size="small"
          clearable
          filterable
          placeholder="全部操作者"
          @change="load()"
        >
          <el-option
            v-for="item in members"
            :key="item.userId"
            :label="item.name || item.email"
            :value="item.userId"
          />
        </el-select>
        <el-input
          v-model="recordFilter"
          class="be-audit__filter-input"
          size="small"
          clearable
          placeholder="记录 ID（可填前几位）"
          @change="load()"
          @clear="load()"
        />
        <el-date-picker
          v-model="range"
          class="be-audit__filter-range"
          size="small"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          @change="load()"
        />
        <el-button size="small" text :icon="Filter" @click="resetFilters">重置</el-button>
      </div>
      <!-- 时间快捷 -->
      <el-radio-group v-model="quickRange" size="small" class="be-audit__quick" @change="applyQuickRange">
        <el-radio-button value="today">今天</el-radio-button>
        <el-radio-button value="7d">近 7 天</el-radio-button>
        <el-radio-button value="30d">近 30 天</el-radio-button>
        <el-radio-button value="">全部</el-radio-button>
      </el-radio-group>
      <ul class="be-audit__list">
        <li v-for="row in rows" :key="row.id" class="be-audit__item">
          <div class="be-audit__line">
            <el-tag size="small" effect="plain" :type="opType(row.operation)">{{ opText(row.operation) }}</el-tag>
            <span class="be-audit__time">
              <el-icon><Clock /></el-icon>{{ timeText(row.createdAt) }}
            </span>
          </div>
          <div class="be-audit__meta">
            <span>操作者 {{ row.operatorName || row.operatorId.slice(0, 8) }}</span>
            <span v-if="row.tableName">· 表 {{ row.tableName }}</span>
            <span v-if="row.recordId">· 记录 {{ row.recordId.slice(0, 8) }}</span>
          </div>
          <ul v-if="(diffs.get(row.id) ?? []).length" class="be-audit__diff">
            <li v-for="(item, index) in diffs.get(row.id)" :key="index">
              <span class="be-audit__field">{{ fieldName(row, item.fieldId) }}</span>
              <span class="be-audit__before">{{ item.before }}</span>
              <span class="be-audit__arrow">→</span>
              <span class="be-audit__after">{{ item.after }}</span>
            </li>
          </ul>
        </li>
      </ul>
      <div v-if="hasMore" class="be-audit__more">
        <el-button size="small" :loading="loading" @click="load(true)">加载更多</el-button>
      </div>
      <el-empty v-if="!loading && !rows.length" description="还没有操作记录" :image-size="72" />
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.be-audit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.be-audit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.be-audit__head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.be-audit__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.be-audit__filter-select {
  width: 140px;
}

.be-audit__filter-input {
  width: 190px;
}

.be-audit__quick {
  align-self: flex-start;
}

.be-audit__filter-range {
  flex: 1;
  min-width: 240px;
}

.be-audit__more {
  display: flex;
  justify-content: center;
  padding: 4px 0 2px;
}

.be-audit__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.be-audit__item {
  padding: 10px 12px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface-2);
}

.be-audit__line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.be-audit__time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--tg-text-2);
}

.be-audit__meta {
  font-size: 12px;
  color: var(--tg-text-3, #94a3b8);
}

.be-audit__diff {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.be-audit__diff li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tg-text-2);
}

.be-audit__field {
  color: var(--tg-text);
}

.be-audit__before {
  color: var(--tg-text-3, #94a3b8);
  text-decoration: line-through;
}

.be-audit__after {
  color: var(--tg-text);
}
</style>
