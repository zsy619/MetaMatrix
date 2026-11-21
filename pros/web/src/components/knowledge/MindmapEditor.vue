<script setup lang="ts">
/**
 * 思维导图（KityMinder 式）：左侧大纲、右侧导图，双向联动。
 *
 * 数据是 nodeGraph 的 nodes/edges 存进 knowledge_node_data（kind=mindmap），
 * 自动布局复用 nodeGraph 的 computeLayout。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  Download,
  Expand,
  Fold,
  FullScreen,
  Minus,
  Plus,
  RefreshLeft,
  RefreshRight,
  Search,
  Share,
  Upload,
} from '@element-plus/icons-vue'
import { getNodeData, saveNodeData } from '../../api/knowledge'
import type { LayoutMode } from '../../components/canvas/nodeGraph/layout'
import { NODE_COLORS } from '../../components/canvas/nodeGraph/colors'
import ShareDialog from './ShareDialog.vue'
import {
  applyLayout,
  addChild,
  addSibling,
  downloadBlob,
  emptyMindmap,
  fromFreeMind,
  fromMarkdown,
  fromOPML,
  fromXMind,
  indentNode,
  migrateMindmap,
  moveSibling,
  outlineRows,
  outdentNode,
  parentMap,
  childrenMap,
  removeNode,
  setCollapsed,
  subtreeIds,
  toFreeMind,
  toMarkdown,
  toOPML,
  toXMind,
  type MindmapDoc,
} from './mindmapModel'

const props = defineProps<{ projectId: string; nodeId: string; title?: string }>()

const LAYOUTS: Array<{ mode: LayoutMode; label: string }> = [
  { mode: 'mindmap', label: '脑图排列' },
  { mode: 'tree', label: '树形排列' },
  { mode: 'org', label: '组织架构' },
  { mode: 'outline', label: '大纲排列' },
  { mode: 'center', label: '中心聚拢' },
  { mode: 'radial', label: '辐射排列' },
  { mode: 'fishbone', label: '鱼骨排列' },
]

const BRANCH_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#f97316', '#db2777', '#0d9488', '#6366f1']

const doc = ref<MindmapDoc>(emptyMindmap())
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const layoutMode = ref<LayoutMode>('mindmap')
const selectedId = ref('')
const editingId = ref('')
const query = ref('')
const zoom = ref(1)
const offset = ref({ x: 40, y: 40 })
const shareVisible = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let saveTimer: ReturnType<typeof setTimeout> | null = null
let historyBase = ''
let dragState: {
  kind: 'none' | 'node' | 'pan'
  ids: string[]
  startX: number
  startY: number
  origins: Record<string, { x: number; y: number }>
  originX: number
  originY: number
} = { kind: 'none', ids: [], startX: 0, startY: 0, origins: {}, originX: 0, originY: 0 }

const rows = computed(() => outlineRows(doc.value))
const nodeById = computed(() => new Map(doc.value.nodes.map((n) => [n.id, n])))
const rootId = computed(() => doc.value.nodes[0]?.id ?? '')
const childMap = computed(() => childrenMap(doc.value))
const parents = computed(() => parentMap(doc.value))
const selectedNode = computed(() => nodeById.value.get(selectedId.value) ?? null)
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const matchedIds = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return null
  return new Set(
    doc.value.nodes
      .filter((node) => node.title.toLowerCase().includes(keyword))
      .map((node) => node.id),
  )
})
/** 折叠节点的子树在图上不画。 */
const hiddenIds = computed(() => {
  const hide = new Set<string>()
  for (const node of doc.value.nodes) {
    if (!node.collapsed) continue
    for (const id of subtreeIds(doc.value, node.id)) {
      // 折叠节点自身要保留，否则根节点折叠后整张图会消失，也没有展开入口。
      if (id !== node.id) hide.add(id)
    }
  }
  return hide
})
const visibleNodes = computed(() => doc.value.nodes.filter((n) => !hiddenIds.value.has(n.id)))
const visibleEdges = computed(() =>
  doc.value.edges.filter((e) => !hiddenIds.value.has(e.source) && !hiddenIds.value.has(e.target)),
)

function snapshot(): string {
  return JSON.stringify(doc.value)
}

function resetHistory() {
  undoStack.value = []
  redoStack.value = []
  historyBase = snapshot()
}

function restoreFrom(serialized: string) {
  doc.value = JSON.parse(serialized) as MindmapDoc
  if (!nodeById.value.has(selectedId.value)) selectedId.value = doc.value.nodes[0]?.id ?? ''
  historyBase = snapshot()
  scheduleSave()
}

function undo() {
  const previous = undoStack.value.pop()
  if (!previous) return
  redoStack.value.push(snapshot())
  restoreFrom(previous)
}

function redo() {
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(snapshot())
  restoreFrom(next)
}

async function load() {
  loading.value = true
  try {
    const res = await getNodeData(props.projectId, props.nodeId)
    doc.value = migrateMindmap(res.data)
    selectedId.value = doc.value.nodes[0]?.id ?? ''
    relayout()
    resetHistory()
  } catch {
    ElMessage.error('加载导图失败')
  } finally {
    loading.value = false
  }
}

function scheduleSave() {
  dirty.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void save(), 1200)
}

async function save() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saving.value = true
  try {
    await saveNodeData(props.projectId, props.nodeId, 'mindmap', doc.value)
    dirty.value = false
  } catch {
    ElMessage.error('保存导图失败')
  } finally {
    saving.value = false
  }
}

function relayout() {
  applyLayout(doc.value, layoutMode.value)
}

/** 画布内容都变了之后重新排一次并落盘。 */
function commit(relayoutAfter = true) {
  if (relayoutAfter) relayout()
  const next = snapshot()
  if (historyBase && historyBase !== next) {
    undoStack.value.push(historyBase)
    if (undoStack.value.length > 50) undoStack.value.shift()
    redoStack.value = []
  }
  historyBase = next
  scheduleSave()
}

// ---------------- 大纲操作 ----------------

function select(id: string) {
  selectedId.value = id
}

function startEdit(id: string) {
  editingId.value = id
}

function finishEdit(id: string, value: string) {
  const node = nodeById.value.get(id)
  if (node && value.trim()) {
    node.title = value.trim()
    node.width = Math.min(280, Math.max(120, node.title.length * 14 + 28))
    if (id === doc.value.nodes[0]?.id) doc.value.title = node.title
    commit()
  }
  editingId.value = ''
}

function onChild(parentId: string) {
  const id = addChild(doc.value, parentId)
  if (!id) return
  selectedId.value = id
  editingId.value = id
  commit()
}

function onSibling(id: string) {
  const next = addSibling(doc.value, id)
  if (!next) return
  selectedId.value = next
  editingId.value = next
  commit()
}

function onRemove(id: string) {
  if (doc.value.nodes.length <= 1) {
    ElMessage.warning('至少保留中心主题')
    return
  }
  const node = nodeById.value.get(id)
  if (!node) return
  void ElMessageBox.confirm(`删除「${node.title}」及其子节点？`, '删除节点', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => {
      removeNode(doc.value, id)
      if (selectedId.value === id) selectedId.value = doc.value.nodes[0]?.id ?? ''
      commit()
    })
    .catch(() => undefined)
}

function onIndent(id: string) {
  if (indentNode(doc.value, id)) commit()
}

function onOutdent(id: string) {
  if (outdentNode(doc.value, id)) commit()
}

function onMove(id: string, dir: -1 | 1) {
  if (moveSibling(doc.value, id, dir)) commit()
}

function onToggleCollapse(id: string) {
  const node = nodeById.value.get(id)
  if (!node) return
  setCollapsed(doc.value, id, !node.collapsed)
  commit(false)
}

/** 每行一个取色板开关：节点 id → 展开状态。 */
const colorOpen = reactive<Record<string, boolean>>({})

function setColor(id: string, color: string) {
  const node = nodeById.value.get(id)
  if (!node) return
  if (color) node.color = color
  else delete node.color
  commit(false)
  colorOpen[id] = false
}

/** 一级分支颜色：同一支的所有节点和连线共用一种颜色。 */
function branchColor(id: string): string {
  const node = nodeById.value.get(id)
  if (node?.color) return node.color
  if (id === rootId.value) return BRANCH_COLORS[0]
  let current = id
  let parent = parents.value.get(current)
  while (parent && parent !== rootId.value) {
    current = parent
    parent = parents.value.get(current)
  }
  const branch = (childMap.value.get(rootId.value) ?? []).indexOf(current)
  return BRANCH_COLORS[Math.max(0, branch) % BRANCH_COLORS.length]
}

function depthOf(id: string): number {
  let depth = 0
  let parent = parents.value.get(id)
  while (parent) {
    depth += 1
    parent = parents.value.get(parent)
  }
  return depth
}

function isDim(id: string): boolean {
  return !!matchedIds.value && !matchedIds.value.has(id)
}

function isMatch(id: string): boolean {
  return !!matchedIds.value?.has(id)
}

function centerOn(id: string) {
  const node = nodeById.value.get(id)
  const el = canvasEl.value
  if (!node || !el) return
  const rect = el.getBoundingClientRect()
  offset.value = {
    x: rect.width / 2 - (node.x + node.width / 2) * zoom.value,
    y: rect.height / 2 - (node.y + node.height / 2) * zoom.value,
  }
}

function focusFirstMatch() {
  const first = visibleNodes.value.find((node) => matchedIds.value?.has(node.id))
  if (!first) return
  selectedId.value = first.id
  centerOn(first.id)
}

function collapseAll() {
  for (const node of doc.value.nodes) node.collapsed = childMap.value.has(node.id)
  commit(false)
}

function expandAll() {
  for (const node of doc.value.nodes) node.collapsed = false
  commit(false)
}

function onRowCommand(id: string, command: string) {
  if (command === 'edit') startEdit(id)
  else if (command === 'indent') onIndent(id)
  else if (command === 'outdent') onOutdent(id)
  else if (command === 'up') onMove(id, -1)
  else if (command === 'down') onMove(id, 1)
  else if (command === 'collapse') onToggleCollapse(id)
  else if (command === 'delete') onRemove(id)
}

// ---------------- 画布交互 ----------------

function worldPoint(event: PointerEvent) {
  const el = canvasEl.value
  if (!el) return { x: 0, y: 0 }
  const rect = el.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - offset.value.x) / zoom.value,
    y: (event.clientY - rect.top - offset.value.y) / zoom.value,
  }
}

function onNodePointerDown(event: PointerEvent, id: string) {
  event.stopPropagation()
  select(id)
  const point = worldPoint(event)
  const origins: Record<string, { x: number; y: number }> = {}
  for (const node of doc.value.nodes) origins[node.id] = { x: node.x, y: node.y }
  dragState = {
    kind: 'node',
    ids: [id],
    startX: point.x,
    startY: point.y,
    origins,
    originX: offset.value.x,
    originY: offset.value.y,
  }
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onCanvasPointerDown(event: PointerEvent) {
  dragState = {
    kind: 'pan',
    ids: [],
    startX: event.clientX,
    startY: event.clientY,
    origins: {},
    originX: offset.value.x,
    originY: offset.value.y,
  }
}

function onPointerMove(event: PointerEvent) {
  if (dragState.kind === 'pan') {
    offset.value = {
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
    }
    return
  }
  if (dragState.kind === 'node') {
    const point = worldPoint(event)
    const dx = point.x - dragState.startX
    const dy = point.y - dragState.startY
    for (const id of dragState.ids) {
      const origin = dragState.origins[id]
      const node = nodeById.value.get(id)
      if (!origin || !node) continue
      node.x = origin.x + dx
      node.y = origin.y + dy
    }
  }
}

function onPointerUp() {
  if (dragState.kind === 'node') commit(false)
  dragState = { kind: 'none', ids: [], startX: 0, startY: 0, origins: {}, originX: 0, originY: 0 }
}

function onWheel(event: WheelEvent) {
  const el = canvasEl.value
  if (!el) return
  event.preventDefault()
  const rect = el.getBoundingClientRect()
  const cx = event.clientX - rect.left
  const cy = event.clientY - rect.top
  const next = Math.min(2.5, Math.max(0.25, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)))
  const ratio = next / zoom.value
  offset.value = { x: cx - (cx - offset.value.x) * ratio, y: cy - (cy - offset.value.y) * ratio }
  zoom.value = next
}

function fitView() {
  const el = canvasEl.value
  if (!el || !doc.value.nodes.length) return
  const rect = el.getBoundingClientRect()
  const pad = 56
  const minX = Math.min(...doc.value.nodes.map((n) => n.x)) - pad
  const minY = Math.min(...doc.value.nodes.map((n) => n.y)) - pad
  const maxX = Math.max(...doc.value.nodes.map((n) => n.x + n.width)) + pad
  const maxY = Math.max(...doc.value.nodes.map((n) => n.y + n.height)) + pad
  const scale = Math.min(
    1.8,
    Math.max(0.25, Math.min(rect.width / (maxX - minX || 1), rect.height / (maxY - minY || 1))),
  )
  zoom.value = scale
  offset.value = {
    x: (rect.width - (maxX - minX) * scale) / 2 - minX * scale,
    y: (rect.height - (maxY - minY) * scale) / 2 - minY * scale,
  }
}

function zoomBy(delta: number) {
  const el = canvasEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const next = Math.min(2.5, Math.max(0.25, zoom.value + delta))
  const ratio = next / zoom.value
  offset.value = {
    x: rect.width / 2 - (rect.width / 2 - offset.value.x) * ratio,
    y: rect.height / 2 - (rect.height / 2 - offset.value.y) * ratio,
  }
  zoom.value = next
}

// ---------------- 导入导出 ----------------

function triggerImport() {
  fileInput.value?.click()
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const name = file.name.toLowerCase()
    let next: MindmapDoc
    if (name.endsWith('.xmind')) next = await fromXMind(file)
    else {
      const text = await file.text()
      if (name.endsWith('.mm')) next = fromFreeMind(text)
      else if (name.endsWith('.opml')) next = fromOPML(text)
      else next = fromMarkdown(text)
    }
    doc.value = next
    selectedId.value = next.nodes[0]?.id ?? ''
    relayout()
    commit()
    ElMessage.success(`已导入 ${file.name}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导入失败')
  }
}

async function exportAs(kind: 'md' | 'mm' | 'opml' | 'xmind') {
  const name = (doc.value.title || '思维导图').replace(/[\\/:*?"<>|]/g, '_')
  if (kind === 'md') {
    downloadBlob(new Blob([toMarkdown(doc.value)], { type: 'text/markdown' }), `${name}.md`)
  } else if (kind === 'mm') {
    downloadBlob(new Blob([toFreeMind(doc.value)], { type: 'application/xml' }), `${name}.mm`)
  } else if (kind === 'opml') {
    downloadBlob(new Blob([toOPML(doc.value)], { type: 'application/xml' }), `${name}.opml`)
  } else {
    downloadBlob(await toXMind(doc.value), `${name}.xmind`)
  }
  ElMessage.success('已导出')
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
    return
  }
  const target = event.target as HTMLElement | null
  // 工具按钮上保留浏览器自己的 Tab/Enter 导航，不在画布外抢快捷键。
  if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) {
    if (event.key === 'Escape') editingId.value = ''
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }
  if (!selectedId.value) return
  if (event.key === 'Tab') {
    event.preventDefault()
    onChild(selectedId.value)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    onSibling(selectedId.value)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    onRemove(selectedId.value)
  } else if (event.key === 'F2') {
    event.preventDefault()
    startEdit(selectedId.value)
  }
}

const canvasEl = ref<HTMLElement | null>(null)

watch(() => props.nodeId, () => void load())
onMounted(() => {
  void load()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (saveTimer) clearTimeout(saveTimer)
})

/** 边：按父子相对方向选择横向或纵向锚点，环形/鱼骨布局也不会画出穿节点的直线。 */
function edgePath(sourceId: string, targetId: string): string {
  const s = nodeById.value.get(sourceId)
  const t = nodeById.value.get(targetId)
  if (!s || !t) return ''
  const sx = s.x + s.width / 2
  const sy = s.y + s.height / 2
  const tx = t.x + t.width / 2
  const ty = t.y + t.height / 2
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) {
    const right = tx >= sx
    const x1 = right ? s.x + s.width : s.x
    const x2 = right ? t.x : t.x + t.width
    const dx = Math.max(28, Math.abs(x2 - x1) / 2) * (right ? 1 : -1)
    return `M ${x1} ${sy} C ${x1 + dx} ${sy}, ${x2 - dx} ${ty}, ${x2} ${ty}`
  }
  const down = ty >= sy
  const y1 = down ? s.y + s.height : s.y
  const y2 = down ? t.y : t.y + t.height
  const dy = Math.max(28, Math.abs(y2 - y1) / 2) * (down ? 1 : -1)
  return `M ${sx} ${y1} C ${sx} ${y1 + dy}, ${tx} ${y2 - dy}, ${tx} ${y2}`
}

function nodeFill(nodeId: string): string {
  const node = nodeById.value.get(nodeId)
  if (node?.color) return `${node.color}${nodeId === rootId.value ? '26' : '1f'}`
  if (nodeId === rootId.value) return 'url(#mm-root-fill)'
  return `${branchColor(nodeId)}12`
}

function nodeStroke(nodeId: string): string {
  const node = nodeById.value.get(nodeId)
  if (node?.color) return node.color
  return branchColor(nodeId)
}

function nodeTextColor(nodeId: string): string {
  const node = nodeById.value.get(nodeId)
  return nodeId === rootId.value && !node?.color ? '#ffffff' : '#1d2129'
}

function edgeColor(sourceId: string, targetId: string): string {
  return targetId === rootId.value ? branchColor(sourceId) : branchColor(targetId)
}

function edgeActive(edge: { source: string; target: string }): boolean {
  return !!selectedId.value && (edge.source === selectedId.value || edge.target === selectedId.value)
}

function edgeDim(edge: { source: string; target: string }): boolean {
  if (!matchedIds.value) return false
  return !matchedIds.value.has(edge.source) && !matchedIds.value.has(edge.target)
}

function childCount(id: string): number {
  return childMap.value.get(id)?.length ?? 0
}

function shortText(text: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 24) / 14))
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<template>
  <section class="mm">
    <header class="mm__bar">
      <div class="mm__identity">
        <span class="mm__icon">🧠</span>
        <input
          class="mm__title"
          :value="doc.title"
          placeholder="中心主题"
          maxlength="120"
          @input="doc.title = ($event.target as HTMLInputElement).value; commit(false)"
        />
      </div>
      <span
        class="mm__status"
        :class="{ 'is-saving': saving, 'is-dirty': dirty && !saving, 'is-saved': !dirty && !saving }"
      >
        <i class="mm__status-dot" />
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else>已保存</span>
      </span>

      <div class="mm__tools">
        <el-input
          v-model="query"
          size="small"
          clearable
          :prefix-icon="Search"
          placeholder="搜索节点"
          class="mm__search"
          @keyup.enter="focusFirstMatch"
        />
        <el-select v-model="layoutMode" size="small" class="mm__layout" @change="relayout(); commit()">
          <el-option v-for="l in LAYOUTS" :key="l.mode" :label="l.label" :value="l.mode" />
        </el-select>
        <div class="mm__history">
          <button type="button" title="撤销 (Ctrl/⌘+Z)" :disabled="!canUndo" @click="undo">
            <el-icon><RefreshLeft /></el-icon>
          </button>
          <button type="button" title="重做 (Ctrl/⌘+Shift+Z)" :disabled="!canRedo" @click="redo">
            <el-icon><RefreshRight /></el-icon>
          </button>
        </div>
        <i class="mm__divider" />
        <button type="button" class="mm__tool" title="导入文件" @click="triggerImport">
          <el-icon><Upload /></el-icon><span>导入</span>
        </button>
        <el-dropdown trigger="click" @command="(k: string) => exportAs(k as 'md')">
          <button type="button" class="mm__tool" title="导出">
            <el-icon><Download /></el-icon><span>导出</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="md">Markdown 大纲 (.md)</el-dropdown-item>
              <el-dropdown-item command="mm">FreeMind (.mm)</el-dropdown-item>
              <el-dropdown-item command="opml">OPML (.opml)</el-dropdown-item>
              <el-dropdown-item command="xmind">XMind (.xmind)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button type="button" class="mm__tool" title="分享" @click="shareVisible = true">
          <el-icon><Share /></el-icon><span>分享</span>
        </button>
      </div>
      <el-button class="mm__save" size="small" type="primary" :loading="saving" @click="save">
        <el-icon v-if="!saving"><Check /></el-icon><span>保存</span>
      </el-button>
      <input ref="fileInput" type="file" accept=".md,.mm,.opml,.xmind" hidden @change="onFilePicked" />
    </header>

    <ShareDialog
      :project-id="props.projectId"
      :node-id="props.nodeId"
      kind="mindmap"
      :visible="shareVisible"
      @close="shareVisible = false"
    />

    <div class="mm__body">
      <aside class="mm__outline">
        <div class="mm__outline-head">
          <span class="mm__outline-title">大纲</span>
          <span class="mm__outline-count">{{ rows.length }} 个节点</span>
          <span class="mm__outline-actions">
            <button type="button" title="全部收起" @click="collapseAll">
              <el-icon><Fold /></el-icon>
            </button>
            <button type="button" title="全部展开" @click="expandAll">
              <el-icon><Expand /></el-icon>
            </button>
          </span>
        </div>
        <ul class="mm__list">
          <li
            v-for="row in rows"
            :key="row.node.id"
            class="mm__row"
            :class="{
              'is-selected': row.node.id === selectedId,
              'is-dim': isDim(row.node.id),
              'is-match': isMatch(row.node.id),
            }"
            :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
            @click="select(row.node.id)"
          >
            <button
              v-if="row.children.length"
              type="button"
              class="mm__toggle"
              @click.stop="onToggleCollapse(row.node.id)"
            >
              {{ row.node.collapsed ? '▸' : '▾' }}
            </button>
            <span v-else class="mm__toggle mm__toggle--empty" />
            <i class="mm__branch-dot" :style="{ background: branchColor(row.node.id) }" />
            <input
              v-if="editingId === row.node.id"
              class="mm__input"
              :value="row.node.title"
              autofocus
              @click.stop
              @keydown.enter.prevent="finishEdit(row.node.id, ($event.target as HTMLInputElement).value)"
              @keydown.esc.prevent="editingId = ''"
              @blur="finishEdit(row.node.id, ($event.target as HTMLInputElement).value)"
            />
            <span
              v-else
              class="mm__row-title"
              @dblclick.stop="startEdit(row.node.id)"
            >{{ row.node.title }}</span>
            <span class="mm__ops">
              <button type="button" class="mm__op" title="添加子节点" @click.stop="onChild(row.node.id)">＋子</button>
              <button type="button" class="mm__op" title="添加同级节点" @click.stop="onSibling(row.node.id)">＋同</button>
              <el-popover
                v-model:visible="colorOpen[row.node.id]"
                placement="right-start"
                :width="252"
                trigger="click"
              >
                <template #reference>
                  <button type="button" class="mm__op" title="换色">
                    <i class="mm__op-swatch" :style="{ background: row.node.color || branchColor(row.node.id) }" />
                  </button>
                </template>
                <div class="mm__palette">
                  <button
                    v-for="color in NODE_COLORS"
                    :key="color"
                    type="button"
                    class="mm__palette-dot"
                    :style="{ background: color, color }"
                    :class="{ 'is-on': row.node.color === color }"
                    :title="color"
                    @click.stop="setColor(row.node.id, color)"
                  ></button>
                  <el-color-picker
                    :model-value="row.node.color"
                    size="small"
                    title="自定义颜色"
                    @change="(c: string | null) => c && setColor(row.node.id, c)"
                  />
                  <button
                    type="button"
                    class="mm__palette-dot mm__palette-dot--reset"
                    title="恢复默认"
                    @click.stop="setColor(row.node.id, '')"
                  >×</button>
                </div>
              </el-popover>
              <el-dropdown trigger="click" @command="(cmd: string) => onRowCommand(row.node.id, cmd)">
                <button type="button" class="mm__op" title="更多操作" @click.stop>⋯</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">重命名</el-dropdown-item>
                    <el-dropdown-item command="outdent">升级</el-dropdown-item>
                    <el-dropdown-item command="indent">降级</el-dropdown-item>
                    <el-dropdown-item command="up">上移</el-dropdown-item>
                    <el-dropdown-item command="down">下移</el-dropdown-item>
                    <el-dropdown-item command="collapse">
                      {{ row.node.collapsed ? '展开子节点' : '收起子节点' }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>删除节点</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <button type="button" class="mm__op mm__op--danger" title="删除" @click.stop="onRemove(row.node.id)">✕</button>
            </span>
          </li>
        </ul>
      </aside>

      <div
        ref="canvasEl"
        class="mm__canvas"
        @pointerdown="onCanvasPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @wheel="onWheel"
      >
        <svg class="mm__svg" width="100%" height="100%">
          <defs>
            <linearGradient id="mm-root-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#2563eb" />
              <stop offset="1" stop-color="#7c3aed" />
            </linearGradient>
            <filter id="mm-node-shadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#334155" flood-opacity="0.12" />
            </filter>
          </defs>
          <g :transform="`translate(${offset.x}, ${offset.y}) scale(${zoom})`">
            <path
              v-for="edge in visibleEdges"
              :key="edge.id"
              :d="edgePath(edge.source, edge.target)"
              class="mm__edge"
              :class="{ 'is-active': edgeActive(edge), 'is-dim': edgeDim(edge) }"
              fill="none"
              :stroke="edgeColor(edge.source, edge.target)"
              :stroke-width="Math.max(1.2, 2.2 - depthOf(edge.target) * 0.22)"
            />
            <g
              v-for="node in visibleNodes"
              :key="node.id"
              class="mm__node"
              :class="{
                'is-selected': node.id === selectedId,
                'is-dim': isDim(node.id),
                'is-match': isMatch(node.id),
                'is-root': node.id === rootId,
              }"
              @pointerdown="onNodePointerDown($event, node.id)"
              @dblclick.stop="startEdit(node.id)"
            >
              <rect
                v-if="node.id === selectedId"
                class="mm__node-ring"
                :x="node.x - 4"
                :y="node.y - 4"
                :width="node.width + 8"
                :height="node.height + 8"
                rx="14"
                :stroke="branchColor(node.id)"
              />
              <rect
                class="mm__node-bg"
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="node.height"
                rx="12"
                :fill="nodeFill(node.id)"
                :stroke="nodeStroke(node.id)"
                stroke-width="1.2"
                filter="url(#mm-node-shadow)"
              />
              <rect
                :x="node.x + 1"
                :y="node.y + 10"
                width="4"
                :height="node.height - 20"
                rx="2"
                :fill="node.id === rootId && !node.color ? 'rgba(255,255,255,.82)' : branchColor(node.id)"
              />
              <text
                :x="node.x + 14"
                :y="node.y + node.height / 2"
                dominant-baseline="central"
                font-size="13"
                :font-weight="node.id === rootId ? 700 : 500"
                :fill="nodeTextColor(node.id)"
              >{{ shortText(node.title, node.width) }}</text>
              <g
                v-if="childCount(node.id)"
                class="mm__fold"
                :class="{ 'is-collapsed': node.collapsed }"
                :transform="`translate(${node.x + node.width + 12}, ${node.y + node.height / 2})`"
                @pointerdown.stop
                @click.stop="onToggleCollapse(node.id)"
              >
                <rect
                  class="mm__fold-pill"
                  x="-11"
                  y="-9"
                  width="22"
                  height="18"
                  rx="9"
                  :stroke="branchColor(node.id)"
                />
                <text
                  x="0"
                  y="3.5"
                  text-anchor="middle"
                  font-size="9"
                  font-weight="600"
                  :fill="branchColor(node.id)"
                >{{ node.collapsed ? `+${Math.min(99, childCount(node.id))}` : '−' }}</text>
                <title>{{ node.collapsed ? `展开 ${childCount(node.id)} 个节点` : '收起子节点' }}</title>
              </g>
              <title>{{ node.title }}</title>
            </g>
          </g>
        </svg>
        <div class="mm__zoom">
          <button type="button" title="缩小" @click="zoomBy(-0.1)">
            <el-icon><Minus /></el-icon>
          </button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button type="button" title="放大" @click="zoomBy(0.1)">
            <el-icon><Plus /></el-icon>
          </button>
          <i class="mm__divider" />
          <button type="button" title="适应视图" @click="fitView">
            <el-icon><FullScreen /></el-icon>
          </button>
        </div>
        <div class="mm__shortcuts">
          <span v-if="selectedNode" class="mm__current">当前：{{ selectedNode.title }}</span>
          <span>Tab 子级 · Enter 同级 · Del 删除 · 双击重命名</span>
        </div>
        <div v-if="loading" class="mm__empty">加载中…</div>
        <div v-else-if="!rows.length" class="mm__empty">还没有内容，先在左侧添加节点。</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mm {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
}
.mm__bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.mm__identity {
  flex: 1;
  min-width: 120px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.mm__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  font-size: 16px;
}
.mm__title {
  flex: 1;
  min-width: 0;
  max-width: 300px;
  border: none;
  border-bottom: 2px solid transparent;
  outline: none;
  padding: 3px 2px;
  font-size: 15px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
  background: transparent;
  transition: border-color 0.16s ease;
}
.mm__title:focus {
  border-bottom: 2px solid var(--mm-blue, #3370ff);
}
.mm__status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  white-space: nowrap;
}
.mm__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a9b0bb;
}
.mm__status.is-saved {
  color: var(--el-color-success);
}
.mm__status.is-saved .mm__status-dot {
  background: var(--el-color-success);
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.14);
}
.mm__status.is-dirty {
  color: #d46b08;
}
.mm__status.is-dirty .mm__status-dot {
  background: #fa8c16;
  box-shadow: 0 0 0 3px rgba(250, 140, 22, 0.14);
}
.mm__status.is-saving .mm__status-dot {
  background: var(--el-color-primary);
  animation: mm-pulse 1s ease-in-out infinite;
}
.mm__tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 3px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.46);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.mm__search {
  width: 158px;
  flex: 0 1 auto;
}
.mm__search :deep(.el-input__wrapper) {
  min-height: 27px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.48);
  box-shadow: inset 0 0 0 1px var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.mm__search :deep(.el-input__wrapper.is-focus) {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.5);
}
.mm__layout {
  width: 116px;
  flex: none;
}
.mm__layout :deep(.el-select__wrapper) {
  min-height: 27px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.48);
  box-shadow: inset 0 0 0 1px var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.mm__history {
  display: flex;
  align-items: center;
  gap: 1px;
}
.mm__history button,
.mm__tool,
.mm__outline-actions button,
.mm__zoom button {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--ent-text-2, #5a6472);
  transition: background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease, color 0.16s ease;
}
.mm__history button,
.mm__outline-actions button {
  width: 25px;
  height: 25px;
  padding: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
}
.mm__history button:disabled {
  opacity: 0.3;
  cursor: default;
}
.mm__tool {
  height: 27px;
  padding: 0 8px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  white-space: nowrap;
}
.mm__history button:hover:not(:disabled),
.mm__tool:hover,
.mm__outline-actions button:hover,
.mm__zoom button:hover {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
  transform: translateY(-1px);
}
.mm__divider {
  display: inline-block;
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.mm__save {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #2f8cff, #1264e8);
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.28);
  font-weight: 600;
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.mm__save:hover {
  background: linear-gradient(135deg, #3d97ff, #1a6df0);
  box-shadow: 0 8px 20px rgba(22, 119, 255, 0.34);
  transform: translateY(-1px);
  filter: saturate(1.08);
}
.mm__body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.mm__outline {
  width: 292px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.mm__outline-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.mm__outline-title {
  color: var(--ent-text, #1f2733);
}
.mm__outline-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--mm-muted, #86909c);
}
.mm__outline-actions {
  margin-left: auto;
  display: flex;
  gap: 1px;
}
.mm__list {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow: auto;
}
.mm__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 2px 6px 2px 0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.14s ease, opacity 0.16s ease;
}
.mm__row:hover {
  background: rgba(255, 255, 255, 0.66);
}
.mm__row.is-selected {
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.13), rgba(255, 255, 255, 0.36));
  box-shadow: inset 2px 0 0 rgba(37, 99, 235, 0.7);
}
.mm__row.is-match {
  background: rgba(37, 99, 235, 0.1);
}
.mm__row.is-dim {
  opacity: 0.34;
}
.mm__toggle {
  width: 16px;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--mm-muted, #86909c);
  font-size: 11px;
  padding: 0;
}
.mm__toggle--empty {
  display: inline-block;
}
.mm__branch-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.72);
}
.mm__row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm__input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(37, 99, 235, 0.65);
  border-radius: 6px;
  outline: none;
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.9);
  font: inherit;
}
.mm__ops {
  display: flex;
  opacity: 0;
  transition: opacity 0.15s;
  gap: 2px;
  flex: none;
}
.mm__row:hover .mm__ops,
.mm__row.is-selected .mm__ops {
  opacity: 1;
}
.mm__op {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
  height: 20px;
  padding: 0 4px;
  border-radius: 5px;
  display: inline-grid;
  place-items: center;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}
.mm__op:hover {
  background: rgba(255, 255, 255, 0.85);
  color: var(--mm-blue, #3370ff);
  transform: translateY(-1px);
}
.mm__op--danger:hover {
  color: #ef4444;
}
.mm__op-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.15);
}
.mm__palette {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  align-items: center;
}
.mm__palette-dot {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  cursor: pointer;
}
.mm__palette-dot:hover {
  transform: scale(1.12);
}
.mm__palette-dot.is-on {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;
}
.mm__palette-dot--reset {
  background: #fff;
  color: #94a3b8;
  border-style: dashed;
  font-size: 12px;
  line-height: 1;
}
.mm__palette :deep(.el-color-picker__trigger) {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 6px;
}
.mm__canvas {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, rgba(100, 116, 139, 0.14) 1px, transparent 0) 0 0 / 22px 22px,
    radial-gradient(ellipse at 28% 18%, rgba(37, 99, 235, 0.08), transparent 55%),
    radial-gradient(ellipse at 82% 76%, rgba(124, 58, 237, 0.09), transparent 55%),
    #f8fafc;
  touch-action: none;
}
.mm__svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}
.mm__node {
  cursor: grab;
}
.mm__node:active {
  cursor: grabbing;
}
.mm__edge {
  opacity: 0.46;
  stroke-linecap: round;
  transition: opacity 0.16s ease, stroke-width 0.16s ease;
}
.mm__edge.is-active {
  opacity: 1;
  stroke-width: 2.5;
}
.mm__edge.is-dim {
  opacity: 0.07;
}
.mm__node-bg {
  transition: filter 0.16s ease, stroke-width 0.16s ease;
}
.mm__node:hover .mm__node-bg,
.mm__node.is-selected .mm__node-bg {
  stroke-width: 2;
}
.mm__node.is-match .mm__node-bg {
  stroke-width: 2.4;
}
.mm__node.is-dim {
  opacity: 0.18;
}
.mm__node-ring {
  fill: none;
  stroke-width: 2.5;
  opacity: 0.3;
}
.mm__node:hover .mm__node-ring,
.mm__node.is-selected .mm__node-ring {
  opacity: 1;
}
.mm__fold {
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.14s ease;
}
.mm__node:hover .mm__fold,
.mm__node.is-selected .mm__fold,
.mm__fold.is-collapsed {
  opacity: 1;
}
.mm__fold-pill {
  fill: #ffffff;
  stroke-width: 1.2;
}
.mm__zoom {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 4px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.64);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.mm__zoom button {
  width: 27px;
  height: 27px;
  padding: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
}
.mm__zoom > span {
  width: 42px;
  text-align: center;
  font-size: 11px;
  color: var(--ent-text-2, #5a6472);
  font-variant-numeric: tabular-nums;
}
.mm__shortcuts {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 160px);
  padding: 5px 10px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.7));
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(var(--glass-blur-sm, 10px));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm, 10px));
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.08));
  color: var(--ent-text-3, #8a94a3);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mm__current {
  color: var(--ent-text-2, #5a6472);
  font-weight: 600;
}
@keyframes mm-pulse {
  50% {
    opacity: 0.35;
  }
}
.mm__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 13px;
  pointer-events: none;
}
</style>
