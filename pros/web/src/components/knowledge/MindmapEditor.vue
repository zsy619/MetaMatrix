<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getNodeData, saveNodeData } from '../../api/knowledge'

const props = defineProps<{ projectId: string; nodeId: string }>()

interface MindNode {
  title: string
  children: MindNode[]
}
interface MindData {
  title: string
  children: MindNode[]
}

const root = ref<MindData>({ title: '中心主题', children: [] })
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

/** 展平成可编辑的行：每行带层级深度与父路径。 */
interface FlatNode {
  path: number[]
  depth: number
  node: MindNode
}

const flat = computed<FlatNode[]>(() => {
  const out: FlatNode[] = []
  const walk = (node: MindNode, path: number[], depth: number) => {
    out.push({ path, depth, node })
    node.children.forEach((child, index) => walk(child, [...path, index], depth + 1))
  }
  if (root.value) walk(root.value, [], 0)
  return out
})

async function load() {
  loading.value = true
  try {
    const res = await getNodeData(props.projectId, props.nodeId)
    const data = res.data as MindData
    if (data && typeof data.title === 'string') root.value = data
  } catch {
    ElMessage.error('加载导图失败')
  } finally {
    loading.value = false
  }
}

function nodeAt(path: number[]): MindNode | null {
  let current: MindNode | null = root.value
  for (const index of path) {
    if (!current) return null
    current = current.children[index] ?? null
  }
  return current
}

function parentOf(path: number[]): MindNode | null {
  if (path.length === 0) return null
  return nodeAt(path.slice(0, -1))
}

function addChild(path: number[]) {
  const parent = nodeAt(path)
  if (!parent) return
  parent.children.push({ title: '新分支', children: [] })
  dirty.value = true
}

function addSibling(path: number[]) {
  const parent = parentOf(path)
  if (!parent) return
  const index = path[path.length - 1]
  parent.children.splice(index + 1, 0, { title: '新分支', children: [] })
  dirty.value = true
}

function removeNode(path: number[]) {
  const parent = parentOf(path)
  if (!parent) return
  parent.children.splice(path[path.length - 1], 1)
  dirty.value = true
}

/** 右移：变成前一个兄弟节点的最后一个子节点。 */
function indent(path: number[]) {
  const parent = parentOf(path)
  if (!parent) return
  const index = path[path.length - 1]
  const prev = parent.children[index - 1]
  if (!prev) return
  const [moved] = parent.children.splice(index, 1)
  prev.children.push(moved)
  dirty.value = true
}

/** 左移：变成父节点的后一个兄弟节点。 */
function outdent(path: number[]) {
  const parent = parentOf(path)
  const grand = parentOf(path.slice(0, -1))
  if (!parent || !grand) return
  const index = path[path.length - 1]
  const parentIndex = grand.children.indexOf(parent)
  if (parentIndex < 0) return
  const [moved] = parent.children.splice(index, 1)
  grand.children.splice(parentIndex + 1, 0, moved)
  dirty.value = true
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await saveNodeData(props.projectId, props.nodeId, 'mindmap', root.value)
    dirty.value = false
    ElMessage.success('思维导图已保存')
  } catch {
    ElMessage.error('保存导图失败')
  } finally {
    saving.value = false
  }
}

/** 预览布局：横向树，父节点在左，子节点依次向右。 */
interface PreviewNode {
  x: number
  y: number
  title: string
  depth: number
}
const preview = computed<PreviewNode[]>(() => {
  const out: PreviewNode[] = []
  let y = 24
  const walk = (node: MindNode, depth: number) => {
    out.push({ x: 24 + depth * 150, y, title: node.title, depth })
    y += 34
    node.children.forEach((child) => walk(child, depth + 1))
  }
  if (root.value) walk(root.value, 0)
  return out
})

watch(() => props.nodeId, load)
onMounted(load)
</script>

<template>
  <section class="mindmap">
    <header class="mindmap__head">
      <span class="mindmap__title">思维导图</span>
      <span v-if="dirty" class="mindmap__dirty">未保存</span>
      <div class="mindmap__actions">
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </header>
    <div class="mindmap__body">
      <div v-if="loading" class="mindmap__empty">加载中…</div>
      <div v-else class="mindmap__editor">
        <div v-for="item in flat" :key="item.path.join('-')" class="mindmap__row" :style="{ paddingLeft: `${item.depth * 20}px` }">
          <input
            v-model="item.node.title"
            class="mindmap__input"
            @input="dirty = true"
          />
          <el-button link size="small" @click="addChild(item.path)">子节点</el-button>
          <el-button link size="small" :disabled="item.depth === 0" @click="addSibling(item.path)">同级</el-button>
          <el-button link size="small" :disabled="item.depth === 0" @click="outdent(item.path)">左移</el-button>
          <el-button link size="small" :disabled="item.depth === 0" @click="indent(item.path)">右移</el-button>
          <el-button link size="small" :disabled="item.depth === 0" @click="removeNode(item.path)">删除</el-button>
        </div>
        <el-button size="small" @click="addChild([])">添加分支</el-button>
      </div>
      <aside class="mindmap__preview">
        <h4>预览</h4>
        <svg :width="360" :height="Math.max(120, preview.length * 34 + 24)" class="mindmap__svg">
          <g v-for="(item, index) in preview" :key="index">
            <circle :cx="item.x" :cy="item.y" r="6" fill="#1677ff" />
            <text :x="item.x + 12" :y="item.y + 4" font-size="12" fill="#1d2129">
              {{ item.title || '未命名' }}
            </text>
          </g>
        </svg>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.mindmap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--mm-surface, #fff);
}
.mindmap__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.mindmap__title {
  font-size: 16px;
  font-weight: 600;
}
.mindmap__dirty {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.mindmap__actions {
  margin-left: auto;
}
.mindmap__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.mindmap__editor {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 12px 16px;
}
.mindmap__row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}
.mindmap__input {
  flex: 1;
  min-width: 120px;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 6px;
  font: inherit;
}
.mindmap__input:focus {
  border-color: var(--mm-blue, #1677ff);
  outline: none;
}
.mindmap__preview {
  flex: none;
  width: 380px;
  border-left: 1px solid var(--mm-line, #e5e6eb);
  padding: 12px 16px;
  overflow: auto;
}
.mindmap__preview h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--mm-muted, #86909c);
}
.mindmap__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
}
</style>
