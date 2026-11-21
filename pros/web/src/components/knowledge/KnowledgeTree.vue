<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import type { KnowledgeNode, KnowledgeTemplate } from '../../api/knowledge'
import { createDocument, updateDocument } from '../../api/documents'
import { useAuthStore } from '../../stores/auth'
import {
  CATEGORY_LABELS,
  TEMPLATE_META,
  TEMPLATES,
  type TemplateCategory,
  type TemplateId,
} from '../../stores/document'
import MenuCascade from './MenuCascade.vue'
import type { MenuAnchor, MenuNode } from './MenuCascade.vue'
import { RTE_DOC_TEMPLATES, RTE_DOC_TEMPLATE_GROUPS } from '../rteDocTemplates'
import ProjectEmojiPicker from '../project/ProjectEmojiPicker.vue'

const props = defineProps<{ projectId: string; activeDocumentId?: string }>()
const router = useRouter()
const auth = useAuthStore()
const emit = defineEmits<{
  /** 打开文档；第二个参数是需要在文档里插入的编辑器模板 id。 */
  'open-doc': [node: KnowledgeNode, editorTemplateId?: string]
  /** 表格 / 导图这类没有文档正文的节点：交给右侧编辑器接管。 */
  'open-node': [node: KnowledgeNode]
  /** 画布节点：用画布编辑器打开。新建节点还没回填模板 id，所以模板 id 一起带出去。 */
  'open-canvas': [node: KnowledgeNode, templateId?: string]
  renamed: [documentId: string, title: string]
  home: []
  graph: []
}>()

const nodes = ref<KnowledgeNode[]>([])
const trashNodes = ref<KnowledgeNode[]>([])
const templates = ref<KnowledgeTemplate[]>([])
const loading = ref(false)
const error = ref('')
const view = ref<'all' | 'favorite' | 'archived' | 'trash'>('all')
const archivedNodes = ref<KnowledgeNode[]>([])
/** 目录排序视图：按树结构 / 按最近更新。 */
const sortMode = ref<'tree' | 'updated'>('tree')
/** 图标 Emoji 面板的目标节点。 */
const emojiTarget = ref<KnowledgeNode | null>(null)
/** 节点悬浮统计缓存（子节点数 / 字数 / 评论数）。 */
const statsCache = new Map<string, knowledgeApi.KnowledgeNodeStats>()
const hoveredStats = ref<knowledgeApi.KnowledgeNodeStats | null>(null)
const hoveredNodeId = ref('')
/** 删除策略：子节点级联删除还是提升到父级。 */
const deleteTarget = ref<KnowledgeNode | null>(null)
const deletePromote = ref(false)
const deleteDialogOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null
  },
})
/** 批量移动的目标：只有文件夹能作为父节点。 */
const moveTargets = computed(() => {
  const byParent = new Map<string | null, KnowledgeNode[]>()
  for (const node of nodes.value) {
    if (node.nodeType !== 'folder') continue
    const key = node.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(node)
  }
  const make = (parentId: string | null): unknown[] =>
    (byParent.get(parentId) || []).map((node) => ({
      id: node.id,
      label: node.title,
      children: make(node.id),
    }))
  return make(null)
})
/** 批量移动到指定父节点。 */
const batchMoveOpen = ref(false)
const batchMoveParent = ref<string | null>(null)
/** 批量改节点类型。 */
const batchTypeValue = ref<KnowledgeNode['nodeType']>('doc')
/** 目录键盘导航的焦点下标。 */
const focusedIndex = ref(-1)
const createOpen = ref(false)
const createAnchor = ref<MenuAnchor | null>(null)
const createBtn = ref<unknown>(null)
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
/** 按最近更新排序时目录拉平成一列。 */
const treeData = computed<TreeNode[]>(() => {
  if (sortMode.value === 'updated') {
    return [...visibleNodes.value]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((n) => ({ id: n.id, node: n }))
  }
  return buildTree(visibleNodes.value)
})
/** 顶部角标：收藏 / 归档 / 回收站各自的数量。 */
const counts = computed(() => ({
  favorite: nodes.value.filter((n) => n.favorite).length,
  archived: archivedNodes.value.length,
  trash: trashNodes.value.length,
}))
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

/** 画布按分类分组：菜单里的「画布 → 分类 → 画布」两级。 */
const canvasGroups = computed(() => {
  const ids = Object.keys(TEMPLATE_META) as TemplateId[]
  return (Object.keys(CATEGORY_LABELS) as TemplateCategory[])
    .map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      items: ids
        .filter((tid) => TEMPLATE_META[tid].category === id)
        .map((tid) => ({ id: tid, ...TEMPLATE_META[tid] })),
    }))
    .filter((group) => group.items.length > 0)
})

/** 空间检索：支持关键词、节点类型与作者筛选。 */
const searchQuery = ref('')
const searchHits = ref<knowledgeApi.KnowledgeSearchHit[]>([])
const searching = ref(false)
const searchType = ref<'all' | 'doc' | 'sheet' | 'mindmap' | 'folder'>('all')
/** 检索范围：本空间 / 全部项目（060）。 */
const searchScope = ref<'space' | 'global'>('space')
/** 结果排序：最近更新 / 字数 / 标题（057）。 */
const searchSort = ref<'updated' | 'word' | 'title'>('updated')
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
    const hits =
      searchScope.value === 'global'
        ? await knowledgeApi.globalSearchKnowledge({
            q: searchQuery.value.trim(),
            nodeType: searchType.value === 'all' ? '' : searchType.value,
            sort: searchSort.value === 'updated' ? '' : searchSort.value,
            limit: 30,
          })
        : await knowledgeApi.searchKnowledgeSpace(props.projectId, {
            q: searchQuery.value.trim(),
            nodeType: searchType.value === 'all' ? '' : searchType.value,
            authorId: searchAuthor.value || '',
            sort: searchSort.value === 'updated' ? '' : searchSort.value,
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

/** 关键词高亮（054）：命中片段用 <mark> 标出。 */
function highlight(text: string, query: string) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const keyword = query.trim()
  if (!keyword) return safe
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(escaped, 'gi'), (match) => `<mark>${match}</mark>`)
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
    documentCanvasType: '',
    documentTemplateId: '',
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
    trashNodes.value = await knowledgeApi.listTrash(props.projectId)
    archivedNodes.value = await knowledgeApi.listArchivedNodes(props.projectId)
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


// ---------------------------------------------------------------- 悬浮统计

/** 悬浮节点时拉统计（子节点数 / 正文字数 / 评论数），结果进缓存不重复请求。 */
async function onNodeHover(node: KnowledgeNode) {
  hoveredNodeId.value = node.id
  if (!statsCache.has(node.id)) {
    try {
      statsCache.set(node.id, await knowledgeApi.getKnowledgeNodeStats(props.projectId, node.id))
    } catch {
      statsCache.set(node.id, { children: 0, words: 0, comments: 0 })
    }
  }
  hoveredStats.value = statsCache.get(node.id) ?? null
}

async function applyEmoji(icon: string) {
  const node = emojiTarget.value
  emojiTarget.value = null
  if (!node) return
  try {
    const updated = await knowledgeApi.updateKnowledgeNode(props.projectId, node.id, { icon })
    node.icon = updated.icon
  } catch {
    ElMessage.error('修改图标失败')
  }
}

// ---------------------------------------------------------------- 删除策略

/** 删除：子节点可以级联删除，也可以提升到父级（飞书删除时的两种处置）。 */
function askDelete(node: KnowledgeNode) {
  deleteTarget.value = node
  deletePromote.value = false
}

async function confirmDelete() {
  const node = deleteTarget.value
  deleteTarget.value = null
  if (!node) return
  try {
    await knowledgeApi.deleteKnowledgeNode(props.projectId, node.id, deletePromote.value)
    ElMessage.success(deletePromote.value ? '已删除，子节点已提升' : '已删除')
    await load()
  } catch {
    ElMessage.error('删除失败')
  }
}

// ---------------------------------------------------------------- 批量操作

/** 批量移动：选一个父节点（根目录或某个文件夹）。 */
async function applyBatchMove() {
  if (!selectedIds.value.length) return
  batchMoveOpen.value = false
  await knowledgeApi.batchKnowledgeNodes(props.projectId, {
    ids: selectedIds.value,
    op: 'move',
    parentId: batchMoveParent.value,
  })
  ElMessage.success(`已移动 ${selectedIds.value.length} 个节点`)
  selectedIds.value = []
  await load()
}

/** 批量改节点类型。 */
async function applyBatchType() {
  if (!selectedIds.value.length) return
  await knowledgeApi.batchKnowledgeNodes(props.projectId, {
    ids: selectedIds.value,
    op: 'type',
    value: batchTypeValue.value,
  })
  ElMessage.success(`已修改 ${selectedIds.value.length} 个节点类型`)
  selectedIds.value = []
  await load()
}

// ---------------------------------------------------------------- 键盘导航

/** 扁平化的可见节点顺序：↑↓ 在这里移动。 */
const flatVisible = computed(() => {
  const out: KnowledgeNode[] = []
  const walk = (items: TreeNode[]) => {
    for (const item of items) {
      out.push(item.node)
      if (item.children) walk(item.children)
    }
  }
  walk(treeData.value)
  return out
})

function focusNode(index: number) {
  const list = flatVisible.value
  if (!list.length) return
  focusedIndex.value = Math.max(0, Math.min(list.length - 1, index))
  const node = list[focusedIndex.value]
  if (node.documentId) emit('open-doc', node)
  else if (node.nodeType === 'sheet' || node.nodeType === 'mindmap') emit('open-node', node)
}

/** 目录键盘导航：↑↓ 切换、Enter 打开、Delete 进回收站。 */
function onTreeKeydown(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusNode(focusedIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusNode(focusedIndex.value - 1)
  } else if (event.key === 'Delete') {
    const node = flatVisible.value[focusedIndex.value]
    if (node) {
      event.preventDefault()
      void trashNode(node)
    }
  }
}

// ---------------------------------------------------------------- 模板占位符

/** 模板占位符替换：{标题}/{日期}/{负责人} 在创建时填成实际值。 */
function fillTemplatePlaceholders(html: string, title: string) {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  const owner = auth.user?.displayName ?? ''
  return html
    .replace(/\{标题\}/g, title)
    .replace(/\{日期\}/g, date)
    .replace(/\{负责人\}/g, owner)
    .replace(/\{作者\}/g, owner)
}

// ---------------------------------------------------------------- 空间级操作

/** 一键回填缺失摘要。 */
async function fillSummaries() {
  try {
    const res = await knowledgeApi.fillKnowledgeSummaries(props.projectId)
    ElMessage.success(res.filled ? `已回填 ${res.filled} 条摘要` : '所有节点都有摘要了')
    await load()
  } catch {
    ElMessage.error('回填摘要失败')
  }
}

/** 整空间打包导出。 */
async function exportSpace() {
  try {
    await knowledgeApi.exportKnowledgeSpaceZip(props.projectId)
    ElMessage.success('已导出知识空间压缩包')
  } catch {
    ElMessage.error('导出失败')
  }
}

/** 打开模板中心。 */
function openTemplateCenter() {
  void router.push({ name: 'knowledge-templates', params: { projectId: props.projectId } })
}

/** 文档在目录树里的路径：面包屑用（从根到该节点）。 */
function pathOf(documentId: string): { id: string; title: string }[] {
  const node = nodes.value.find((n) => n.documentId === documentId)
  if (!node) return []
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  const chain: KnowledgeNode[] = []
  let cursor: KnowledgeNode | undefined = node
  while (cursor) {
    chain.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain.map((item) => ({ id: item.id, title: item.title }))
}

/** 文档对应的目录节点：锁定状态等从这里读。 */
function nodeOf(documentId: string): KnowledgeNode | null {
  return nodes.value.find((n) => n.documentId === documentId) ?? null
}

defineExpose({ setDocTitle, docIcon, setDocIcon, pathOf, nodeOf })

function onNodeClick(data: TreeNode) {
  if (data.node.nodeType === 'canvas') {
    emit('open-canvas', data.node)
    return
  }
  if (data.node.documentId) {
    emit('open-doc', data.node)
    return
  }
  if (data.node.nodeType === 'sheet' || data.node.nodeType === 'mindmap') {
    emit('open-node', data.node)
  }
}

/** 把画布模板复制一份到本项目，并作为节点挂进目录树。 */
async function addCanvasFromTemplate(templateId: string) {
  const id = templateId as TemplateId
  const meta = TEMPLATE_META[id]
  const data = TEMPLATES[id]
  if (!meta || !data) return
  try {
    const doc = await createDocument({
      title: meta.name,
      canvasType: id,
      templateId: id,
      projectId: props.projectId,
      data,
    })
    const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
      nodeType: 'canvas',
      title: meta.name,
      icon: '🎨',
      documentId: doc.id,
    })
    ElMessage.success(`已加入「${meta.name}」`)
    await load()
    emit('open-canvas', node, id)
  } catch {
    ElMessage.error('加入画布失败')
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
  const filled = fillTemplatePlaceholders(html, title)
  if (filled && node.documentId) {
    await updateDocument(node.documentId, {
      title,
      currentData: { type: 'doc', html: filled } as never,
      operationId: `doc-template-${node.documentId}-${Date.now()}`,
    })
  }
  ElMessage.success('已创建')
  await load()
  emit('open-doc', node)
  return node
}

/**
 * 从编辑器模板库（100+ 个）建文档：先建空文档，再让文档编辑器插入模板内容。
 * 模板是 TipTap JSON，只能由编辑器自己序列化，直接写 HTML 会丢表单/表格节点。
 */
async function addDocFromEditorTemplate(title: string, editorTemplateId: string) {
  try {
    const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
      nodeType: 'doc',
      title,
      createDoc: true,
    })
    ElMessage.success('已创建')
    await load()
    emit('open-doc', node, editorTemplateId)
  } catch {
    ElMessage.error('创建文档失败')
  }
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

/** 取消归档：节点回到默认目录。 */
async function restoreArchived(node: KnowledgeNode) {
  await knowledgeApi.updateNodeMeta(props.projectId, node.id, { archived: false })
  ElMessage.success('已取消归档')
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
  if (cmd === 'delete') return askDelete(node)
}

/** 合并后的新建菜单：新建项 + 文档模板（分类→模板）+ 画布（分类→画布）+ 导入。 */
const menuNodes = computed<MenuNode[]>(() => [
  { key: 'folder', label: '文件夹', icon: '📁', action: () => addStructuredNode(null, 'folder') },
  { key: 'sheet', label: '多维表格', icon: '📊', action: () => addStructuredNode(null, 'sheet') },
  { key: 'mindmap', label: '思维导图', icon: '🧠', action: () => addStructuredNode(null, 'mindmap') },
  {
    key: 'docs',
    label: '文档',
    icon: '📄',
    children: [
      {
        key: 'doc-group-kb',
        label: '知识库模板',
        children: templates.value.map((tpl) => ({
          key: `doc-${tpl.id}`,
          label: tpl.label,
          icon: tpl.icon,
          desc: tpl.category,
          action: () => addDoc(null, tpl),
        })),
      },
      ...RTE_DOC_TEMPLATE_GROUPS.map((group) => ({
        key: `doc-group-${group.id}`,
        label: group.label,
        children: RTE_DOC_TEMPLATES.filter((tpl) => tpl.group === group.id).map((tpl) => ({
          key: `doc-rte-${tpl.id}`,
          label: tpl.label,
          desc: tpl.description,
          action: () => addDocFromEditorTemplate(tpl.label, tpl.id),
        })),
      })),
    ],
  },
  {
    key: 'canvases',
    label: '画布',
    icon: '🎨',
    children: canvasGroups.value.map((group) => ({
      key: `canvas-group-${group.id}`,
      label: group.label,
      children: group.items.map((item) => ({
        key: `canvas-${item.id}`,
        label: item.name,
        badge: item.badge,
        action: () => addCanvasFromTemplate(item.id),
      })),
    })),
  },
  {
    key: 'import',
    label: '导入 Word / Excel / Markdown',
    icon: '⬆️',
    action: pickFile,
  },
  { key: 'feishu', label: '从飞书知识空间导入', icon: '🛫', action: importFromFeishu },
])

function onMenuSelect(node: MenuNode) {
  createOpen.value = false
  node.action?.()
}

/** 展开式菜单：自己管开合，避免 el-popover 的 clickoutside 把浮层一起关掉。 */
function toggleCreate() {
  if (createOpen.value) {
    createOpen.value = false
    return
  }
  createOpen.value = true
  updateAnchor()
}

function updateAnchor() {
  if (!createOpen.value) return
  const inst = createBtn.value as unknown as { $el?: HTMLElement } | HTMLElement | null
  const el = inst && '$el' in inst ? inst.$el : (inst as HTMLElement | null)
  if (!el) return
  const r = el.getBoundingClientRect()
  createAnchor.value = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
}

function onDocMouseDown(e: MouseEvent) {
  if (!createOpen.value) return
  const t = e.target as HTMLElement | null
  if (t?.closest('.mm-menu-root, .mm-flyout, .kn-create__btn')) return
  createOpen.value = false
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') createOpen.value = false
}

/** Cmd/Ctrl+K 聚焦搜索框：飞书的全局搜索入口。 */
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('.kn-tree__search input')?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeydown)
  window.addEventListener('resize', updateAnchor)
  window.addEventListener('scroll', updateAnchor, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown)
  window.removeEventListener('resize', updateAnchor)
  window.removeEventListener('scroll', updateAnchor, true)
})
</script>

<template>
  <aside class="kn-tree">
    <div class="kn-tree__head">
      <span class="kn-tree__title">知识库</span>
      <div class="kn-tree__actions">
        <el-button size="small" text @click="emit('home')">概览</el-button>
        <el-button size="small" text @click="emit('graph')">图谱</el-button>
        <el-dropdown trigger="click">
          <el-button size="small" text title="更多">⋯</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="fillSummaries">一键补全摘要</el-dropdown-item>
              <el-dropdown-item @click="exportSpace">导出整个空间</el-dropdown-item>
              <el-dropdown-item @click="openTemplateCenter">模板中心</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button ref="createBtn" class="kn-create__btn" size="small" text @click="toggleCreate">
          + 新建
        </el-button>
        <MenuCascade
          :nodes="menuNodes"
          :visible="createOpen"
          :anchor="createAnchor"
          @select="onMenuSelect"
        />
      </div>
    </div>

    <div class="kn-tree__views">
      <el-radio-group v-model="view" size="small">
        <el-radio-button value="all">目录</el-radio-button>
        <el-radio-button value="favorite">
          收藏<span v-if="counts.favorite" class="kn-tree__count">{{ counts.favorite }}</span>
        </el-radio-button>
        <el-radio-button value="archived">
          归档<span v-if="counts.archived" class="kn-tree__count">{{ counts.archived }}</span>
        </el-radio-button>
        <el-radio-button value="trash">
          回收站<span v-if="counts.trash" class="kn-tree__count">{{ counts.trash }}</span>
        </el-radio-button>
      </el-radio-group>
      <div v-if="view !== 'trash' && view !== 'archived'" class="kn-tree__sort">
        <el-radio-group v-model="sortMode" size="small">
          <el-radio-button value="tree">树结构</el-radio-button>
          <el-radio-button value="updated">最近更新</el-radio-button>
        </el-radio-group>
      </div>
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
        <el-select v-model="searchScope" size="small">
          <el-option label="本空间" value="space" />
          <el-option label="全部项目" value="global" />
        </el-select>
        <el-select v-model="searchSort" size="small">
          <el-option label="最近更新" value="updated" />
          <el-option label="字数最多" value="word" />
          <el-option label="标题" value="title" />
        </el-select>
      </div>
      <ul v-if="searchHits.length" class="kn-tree__hits">
        <li
          v-for="hit in searchHits"
          :key="hit.nodeId"
          class="kn-tree__hit"
          @click="openSearchHit(hit)"
        >
          <span class="kn-tree__hit-title" v-html="highlight(hit.title, searchQuery)" />
          <span v-if="hit.author" class="kn-tree__hit-author">{{ hit.author }}</span>
          <span
            class="kn-tree__hit-snippet"
            v-if="hit.snippet"
            v-html="highlight(hit.snippet, searchQuery)"
          />
        </li>
      </ul>
    </div>

    <div v-if="selectedIds.length" class="kn-tree__batch">
      <span>已选 {{ selectedIds.length }} 项</span>
      <el-button size="small" text @click="batch('favorite', 'on')">收藏</el-button>
      <el-button size="small" text @click="batch('archive', 'on')">归档</el-button>
      <el-button size="small" text @click="batchMoveOpen = true">移动</el-button>
      <el-select v-model="batchTypeValue" size="small" class="kn-tree__batch-type">
        <el-option label="文档" value="doc" />
        <el-option label="文件夹" value="folder" />
        <el-option label="多维表格" value="sheet" />
        <el-option label="思维导图" value="mindmap" />
        <el-option label="附件" value="attachment" />
      </el-select>
      <el-button size="small" text @click="applyBatchType">改类型</el-button>
      <el-button size="small" text @click="batch('trash')">移入回收站</el-button>
    </div>

    <p v-if="error" class="kn-tree__error">{{ error }}</p>
    <p v-if="loading && !nodes.length" class="kn-tree__empty">加载中…</p>

    <!-- 归档区 -->
    <div v-else-if="view === 'archived'" class="kn-tree__trash">
      <p v-if="!archivedNodes.length" class="kn-tree__empty">还没有归档内容。</p>
      <div v-for="node in archivedNodes" :key="node.id" class="kn-tree__trash-row">
        <span class="kn-tree__node-icon">{{ node.icon }}</span>
        <span class="kn-tree__node-label">{{ node.title }}</span>
        <el-button size="small" text @click="restoreArchived(node)">取消归档</el-button>
      </div>
    </div>

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
      tabindex="0"
      @node-drop="onDrop"
      @node-click="onNodeClick"
      @selection-change="onSelectionChange"
      :expand-on-click-node="false"
      default-expand-all
      @keydown="onTreeKeydown"
    >
      <template #default="{ data }">
        <el-dropdown trigger="contextmenu" @command="(cmd: string) => onContext(cmd, data.node)">
          <div
            class="kn-tree__node"
            @mouseenter="onNodeHover(data.node)"
            @mouseleave="hoveredNodeId = ''"
          >
            <el-popover
              trigger="click"
              placement="right-start"
              :width="220"
              popper-class="kn-emoji-popper"
              @show="emojiTarget = data.node"
              @hide="emojiTarget = null"
            >
              <template #reference>
                <span class="kn-tree__node-icon" title="更换图标">{{ data.node.icon }}</span>
              </template>
              <ProjectEmojiPicker :model-value="data.node.icon" @update:model-value="applyEmoji" />
            </el-popover>
            <span
              v-if="hoveredNodeId === data.node.id && hoveredStats"
              class="kn-tree__node-stats"
            >
              {{ hoveredStats.children }} 子 · {{ hoveredStats.words }} 字 ·
              {{ hoveredStats.comments }} 评
            </span>
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
              <el-dropdown-item command="delete" divided>删除（含子节点）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-tree>

    <el-dialog v-model="deleteDialogOpen" title="删除节点" width="380px">
      <p class="kn-tree__dialog-text">
        节点「{{ deleteTarget?.title ?? '' }}」下面的子节点如何处理？
      </p>
      <el-radio-group v-model="deletePromote">
        <el-radio :value="false">一起删除（级联）</el-radio>
        <el-radio :value="true">提升到父级</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button size="small" @click="deleteDialogOpen = false">取消</el-button>
        <el-button size="small" type="danger" @click="confirmDelete">删除</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchMoveOpen" title="批量移动到" width="380px">
      <el-tree-select
        v-model="batchMoveParent"
        :data="moveTargets"
        check-strictly
        clearable
        placeholder="不选则移动到根目录"
        :props="{ label: 'label', children: 'children' }"
      />
      <template #footer>
        <el-button size="small" @click="batchMoveOpen = false">取消</el-button>
        <el-button size="small" type="primary" @click="applyBatchMove">移动</el-button>
      </template>
    </el-dialog>

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
.kn-tree__actions { display: flex; gap: 2px; align-items: center; flex: none; }
.kn-tree__views { padding: 8px 10px 0; }
.kn-tree__count {
  display: inline-block;
  min-width: 16px;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--mm-hover, #f2f3f5);
  color: var(--mm-muted, #86909c);
  font-size: 10px;
  line-height: 15px;
  text-align: center;
}
.kn-tree__sort { margin-top: 6px; }
.kn-tree__batch-type { width: 96px; }
.kn-tree__dialog-text { margin: 0 0 10px; font-size: 13px; color: var(--mm-text, #1d2129); }
.kn-tree__search { padding: 6px 10px 8px; position: relative; }
.kn-tree__filters { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.kn-tree__filters :deep(.el-select) { flex: 1 1 40%; min-width: 84px; }
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
.kn-tree__hit :deep(mark) { background: #fff3a3; color: inherit; padding: 0 1px; }
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
.kn-tree__node-icon { flex: none; width: 18px; text-align: center; cursor: pointer; }
.kn-tree__node-stats {
  flex: none;
  font-size: 10px;
  color: var(--mm-muted, #86909c);
  background: var(--mm-hover, #f2f3f5);
  border-radius: 4px;
  padding: 1px 4px;
}
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
