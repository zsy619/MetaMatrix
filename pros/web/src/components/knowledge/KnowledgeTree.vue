<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import type { KnowledgeNode, KnowledgeTemplate } from '../../api/knowledge'
import { updateDocument } from '../../api/documents'

const props = defineProps<{ projectId: string; activeDocumentId?: string }>()
const emit = defineEmits<{
  'open-doc': [node: KnowledgeNode]
  /** 表格 / 导图这类没有文档正文的节点：交给右侧编辑器接管。 */
  'open-node': [node: KnowledgeNode]
  renamed: [documentId: string, title: string]
  home: []
  graph: []
}>()

const nodes = ref<KnowledgeNode[]>([])
const trashNodes = ref<KnowledgeNode[]>([])
const templates = ref<KnowledgeTemplate[]>([])
const loading = ref(false)
const error = ref('')
const view = ref<'all' | 'favorite' | 'trash'>('all')
const selectedIds = ref<string[]>([])

interface TreeNode {
  id: string
  node: KnowledgeNode
  children?: TreeNode[]
}

/** el-tree 拖拽回调里的节点：只声明落点计算用到的字段。 */
interface DropTarget {
  data: TreeNode
  parent: DropTarget | null
  childNodes: DropTarget[]
}

const visibleNodes = computed(() =>
  view.value === 'favorite' ? nodes.value.filter((n) => n.favorite) : nodes.value,
)
const treeData = computed<TreeNode[]>(() => buildTree(visibleNodes.value))
const currentKey = computed(
  () => nodes.value.find((n) => n.documentId && n.documentId === props.activeDocumentId)?.id,
)

function buildTree(list: KnowledgeNode[]): TreeNode[] {
  const byParent = new Map<string | null, KnowledgeNode[]>()
  for (const n of list) {
    const key = n.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(n)
  }
  const make = (parentId: string | null): TreeNode[] => {
    const kids = byParent.get(parentId) || []
    kids.sort((a, b) => a.sortOrder - b.sortOrder)
    // 不读 title：改标题只重绘那一行，不会重建整棵树把折叠状态冲掉。
    return kids.map((n) => ({ id: n.id, node: n, children: make(n.id) }))
  }
  return make(null)
}

/** 模板按分类分组（飞书模板中心按场景分组）。 */
const templateGroups = computed(() => {
  const groups = new Map<string, KnowledgeTemplate[]>()
  for (const tpl of templates.value) {
    const key = tpl.category || '通用'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tpl)
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})

/** 下拉里用的扁平列表：分组名作为禁用分隔项。 */
const flatTemplates = computed(() =>
  templateGroups.value.flatMap((group) => [
    { kind: 'group' as const, key: group.name, label: group.name, template: null },
    ...group.items.map((tpl) => ({
      kind: 'item' as const,
      key: tpl.id,
      label: tpl.label,
      template: tpl,
    })),
  ]),
)

/** 空间检索：支持关键词、节点类型与作者筛选。 */
const searchQuery = ref('')
const searchHits = ref<knowledgeApi.KnowledgeSearchHit[]>([])
const searching = ref(false)
const searchType = ref<'all' | 'doc' | 'sheet' | 'mindmap' | 'folder'>('all')
const searchAuthor = ref('')
const authors = ref<{ id: string; name: string }[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
}

async function runSearch() {
  searching.value = true
  const seq = ++searchSeq
  try {
    const hits = await knowledgeApi.searchKnowledgeSpace(props.projectId, {
      q: searchQuery.value.trim(),
      nodeType: searchType.value === 'all' ? '' : searchType.value,
      authorId: searchAuthor.value || '',
      limit: 30,
    })
    if (seq !== searchSeq) return
    searchHits.value = hits
  } catch {
    if (seq === searchSeq) searchHits.value = []
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

/** 作者下拉：拿全量节点去重出贡献人。 */
async function loadAuthors() {
  try {
    const hits = await knowledgeApi.searchKnowledgeSpace(props.projectId, { limit: 100 })
    const seen = new Map<string, string>()
    for (const hit of hits) {
      if (hit.authorId && hit.author) seen.set(hit.authorId, hit.author)
    }
    authors.value = [...seen.entries()].map(([id, name]) => ({ id, name }))
  } catch {
    authors.value = []
  }
}

function openSearchHit(hit: knowledgeApi.KnowledgeSearchHit) {
  const node: KnowledgeNode = {
    id: hit.nodeId,
    documentId: hit.documentId || null,
    nodeType: hit.nodeType as KnowledgeNode['nodeType'],
    title: hit.title,
    sortOrder: 0,
    icon: '📄',
    alias: '',
    summary: hit.summary,
    favorite: false,
    locked: false,
    trashedAt: null,
    archivedAt: null,
    projectId: props.projectId,
    parentId: null,
    createdAt: hit.updatedAt,
    updatedAt: hit.updatedAt,
  }
  if (hit.documentId) emit('open-doc', node)
  else emit('open-node', node)
  searchQuery.value = ''
  searchHits.value = []
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    nodes.value = await knowledgeApi.getKnowledgeTree(props.projectId)
    if (view.value === 'trash') trashNodes.value = await knowledgeApi.listTrash(props.projectId)
  } catch {
    error.value = '加载目录失败'
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  try {
    templates.value = await knowledgeApi.listTemplates(props.projectId)
  } catch {
    templates.value = []
  }
}

watch(
  () => props.projectId,
  () => {
    void load()
    void loadTemplates()
    void loadAuthors()
  },
  { immediate: true },
)

watch(view, () => void load())

/** 右侧编辑器改标题时实时回写左侧；落库由文档保存负责，目录树读的就是文档标题。 */
function setDocTitle(documentId: string, title: string) {
  const node = nodes.value.find((n) => n.documentId === documentId)
  if (node) node.title = title.trim() || '无标题'
}

function docIcon(documentId: string) {
  return nodes.value.find((n) => n.documentId === documentId)?.icon ?? ''
}

/** 文档头部换图标：图标存在节点上，改完原地更新那一行；空串由后端回落到默认图标。 */
async function setDocIcon(documentId: string, icon: string) {
  const node = nodes.value.find((n) => n.documentId === documentId)
  if (!node) return
  try {
    const updated = await knowledgeApi.updateKnowledgeNode(props.projectId, node.id, { icon })
    node.icon = updated.icon
  } catch {
    ElMessage.error('修改图标失败')
  }
}

defineExpose({ setDocTitle, docIcon, setDocIcon })

function onNodeClick(data: TreeNode) {
  if (data.node.documentId) {
    emit('open-doc', data.node)
    return
  }
  if (data.node.nodeType === 'sheet' || data.node.nodeType === 'mindmap') {
    emit('open-node', data.node)
  }
}

/** 从模板建文档：createDocWithNode 建空文档，非空模板再 updateDocument 注入预设 HTML。 */
async function addDocWithTemplate(parentId: string | null, title: string, html: string) {
  const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
    parentId,
    nodeType: 'doc',
    title,
    createDoc: true,
  })
  if (html && node.documentId) {
    await updateDocument(node.documentId, {
      title,
      currentData: { type: 'doc', html } as never,
      operationId: `doc-template-${node.documentId}-${Date.now()}`,
    })
  }
  ElMessage.success('已创建')
  await load()
  emit('open-doc', node)
  return node
}

/** 新建表格 / 导图等结构化节点：没有文档正文，直接交给右侧编辑器。 */
async function addStructuredNode(parentId: string | null, nodeType: 'sheet' | 'mindmap' | 'folder') {
  const labels: Record<string, string> = { sheet: '多维表格', mindmap: '思维导图', folder: '文件夹' }
  try {
    const { value } = await ElMessageBox.prompt('名称', `新建${labels[nodeType]}`, {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: `未命名${labels[nodeType]}`,
      inputValidator: (i) => (i && i.trim() ? true : '请输入名称'),
    })
    const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
      parentId,
      nodeType,
      title: value.trim(),
    })
    ElMessage.success('已创建')
    await load()
    emit('open-node', node)
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error('创建失败')
  }
}

/** 导入 Word / Excel / Markdown / 纯文本。 */
const fileInput = ref<HTMLInputElement | null>(null)

function pickFile() {
  fileInput.value?.click()
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const node = await knowledgeApi.importKnowledgeFile(props.projectId, file, null)
    ElMessage.success(`已导入：${node.title}`)
    await load()
    emit('open-doc', node)
  } catch {
    ElMessage.error('导入失败，仅支持 Word / Excel / Markdown / 纯文本')
  }
}

/** 从飞书知识空间导入（需要配置飞书应用凭证）。 */
async function importFromFeishu() {
  try {
    const { value } = await ElMessageBox.prompt('飞书知识空间 token', '从飞书导入', {
      confirmButtonText: '导入',
      cancelButtonText: '取消',
      inputPlaceholder: '例如 7xxxxxxxxxxxx',
    })
    const res = await knowledgeApi.importFeishuSpace(props.projectId, value.trim())
    ElMessage.success(`已导入 ${res.imported} 个文档`)
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error('飞书导入失败，请检查应用凭证与空间权限')
  }
}

async function addDoc(parentId: string | null, tpl?: KnowledgeTemplate) {
  try {
    await addDocWithTemplate(parentId, tpl?.label || '无标题文档', tpl?.html || '')
  } catch {
    ElMessage.error('创建失败')
  }
}

async function renameNode(node: KnowledgeNode) {
  try {
    const { value } = await ElMessageBox.prompt('名称', '重命名', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: node.title,
      inputValidator: (i) => (i && i.trim() ? true : '请输入名称'),
    })
    const title = value.trim()
    await knowledgeApi.updateKnowledgeNode(props.projectId, node.id, { title })
    if (node.documentId) emit('renamed', node.documentId, title)
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error('重命名失败')
  }
}

/** 删除改为进回收站：节点可恢复，文档内容始终保留。 */
async function trashNode(node: KnowledgeNode) {
  try {
    await ElMessageBox.confirm(
      '节点会移入回收站，可随时恢复；文档内容仍保留在项目中。',
      '移入回收站？',
      { confirmButtonText: '移入回收站', cancelButtonText: '取消', type: 'warning' },
    )
    await knowledgeApi.updateNodeMeta(props.projectId, node.id, { trashed: true })
    ElMessage.success('已移入回收站')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error('操作失败')
  }
}

async function toggleFavorite(node: KnowledgeNode) {
  await knowledgeApi.updateNodeMeta(props.projectId, node.id, { favorite: !node.favorite })
  await load()
}

async function copyNode(node: KnowledgeNode) {
  await knowledgeApi.copyNode(props.projectId, node.id, node.parentId)
  ElMessage.success('已复制')
  await load()
}

async function archiveNode(node: KnowledgeNode) {
  await knowledgeApi.updateNodeMeta(props.projectId, node.id, { archived: true })
  ElMessage.success('已归档')
  await load()
}

async function restoreNode(node: KnowledgeNode) {
  await knowledgeApi.updateNodeMeta(props.projectId, node.id, { trashed: false })
  ElMessage.success('已恢复')
  await load()
}

async function purgeNode(node: KnowledgeNode) {
  await ElMessageBox.confirm('彻底删除后不可恢复。', '确认彻底删除？', {
    confirmButtonText: '彻底删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  await knowledgeApi.purgeNode(props.projectId, node.id)
  ElMessage.success('已彻底删除')
  await load()
}

function onSelectionChange(selection: TreeNode[]) {
  selectedIds.value = selection.map((item) => item.id)
}

async function batch(op: string, value = '') {
  if (!selectedIds.value.length) return
  await knowledgeApi.batchKnowledgeNodes(props.projectId, {
    ids: selectedIds.value,
    op,
    value,
  })
  ElMessage.success(`已处理 ${selectedIds.value.length} 个节点`)
  selectedIds.value = []
  await load()
}

async function onDrop(dragging: DropTarget, drop: DropTarget, dropType: 'before' | 'after' | 'inner') {
  // 回调触发时 el-tree 已把节点插到新位置，落点所在那一层的 childNodes 就是新顺序。
  const inner = dropType === 'inner'
  const siblings = (inner ? drop : drop.parent)?.childNodes ?? []
  try {
    await knowledgeApi.moveKnowledgeNode(props.projectId, dragging.data.id, {
      parentId: inner ? drop.data.id : drop.data.node.parentId,
    })
    await knowledgeApi.reorderKnowledgeNodes(
      props.projectId,
      siblings.map((sibling) => sibling.data.id),
    )
  } catch {
    ElMessage.error('移动失败')
  }
  await load()
}

/** 右键菜单：与飞书一致的动作集合。 */
async function onContext(cmd: string, node: KnowledgeNode) {
  if (cmd === 'child') return addDoc(node.id)
  if (cmd === 'sibling') return addDoc(node.parentId)
  if (cmd === 'rename') return renameNode(node)
  if (cmd === 'favorite') return toggleFavorite(node)
  if (cmd === 'copy') return copyNode(node)
  if (cmd === 'archive') return archiveNode(node)
  if (cmd === 'trash') return trashNode(node)
}

/** 新建下拉命令分发。 */
function onCreateCommand(cmd: string) {
  if (cmd === 'folder') return addStructuredNode(null, 'folder')
  if (cmd === 'sheet') return addStructuredNode(null, 'sheet')
  if (cmd === 'mindmap') return addStructuredNode(null, 'mindmap')
  if (cmd === 'import') return pickFile()
  if (cmd === 'feishu') return importFromFeishu()
}

/** Cmd/Ctrl+K 聚焦搜索框：飞书的全局搜索入口。 */
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('.kn-tree__search input')?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <aside class="kn-tree">
    <div class="kn-tree__head">
      <span class="kn-tree__title">知识库</span>
      <div class="kn-tree__actions">
        <el-button size="small" text @click="emit('home')">概览</el-button>
        <el-button size="small" text @click="emit('graph')">图谱</el-button>
        <el-dropdown trigger="click" @command="(cmd: string) => onCreateCommand(cmd)">
          <el-button size="small" text>+ 新建</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="folder">📁 文件夹</el-dropdown-item>
              <el-dropdown-item command="sheet">📊 多维表格</el-dropdown-item>
              <el-dropdown-item command="mindmap">🧠 思维导图</el-dropdown-item>
              <el-dropdown-item command="import" divided>⬆️ 导入 Word / Excel / Markdown</el-dropdown-item>
              <el-dropdown-item command="feishu">🛫 从飞书知识空间导入</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="(tpl: KnowledgeTemplate) => addDoc(null, tpl)">
          <el-button size="small" text>📄 文档</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="entry in flatTemplates"
                :key="entry.key"
                :command="entry.template"
                :disabled="entry.kind === 'group'"
              >
                <span v-if="entry.kind === 'group'" class="kn-tree__group">{{ entry.label }}</span>
                <span v-else>{{ entry.template?.icon }} {{ entry.label }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="kn-tree__views">
      <el-radio-group v-model="view" size="small">
        <el-radio-button value="all">目录</el-radio-button>
        <el-radio-button value="favorite">收藏</el-radio-button>
        <el-radio-button value="trash">回收站</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="view !== 'trash'" class="kn-tree__search">
      <el-input
        v-model="searchQuery"
        placeholder="搜索文档…（⌘K）"
        size="small"
        clearable
        @input="onSearchInput"
      />
      <div class="kn-tree__filters">
        <el-select v-model="searchType" size="small">
          <el-option label="全部类型" value="all" />
          <el-option label="知识库文档" value="doc" />
          <el-option label="多维表格" value="sheet" />
          <el-option label="思维导图" value="mindmap" />
          <el-option label="文件夹" value="folder" />
        </el-select>
        <el-select v-model="searchAuthor" size="small" clearable placeholder="作者">
          <el-option label="全部作者" value="" />
          <el-option v-for="author in authors" :key="author.id" :label="author.name" :value="author.id" />
        </el-select>
      </div>
      <ul v-if="searchHits.length" class="kn-tree__hits">
        <li
          v-for="hit in searchHits"
          :key="hit.nodeId"
          class="kn-tree__hit"
          @click="openSearchHit(hit)"
        >
          <span class="kn-tree__hit-title">
            {{ hit.title }}
            <span v-if="hit.author" class="kn-tree__hit-author">{{ hit.author }}</span>
          </span>
          <span class="kn-tree__hit-snippet" v-if="hit.snippet">{{ hit.snippet }}</span>
        </li>
      </ul>
    </div>

    <div v-if="selectedIds.length" class="kn-tree__batch">
      <span>已选 {{ selectedIds.length }} 项</span>
      <el-button size="small" text @click="batch('favorite', 'on')">收藏</el-button>
      <el-button size="small" text @click="batch('archive', 'on')">归档</el-button>
      <el-button size="small" text @click="batch('trash')">移入回收站</el-button>
    </div>

    <p v-if="error" class="kn-tree__error">{{ error }}</p>
    <p v-if="loading && !nodes.length" class="kn-tree__empty">加载中…</p>

    <!-- 回收站 -->
    <div v-else-if="view === 'trash'" class="kn-tree__trash">
      <p v-if="!trashNodes.length" class="kn-tree__empty">回收站是空的。</p>
      <div v-for="node in trashNodes" :key="node.id" class="kn-tree__trash-row">
        <span class="kn-tree__node-icon">{{ node.icon }}</span>
        <span class="kn-tree__node-label">{{ node.title }}</span>
        <el-button size="small" text @click="restoreNode(node)">恢复</el-button>
        <el-button size="small" text type="danger" @click="purgeNode(node)">彻底删除</el-button>
      </div>
    </div>

    <p v-else-if="!nodes.length" class="kn-tree__empty">空知识库。点上方按钮新建。</p>

    <el-tree
      v-else
      :data="treeData"
      node-key="id"
      draggable
      multiple
      highlight-current
      :current-node-key="currentKey"
      @node-drop="onDrop"
      @node-click="onNodeClick"
      @selection-change="onSelectionChange"
      :expand-on-click-node="false"
      default-expand-all
    >
      <template #default="{ data }">
        <el-dropdown trigger="contextmenu" @command="(cmd: string) => onContext(cmd, data.node)">
          <div class="kn-tree__node">
            <span class="kn-tree__node-icon">{{ data.node.icon }}</span>
            <span
              class="kn-tree__node-label"
              :class="{ 'is-stale': data.node.nodeType === 'doc' && !data.node.documentId }"
              :title="data.node.summary || data.node.title"
            >
              {{ data.node.title }}
              <span v-if="data.node.alias" class="kn-tree__alias">@{{ data.node.alias }}</span>
            </span>
            <span class="kn-tree__node-tools">
              <button
                type="button"
                class="kn-tree__more"
                title="新建子文档"
                aria-label="新建子文档"
                @click.stop="addDoc(data.node.id)"
              >+</button>
              <button
                type="button"
                class="kn-tree__star"
                :class="{ 'is-on': data.node.favorite }"
                :title="data.node.favorite ? '取消收藏' : '收藏'"
                aria-label="收藏"
                @click.stop="toggleFavorite(data.node)"
              >★</button>
              <el-dropdown trigger="click" @click.stop>
                <span class="kn-tree__more">⋯</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="renameNode(data.node)">重命名</el-dropdown-item>
                    <el-dropdown-item @click="toggleFavorite(data.node)">
                      {{ data.node.favorite ? '取消收藏' : '收藏' }}
                    </el-dropdown-item>
                    <el-dropdown-item @click="copyNode(data.node)">复制节点</el-dropdown-item>
                    <el-dropdown-item @click="archiveNode(data.node)" divided>归档</el-dropdown-item>
                    <el-dropdown-item @click="trashNode(data.node)">
                      <span style="color: var(--el-color-danger)">移入回收站</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="child">新建子文档</el-dropdown-item>
              <el-dropdown-item command="sibling">新建同级文档</el-dropdown-item>
              <el-dropdown-item command="rename" divided>重命名</el-dropdown-item>
              <el-dropdown-item command="favorite">
                {{ data.node.favorite ? '取消收藏' : '收藏' }}
              </el-dropdown-item>
              <el-dropdown-item command="copy">复制节点</el-dropdown-item>
              <el-dropdown-item command="archive" divided>归档</el-dropdown-item>
              <el-dropdown-item command="trash">
                <span style="color: var(--el-color-danger)">移入回收站</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-tree>

    <input
      ref="fileInput"
      type="file"
      class="kn-tree__file"
      accept=".docx,.xlsx,.md,.markdown,.txt,.html,.htm"
      @change="onFilePicked"
    />
  </aside>
</template>

<style scoped>
.kn-tree {
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--mm-surface, #fff);
}
.kn-tree__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.kn-tree__title { font-size: 14px; font-weight: 600; color: var(--mm-text, #1d2129); }
.kn-tree__actions { display: flex; gap: 2px; }
.kn-tree__views { padding: 8px 10px 0; }
.kn-tree__search { padding: 6px 10px 8px; position: relative; }
.kn-tree__filters { display: flex; gap: 6px; margin-top: 6px; }
.kn-tree__filters :deep(.el-select) { flex: 1; }
.kn-tree__group { font-size: 11px; color: var(--mm-muted, #86909c); }
.kn-tree__hits {
  list-style: none; margin: 6px 0 0; padding: 0;
  max-height: 240px; overflow: auto;
  border: 1px solid var(--mm-line, #e5e6eb); border-radius: 6px;
  background: var(--mm-surface, #fff);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  position: relative; z-index: 2;
}
.kn-tree__hit { padding: 6px 10px; cursor: pointer; border-bottom: 1px solid var(--mm-line, #f2f3f5); }
.kn-tree__hit:last-child { border-bottom: none; }
.kn-tree__hit:hover { background: var(--mm-hover, #f2f3f5); }
.kn-tree__hit-title { display: block; font-size: 13px; color: var(--mm-text, #1d2129); }
.kn-tree__hit-author {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
}
.kn-tree__file { display: none; }
.kn-tree__hit-snippet { display: block; font-size: 11px; color: var(--mm-muted, #86909c); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kn-tree__batch {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; font-size: 12px; color: var(--mm-muted, #86909c);
  background: var(--mm-hover, #f2f3f5);
}
.kn-tree__error, .kn-tree__empty { padding: 16px 14px; font-size: 13px; color: var(--mm-muted, #86909c); }
.kn-tree__error { color: var(--el-color-danger); }
.kn-tree__trash { flex: 1; overflow: auto; }
.kn-tree__trash-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-bottom: 1px solid var(--mm-line, #f2f3f5);
}
.kn-tree :deep(.el-tree) { flex: 1; overflow: auto; padding: 4px 8px; }
.kn-tree__node { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.kn-tree__node-icon { flex: none; width: 18px; text-align: center; }
.kn-tree__node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.kn-tree__node-label.is-stale { color: var(--mm-muted, #86909c); text-decoration: line-through; }
.kn-tree__alias { color: var(--mm-muted, #86909c); font-size: 11px; margin-left: 4px; }
.kn-tree__node-tools { display: flex; align-items: center; opacity: 0; transition: opacity 0.15s; }
.kn-tree__node:hover .kn-tree__node-tools,
.kn-tree__node-tools:focus-within { opacity: 1; }
.kn-tree__more, .kn-tree__star {
  cursor: pointer; font-size: 14px; color: var(--mm-muted, #86909c);
  padding: 0 4px; border: 0; background: none;
}
.kn-tree__star.is-on { color: #f5a623; opacity: 1; }
</style>
