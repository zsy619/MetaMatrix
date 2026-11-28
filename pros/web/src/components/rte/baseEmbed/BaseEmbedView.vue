<script setup lang="ts">
/**
 * 文档内嵌多维表格视图块（只读实时视图）。
 *
 * 文档里只存引用（baseId / tableId / viewId），打开时实时取数：
 * 表格里改了数据，文档里同步变；文档本身不复制数据。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { Refresh, Grid } from '@element-plus/icons-vue'
import { listViews, queryRecords } from '../../../modules/base/api'
import { getKnowledgeTree } from '../../../api/knowledge'
import BaseFieldCell from '../../../modules/base/fields/BaseFieldCell.vue'
import type { BaseView, FieldMeta, RecordRow } from '../../../modules/base/types'

const props = defineProps<{
  node: { attrs: Record<string, any> }
  editor: unknown
  extension: unknown
  getPos: () => number
}>()

const projectId = computed(() => String(props.node.attrs.projectId || ''))
const tableId = computed(() => String(props.node.attrs.tableId || ''))
const viewId = computed(() => String(props.node.attrs.viewId || ''))
const nodeId = computed(() => String(props.node.attrs.nodeId || ''))
const title = computed(() => String(props.node.attrs.title || '多维表格'))

const rows = ref<RecordRow[]>([])
const fields = ref<FieldMeta[]>([])
const view = ref<BaseView | undefined>(undefined)
const total = ref(0)
const loading = ref(false)
const error = ref('')
/** 关联文档字段的标题映射（节点 ID → 标题）。 */
const docTitles = ref<Record<string, string>>({})

let timer: ReturnType<typeof setTimeout> | null = null

/** 只读的视图列：主字段第一，其余按 sortOrder；视图里隐藏的列不显示。 */
const columns = computed<FieldMeta[]>(() => {
  const vis = view.value?.config?.fieldVisibility ?? {}
  const list = [...fields.value].sort(
    (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.sortOrder - b.sortOrder,
  )
  return list.filter((f) => vis[f.id] !== false)
})

/** 关联文档字段：拉知识库目录，得到节点 ID → 标题。 */
async function loadDocTitles() {
  if (!projectId.value) return
  try {
    const tree = await getKnowledgeTree(projectId.value)
    const titles: Record<string, string> = {}
    for (const node of tree ?? []) titles[node.id] = node.title
    docTitles.value = titles
  } catch {
    docTitles.value = {}
  }
}

async function load() {
  if (!projectId.value || !tableId.value) {
    error.value = '缺少多维表格引用信息'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await loadDocTitles()
    const views = await listViews(projectId.value, tableId.value)
    const picked = views.find((v) => v.id === viewId.value) ?? views.find((v) => v.isDefault) ?? views[0]
    view.value = picked
    const config = picked?.config ?? {}
    const res = await queryRecords(projectId.value, {
      tableId: tableId.value,
      viewId: picked?.id,
      filters: config.filters,
      sorts: config.sorts,
      pageSize: 20,
    })
    rows.value = res.records ?? []
    fields.value = res.fields ?? []
    total.value = res.total ?? rows.value.length
  } catch (err) {
    error.value = (err as Error)?.message || '多维表格数据加载失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

/** 点击「关联文档」单元格里的文档名：跳到对应文档节点。 */
function onOpenDoc(nodeId: string) {
  window.dispatchEvent(
    new CustomEvent('rte:open-base-node', { detail: { projectId: projectId.value, nodeId } }),
  )
}

function onOpenSource() {
  if (!projectId.value || !nodeId.value) return
  window.dispatchEvent(
    new CustomEvent('rte:open-base-node', { detail: { projectId: projectId.value, nodeId: nodeId.value } }),
  )
}

onMounted(() => {
  void load()
  timer = setTimeout(() => void load(), 60_000)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

watch(() => props.node.attrs.tableId, () => void load())
watch(() => props.node.attrs.viewId, () => void load())
</script>

<template>
  <NodeViewWrapper class="rte-base-embed" data-type="baseEmbed" data-base-embed="1">
    <div class="rte-base-embed__head">
      <span class="rte-base-embed__icon">📊</span>
      <span class="rte-base-embed__title">{{ title }}</span>
      <span v-if="view" class="rte-base-embed__view">{{ view.name }}</span>
      <span class="rte-base-embed__spacer" />
      <button class="rte-base-embed__act" type="button" title="刷新数据" @click="load">
        <el-icon><Refresh /></el-icon>
      </button>
      <button class="rte-base-embed__act" type="button" title="打开源表格" @click="onOpenSource">
        <el-icon><Grid /></el-icon>
      </button>
    </div>

    <div v-if="loading && !rows.length" class="rte-base-embed__hint">正在加载表格数据…</div>
    <div v-else-if="error" class="rte-base-embed__hint rte-base-embed__hint--error">{{ error }}</div>
    <div v-else-if="!rows.length" class="rte-base-embed__hint">这张表还没有记录</div>

    <div v-else class="rte-base-embed__table-wrap">
      <table class="rte-base-embed__table">
        <thead>
          <tr>
            <th v-for="field in columns" :key="field.id">{{ field.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td v-for="field in columns" :key="field.id">
              <BaseFieldCell
                :field="field"
                :model-value="row.fields?.[field.id]"
                :editable="false"
                :doc-titles="docTitles"
                @open-doc="onOpenDoc"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="rows.length" class="rte-base-embed__foot">
      共 {{ total }} 条{{ total > rows.length ? `，已显示前 ${rows.length} 条` : '' }} · 数据实时同步
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.rte-base-embed {
  margin: 12px 0;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface);
  overflow: hidden;
  box-shadow: var(--tg-shadow-1);
}
.rte-base-embed__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-surface-2);
}
.rte-base-embed__icon { font-size: 14px; }
.rte-base-embed__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tg-text);
}
.rte-base-embed__view {
  font-size: 12px;
  color: var(--tg-text-2);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-pill);
  padding: 1px 8px;
}
.rte-base-embed__spacer { flex: 1; }
.rte-base-embed__act {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: transparent;
  color: var(--tg-text-2);
  cursor: pointer;
  transition: background var(--tg-dur) var(--tg-ease), color var(--tg-dur) var(--tg-ease);
}
.rte-base-embed__act:hover {
  background: var(--tg-surface-3);
  color: var(--tg-text);
}
.rte-base-embed__hint {
  padding: 18px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--tg-text-2);
}
.rte-base-embed__hint--error { color: var(--tg-red); }
.rte-base-embed__table-wrap { max-height: 340px; overflow: auto; }
.rte-base-embed__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rte-base-embed__table th {
  position: sticky;
  top: 0;
  text-align: left;
  font-weight: 600;
  color: var(--tg-text-2);
  background: var(--tg-surface-2);
  padding: 8px 12px;
  border-bottom: 1px solid var(--tg-border);
  white-space: nowrap;
}
.rte-base-embed__table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--tg-border);
  color: var(--tg-text);
  vertical-align: middle;
}
.rte-base-embed__table tr:last-child td { border-bottom: none; }
.rte-base-embed__table tbody tr:hover td { background: var(--tg-surface-2); }
.rte-base-embed__foot {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--tg-text-3);
  border-top: 1px solid var(--tg-border);
}
</style>
