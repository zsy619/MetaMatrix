<script setup lang="ts">
/**
 * 思维导图（KityMinder 式）：左侧大纲、右侧导图，双向联动。
 *
 * 数据是 nodeGraph 的 nodes/edges 存进 knowledge_node_data（kind=mindmap），
 * 自动布局复用 nodeGraph 的 computeLayout。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getNodeData, saveNodeData } from '../../api/knowledge'
import type { LayoutMode } from '../../components/canvas/nodeGraph/layout'
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

const COLORS = ['#3370ff', '#00b96b', '#ff9900', '#f5222d', '#722ed1', '#13c2c2']

const doc = ref<MindmapDoc>(emptyMindmap())
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const layoutMode = ref<LayoutMode>('mindmap')
const selectedId = ref('')
const editingId = ref('')
const zoom = ref(1)
const offset = ref({ x: 40, y: 40 })
const fileInput = ref<HTMLInputElement | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
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
/** 折叠节点的子树在图上不画。 */
const hiddenIds = computed(() => {
  const hide = new Set<string>()
  for (const node of doc.value.nodes) {
    if (!node.collapsed) continue
    for (const id of subtreeIds(doc.value, node.id)) hide.add(id)
  }
  return hide
})
const visibleNodes = computed(() => doc.value.nodes.filter((n) => !hiddenIds.value.has(n.id)))
const visibleEdges = computed(() =>
  doc.value.edges.filter((e) => !hiddenIds.value.has(e.source) && !hiddenIds.value.has(e.target)),
)

async function load() {
  loading.value = true
  try {
    const res = await getNodeData(props.projectId, props.nodeId)
    doc.value = migrateMindmap(res.data)
    selectedId.value = doc.value.nodes[0]?.id ?? ''
    relayout()
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

function onPickColor(id: string) {
  const node = nodeById.value.get(id)
  if (!node) return
  const index = COLORS.indexOf(node.color ?? '')
  node.color = COLORS[(index + 1) % COLORS.length]
  commit(false)
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
  const next = Math.min(2.5, Math.max(0.3, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)))
  const ratio = next / zoom.value
  offset.value = { x: cx - (cx - offset.value.x) * ratio, y: cy - (cy - offset.value.y) * ratio }
  zoom.value = next
}

function fitView() {
  const el = canvasEl.value
  if (!el || !doc.value.nodes.length) return
  const rect = el.getBoundingClientRect()
  const minX = Math.min(...doc.value.nodes.map((n) => n.x))
  const minY = Math.min(...doc.value.nodes.map((n) => n.y))
  const maxX = Math.max(...doc.value.nodes.map((n) => n.x + n.width))
  const maxY = Math.max(...doc.value.nodes.map((n) => n.y + n.height))
  const scale = Math.min(
    1.6,
    Math.max(0.3, Math.min((rect.width - 80) / (maxX - minX || 1), (rect.height - 80) / (maxY - minY || 1))),
  )
  zoom.value = scale
  offset.value = {
    x: 40 - minX * scale + ((rect.width - (maxX - minX) * scale) / 2 - 40) / 1,
    y: 40 - minY * scale,
  }
}

function zoomBy(delta: number) {
  zoom.value = Math.min(2.5, Math.max(0.3, zoom.value + delta))
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
  }
  if (event.key === 'Escape') editingId.value = ''
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

/** 边：父节点右边缘 → 子节点左边缘的贝塞尔曲线。 */
function edgePath(sourceId: string, targetId: string): string {
  const s = nodeById.value.get(sourceId)
  const t = nodeById.value.get(targetId)
  if (!s || !t) return ''
  const x1 = s.x + s.width
  const y1 = s.y + s.height / 2
  const x2 = t.x
  const y2 = t.y + t.height / 2
  if (x2 >= x1) {
    const dx = Math.max(30, (x2 - x1) / 2)
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }
  const dx = Math.max(30, (x1 - x2) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

function nodeFill(nodeId: string): string {
  const node = nodeById.value.get(nodeId)
  if (node?.color) return `${node.color}1f`
  return node?.id === doc.value.nodes[0]?.id ? '#e8f1ff' : '#ffffff'
}

function nodeStroke(nodeId: string): string {
  const node = nodeById.value.get(nodeId)
  if (node?.color) return node.color
  return node?.id === doc.value.nodes[0]?.id ? '#3370ff' : '#c9cdd4'
}

function shortText(text: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 24) / 14))
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<template>
  <section class="mm">
    <header class="mm__bar">
      <span class="mm__icon">🧠</span>
      <input
        class="mm__title"
        :value="doc.title"
        placeholder="中心主题"
        maxlength="120"
        @input="doc.title = ($event.target as HTMLInputElement).value; commit(false)"
      />
      <span class="mm__status">
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else class="is-saved">已保存</span>
      </span>

      <div class="mm__tools">
        <el-select v-model="layoutMode" size="small" class="mm__layout" @change="relayout(); commit()">
          <el-option v-for="l in LAYOUTS" :key="l.mode" :label="l.label" :value="l.mode" />
        </el-select>
        <el-button size="small" @click="fitView">适应视图</el-button>
        <el-button size="small" text @click="zoomBy(0.1)">＋</el-button>
        <el-button size="small" text @click="zoomBy(-0.1)">－</el-button>
        <el-button size="small" @click="triggerImport">导入</el-button>
        <el-dropdown trigger="click" @command="(k: string) => exportAs(k as 'md')">
          <el-button size="small">导出</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="md">Markdown 大纲 (.md)</el-dropdown-item>
              <el-dropdown-item command="mm">FreeMind (.mm)</el-dropdown-item>
              <el-dropdown-item command="opml">OPML (.opml)</el-dropdown-item>
              <el-dropdown-item command="xmind">XMind (.xmind)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
      <input ref="fileInput" type="file" accept=".md,.mm,.opml,.xmind" hidden @change="onFilePicked" />
    </header>

    <div class="mm__body">
      <aside class="mm__outline">
        <div class="mm__outline-head">
          <span>大纲</span>
          <span class="mm__outline-count">{{ rows.length }} 个节点</span>
        </div>
        <ul class="mm__list">
          <li
            v-for="row in rows"
            :key="row.node.id"
            class="mm__row"
            :class="{ 'is-selected': row.node.id === selectedId }"
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
              <button type="button" title="添加子节点" @click.stop="onChild(row.node.id)">＋子</button>
              <button type="button" title="添加同级节点" @click.stop="onSibling(row.node.id)">＋同</button>
              <button type="button" title="升级" @click.stop="onOutdent(row.node.id)">←</button>
              <button type="button" title="降级" @click.stop="onIndent(row.node.id)">→</button>
              <button type="button" title="上移" @click.stop="onMove(row.node.id, -1)">↑</button>
              <button type="button" title="下移" @click.stop="onMove(row.node.id, 1)">↓</button>
              <button type="button" title="换色" @click.stop="onPickColor(row.node.id)">🎨</button>
              <button type="button" title="删除" @click.stop="onRemove(row.node.id)">✕</button>
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
          <g :transform="`translate(${offset.x}, ${offset.y}) scale(${zoom})`">
            <path
              v-for="edge in visibleEdges"
              :key="edge.id"
              :d="edgePath(edge.source, edge.target)"
              fill="none"
              stroke="#c9cdd4"
              stroke-width="1.5"
            />
            <g
              v-for="node in visibleNodes"
              :key="node.id"
              class="mm__node"
              :class="{ 'is-selected': node.id === selectedId }"
              @pointerdown="onNodePointerDown($event, node.id)"
              @dblclick.stop="startEdit(node.id)"
            >
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="node.height"
                rx="8"
                :fill="nodeFill(node.id)"
                :stroke="nodeStroke(node.id)"
                stroke-width="1.5"
              />
              <text
                :x="node.x + 12"
                :y="node.y + node.height / 2 + 5"
                font-size="13"
                fill="#1d2129"
              >{{ shortText(node.title, node.width) }}</text>
              <title>{{ node.title }}</title>
            </g>
          </g>
        </svg>
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
  display: flex;
  flex-direction: column;
  background: var(--mm-surface, #fff);
  overflow: hidden;
}
.mm__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.mm__icon {
  font-size: 16px;
}
.mm__title {
  width: 220px;
  border: none;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
  background: transparent;
}
.mm__title:focus {
  border-bottom: 2px solid var(--mm-blue, #3370ff);
}
.mm__status {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.mm__status .is-saved {
  color: var(--el-color-success);
}
.mm__tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.mm__layout {
  width: 130px;
}
.mm__body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.mm__outline {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--mm-line, #e5e6eb);
  background: var(--mm-surface, #fff);
}
.mm__outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.mm__outline-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--mm-muted, #86909c);
}
.mm__list {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow: auto;
}
.mm__row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 0;
  font-size: 13px;
  cursor: pointer;
}
.mm__row:hover {
  background: var(--mm-hover, #f2f3f5);
}
.mm__row.is-selected {
  background: rgba(51, 112, 255, 0.1);
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
  border: 1px solid var(--mm-blue, #3370ff);
  border-radius: 4px;
  outline: none;
  padding: 1px 4px;
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
.mm__ops button {
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
  padding: 1px 3px;
}
.mm__ops button:hover {
  color: var(--mm-blue, #3370ff);
}
.mm__canvas {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: var(--mm-page, #f7f7f7);
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
.mm__node.is-selected rect {
  stroke-width: 2.5;
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
