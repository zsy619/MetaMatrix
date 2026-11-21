<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import * as knowledgeApiV6 from '../../api/knowledge_v6'
import * as knowledgeApiV5 from '../../api/knowledge_v5'
import { pinyin } from 'pinyin-pro'
import type { KnowledgeNode, KnowledgeTemplate } from '../../api/knowledge'
import { createDocument, getDocument, updateDocument } from '../../api/documents'
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
import NodeMenu from './NodeMenu.vue'
import { RTE_DOC_TEMPLATES, RTE_DOC_TEMPLATE_GROUPS } from '../rteDocTemplates'
import { SHEET_PRESETS, type SheetPreset } from './sheetModel'
import { mindmapFromHeadings } from './mindmapModel'
import IconPicker from '../common/IconPicker.vue'

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
/** 检索筛选区暂时隐藏（保留代码，改回 true 即恢复）。 */
const showSearchFilters = false
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
/** 语义检索（106）：开启后用向量召回补充关键词结果。 */
const semanticSearchOn = ref(false)
const searchAuthor = ref('')
const authors = ref<{ id: string; name: string }[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 250)
}

async function runSearch() {
  detectFeishuLink(searchQuery.value)
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
    let merged = hits
    // 语义召回：同空间下把向量结果并进关键词结果（按文档去重）。
    if (semanticSearchOn.value && searchScope.value === 'space' && searchQuery.value.trim()) {
      try {
        const semantic = await knowledgeApiV6.semanticSearch(props.projectId, searchQuery.value.trim(), 20)
        const seen = new Set(hits.map((hit) => hit.documentId))
        for (const item of semantic) {
          if (!item.documentId || seen.has(item.documentId)) continue
          seen.add(item.documentId)
          merged.push({
            nodeId: '',
            documentId: item.documentId,
            title: item.title,
            summary: item.snippet,
            nodeType: 'doc',
            author: '',
            authorId: '',
            tags: '',
            updatedAt: '',
            snippet: item.snippet,
            words: 0,
          })
        }
      } catch {
        /* 语义检索不可用时退回关键词结果 */
      }
    }
    if (seq !== searchSeq) return
    searchHits.value = merged
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

/** 粘贴的飞书文档链接：命中时给出「一键导入」入口（087）。 */
const feishuLink = ref('')

function detectFeishuLink(query: string) {
  feishuLink.value = /feishu\.cn\/(docx|docs)\//i.test(query) ? query.trim() : ''
}

/** 从飞书链接导入一篇文档。 */
async function importFeishuDoc() {
  try {
    const node = await knowledgeApi.importFeishuDoc(props.projectId, feishuLink.value)
    ElMessage.success(`已导入：${node.title}`)
    feishuLink.value = ''
    searchQuery.value = ''
    await load()
    emit('open-doc', node)
  } catch {
    ElMessage.error('导入失败，请确认已配置飞书应用凭证')
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
    pinyin: '',
    visibility: 'space',
    allowedUsers: '',
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

/** 清理超过保留期的回收站节点（073）。 */
async function purgeTrash() {
  try {
    const res = await knowledgeApi.purgeExpiredTrash(props.projectId, 30)
    ElMessage.success(res.purged ? `已清理 ${res.purged} 个超期节点` : '没有超期节点')
    await load()
  } catch {
    ElMessage.error('清理失败')
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

function onNodeClick(data: TreeNode, _node?: unknown, _component?: unknown, event?: MouseEvent) {
  // 点「⋯」这类操作按钮时不打开文档，只让菜单自己处理。
  const target = event?.target as HTMLElement | undefined
  if (target?.closest?.('.kn-tree__node-tools')) return
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

/** 从推荐模板建多维表格：建节点后把模板数据写进节点数据。 */
async function addSheetFromPreset(preset: SheetPreset) {
  try {
    const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
      nodeType: 'sheet',
      title: preset.name,
      icon: preset.icon,
    })
    await knowledgeApi.saveNodeData(props.projectId, node.id, 'sheet', preset.build())
    ElMessage.success(`已创建「${preset.name}」`)
    await load()
    emit('open-node', node)
  } catch {
    ElMessage.error('创建多维表格失败')
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

/** 文档 → 一键脑图：取正文标题层级生成导图节点。 */
async function convertToMindmap(node: KnowledgeNode) {
  if (!node.documentId) {
    ElMessage.warning('该节点没有文档正文')
    return
  }
  try {
    const doc = await getDocument(node.documentId)
    const html = (doc.currentData as { html?: string } | undefined)?.html ?? ''
    const map = mindmapFromHeadings(doc.title || node.title, html)
    const created = await knowledgeApi.createKnowledgeNode(props.projectId, {
      parentId: node.parentId,
      nodeType: 'mindmap',
      title: `${node.title} · 脑图`,
      icon: '🧠',
    })
    await knowledgeApi.saveNodeData(props.projectId, created.id, 'mindmap', map)
    ElMessage.success('已生成思维导图')
    await load()
    emit('open-node', created)
  } catch {
    ElMessage.error('生成思维导图失败')
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
    // 改名时同步写拼音列：中文按拼音检索靠它（055）。
    await knowledgeApi.updateKnowledgeNode(props.projectId, node.id, {
      title,
      pinyin: pinyinOf(title),
    })
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

// ---------------------------------------------------------------- 快速创建面板（021/023）

/** 统一快速创建面板：空白 / 模板 / 导入 / 表格 / 导图 / 文件夹 / 画布。 */
const quickOpen = ref(false)
const quickTitle = ref('')
const quickParentId = ref<string | null>(null)
const quickTitleInput = ref<{ focus: () => void } | null>(null)

/** 模板预览（025）。 */
const previewTemplate = ref<KnowledgeTemplate | null>(null)

/** 批量属性（033）。 */
const batchPropsOpen = ref(false)
const batchProps = ref({ status: '', priority: '', tags: '', members: '' })

/** 节点可见范围（069/070）。 */
const accessTarget = ref<KnowledgeNode | null>(null)
const accessVisibility = ref<'space' | 'private'>('space')
const accessUsers = ref('')

/** 导入预览与批量导入（090/091）。 */
const importOpen = ref(false)
const batchFileInput = ref<HTMLInputElement | null>(null)
const importFiles = ref<File[]>([])
const importPreviews = ref<knowledgeApiV5.ImportPreview[]>([])
const importBusy = ref(false)

/** 保存的筛选视图（058）与结果内再筛（059）。 */
type SavedView = { name: string; type: string; author: string; scope: string; sort: string }
const savedViews = ref<SavedView[]>([])
const viewName = ref('')
const resultFilter = ref('')

const filteredHits = computed(() => {
  const q = resultFilter.value.trim().toLowerCase()
  if (!q) return searchHits.value
  return searchHits.value.filter((hit) =>
    `${hit.title} ${hit.snippet ?? ''} ${hit.author ?? ''}`.toLowerCase().includes(q),
  )
})

/** 标题的拼音与首字母：中文按拼音检索（055）。 */
function pinyinOf(title: string) {
  if (!title) return ''
  const full = pinyin(title, { toneType: 'none', type: 'array' }).join('')
  const first = pinyin(title, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
  return `${full} ${first}`.toLowerCase()
}

function openQuickCreate(parentId: string | null = null) {
  quickParentId.value = parentId
  quickTitle.value = ''
  quickOpen.value = true
  void nextTick(() => quickTitleInput.value?.focus())
}

/** 快速创建：空白文档。 */
async function quickBlankDoc() {
  const title = quickTitle.value.trim() || '无标题文档'
  try {
    const node = await knowledgeApi.createKnowledgeNode(props.projectId, {
      parentId: quickParentId.value,
      nodeType: 'doc',
      title,
      icon: '📄',
      createDoc: true,
      pinyin: pinyinOf(title),
    })
    quickOpen.value = false
    ElMessage.success('已创建')
    await load()
    emit('open-doc', node)
  } catch {
    ElMessage.error('创建失败')
  }
}

/** 快速创建：用模板建文档（017：模板自带属性定义）。 */
async function quickFromTemplate(tpl: KnowledgeTemplate) {
  const title = quickTitle.value.trim() || tpl.label
  try {
    const node = await knowledgeApiV5.createDocFromTemplate(props.projectId, tpl.id, {
      parentId: quickParentId.value,
      title,
    })
    quickOpen.value = false
    ElMessage.success('已按模板创建')
    await load()
    emit('open-doc', node)
  } catch {
    ElMessage.error('按模板创建失败')
  }
}

/** 模板拖拽：把模板拖到目录树里直接生成节点（024）。 */
function onTemplateDragStart(tpl: KnowledgeTemplate, e: DragEvent) {
  e.dataTransfer?.setData('application/x-kb-template', tpl.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

async function onTemplateDrop(e: DragEvent) {
  const templateId = e.dataTransfer?.getData('application/x-kb-template')
  if (!templateId) return
  const target = (e.target as HTMLElement)?.closest('[data-node-id]') as HTMLElement | null
  const parentId = target?.dataset.nodeId ?? quickParentId.value
  try {
    const node = await knowledgeApiV5.createDocFromTemplate(props.projectId, templateId, {
      parentId: parentId || null,
    })
    ElMessage.success('已按模板创建节点')
    await load()
    emit('open-doc', node)
  } catch {
    ElMessage.error('按模板创建失败')
  }
}

/** 批量属性（033）。 */
function openBatchProps() {
  batchProps.value = { status: '', priority: '', tags: '', members: '' }
  batchPropsOpen.value = true
}

async function applyBatchProps() {
  const docIds = nodes.value
    .filter((node) => selectedIds.value.includes(node.id) && node.documentId)
    .map((node) => node.documentId as string)
  if (!docIds.length) {
    ElMessage.warning('选中的节点里没有文档')
    return
  }
  const input: Record<string, unknown> = {}
  if (batchProps.value.status) input.status = batchProps.value.status
  if (batchProps.value.priority) input.priority = batchProps.value.priority
  if (batchProps.value.tags) input.tags = batchProps.value.tags
  if (batchProps.value.members) input.members = batchProps.value.members
  try {
    const res = await knowledgeApiV5.batchUpdateDocProps(props.projectId, docIds, input)
    ElMessage.success(`已更新 ${res.updated} 篇文档的属性`)
    batchPropsOpen.value = false
    selectedIds.value = []
  } catch {
    ElMessage.error('批量改属性失败')
  }
}

/** 节点可见范围（069/070）。 */
function openAccess(node: KnowledgeNode) {
  accessTarget.value = node
  accessVisibility.value = node.visibility === 'private' ? 'private' : 'space'
  accessUsers.value = node.allowedUsers ?? ''
}

async function saveAccess() {
  if (!accessTarget.value) return
  try {
    await knowledgeApiV5.setNodeAccess(props.projectId, accessTarget.value.id, {
      visibility: accessVisibility.value,
      allowedUsers: accessUsers.value,
    })
    ElMessage.success('可见范围已更新')
    accessTarget.value = null
    await load()
  } catch {
    ElMessage.error('更新可见范围失败')
  }
}

/** 打开多选文件导入。 */
function pickFiles() {
  batchFileInput.value?.click()
}

/** 导入预览（090）与批量导入（091）。 */
async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  importFiles.value = files
  importPreviews.value = []
  importOpen.value = true
  importBusy.value = true
  try {
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
      try {
        importPreviews.value.push(
          await knowledgeApiV5.previewImport(props.projectId, file.name, btoa(binary)),
        )
      } catch {
        importPreviews.value.push({
          filename: file.name,
          kind: file.name.split('.').pop() ?? '',
          title: file.name,
          headings: ['无法预览该格式'],
          columns: [],
          preview: '',
        })
      }
    }
  } finally {
    importBusy.value = false
  }
}

async function confirmImport() {
  importBusy.value = true
  try {
    const results = await knowledgeApiV5.importKnowledgeFiles(
      props.projectId,
      importFiles.value,
      quickParentId.value,
    )
    const failed = results.filter((item) => item.error)
    ElMessage.success(`导入完成：成功 ${results.length - failed.length} 个`)
    importOpen.value = false
    importFiles.value = []
    await load()
  } catch {
    ElMessage.error('导入失败')
  } finally {
    importBusy.value = false
  }
}

/** 保存常用筛选视图（058）。 */
function saveCurrentView() {
  const name = viewName.value.trim()
  if (!name) {
    ElMessage.warning('请给筛选视图起个名字')
    return
  }
  savedViews.value.push({
    name,
    type: searchType.value,
    author: searchAuthor.value,
    scope: searchScope.value,
    sort: searchSort.value,
  })
  viewName.value = ''
  persistViews()
}

function applyView(view: SavedView) {
  searchType.value = view.type as typeof searchType.value
  searchAuthor.value = view.author
  searchScope.value = view.scope as typeof searchScope.value
  searchSort.value = view.sort as typeof searchSort.value
  void runSearch()
}

function removeView(view: SavedView) {
  savedViews.value = savedViews.value.filter((item) => item.name !== view.name)
  persistViews()
}

function persistViews() {
  try {
    localStorage.setItem(`mm-kb-views-${props.projectId}`, JSON.stringify(savedViews.value))
  } catch {
    /* 隐私模式下忽略 */
  }
}

function loadViews() {
  try {
    const raw = localStorage.getItem(`mm-kb-views-${props.projectId}`)
    if (raw) savedViews.value = JSON.parse(raw) as SavedView[]
  } catch {
    savedViews.value = []
  }
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
  if (cmd === 'access') return openAccess(node)
  if (cmd === 'mindmap') return convertToMindmap(node)
}

/** 右键 / 「⋯」共用的节点菜单。 */
const nodeMenu = ref<{ node: KnowledgeNode; x: number; y: number } | null>(null)

function openNodeMenu(event: MouseEvent, node: KnowledgeNode) {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  const x = event.type === 'contextmenu' ? event.clientX : (rect?.left ?? 0)
  const y = event.type === 'contextmenu' ? event.clientY : (rect?.bottom ?? 0)
  nodeMenu.value = {
    node,
    x: Math.min(x, window.innerWidth - 190),
    y: Math.min(y, window.innerHeight - 340),
  }
}

function onNodeMenuCommand(cmd: string, node: KnowledgeNode) {
  nodeMenu.value = null
  void onContext(cmd, node)
}

/** 合并后的新建菜单：新建项 + 文档模板（分类→模板）+ 画布（分类→画布）+ 导入。 */
const menuNodes = computed<MenuNode[]>(() => [
  { key: 'folder', label: '文件夹', icon: '📁', action: () => addStructuredNode(null, 'folder') },
  {
    key: 'sheets',
    label: '多维表格',
    icon: '📊',
    children: [
      {
        key: 'sheet-blank',
        label: '空白多维表格',
        icon: '⬜',
        action: () => addStructuredNode(null, 'sheet'),
      },
      ...SHEET_PRESETS.map((preset) => ({
        key: `sheet-preset-${preset.key}`,
        label: preset.name,
        icon: preset.icon,
        desc: preset.description,
        action: () => addSheetFromPreset(preset),
      })),
    ],
  },
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
  const t = e.target as HTMLElement | null
  if (nodeMenu.value) {
    if (t?.closest('.node-menu')) return
    nodeMenu.value = null
    return
  }
  if (!createOpen.value) return
  if (t?.closest('.mm-menu-root, .mm-flyout, .kn-create__btn')) return
  createOpen.value = false
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') nodeMenu.value = null
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
  loadViews()
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
              <el-dropdown-item divided @click="purgeTrash">清理超期回收站</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button ref="createBtn" class="kn-create__btn" size="small" text @click="openQuickCreate(null)">
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
      <el-tooltip content="语义检索：用向量召回补充关键词结果" placement="top">
        <el-checkbox v-model="semanticSearchOn" size="small" class="kn-tree__semantic">语义</el-checkbox>
      </el-tooltip>
      <div class="kn-tree__filters">
        <el-select v-if="showSearchFilters" v-model="searchType" size="small">
          <el-option label="全部类型" value="all" />
          <el-option label="知识库文档" value="doc" />
          <el-option label="多维表格" value="sheet" />
          <el-option label="思维导图" value="mindmap" />
          <el-option label="文件夹" value="folder" />
        </el-select>
        <el-select v-if="showSearchFilters" v-model="searchAuthor" size="small" clearable placeholder="作者">
          <el-option label="全部作者" value="" />
          <el-option v-for="author in authors" :key="author.id" :label="author.name" :value="author.id" />
        </el-select>
        <el-select v-if="showSearchFilters" v-model="searchScope" size="small">
          <el-option label="本空间" value="space" />
          <el-option label="全部项目" value="global" />
        </el-select>
        <el-select v-if="showSearchFilters" v-model="searchSort" size="small">
          <el-option label="最近更新" value="updated" />
          <el-option label="字数最多" value="word" />
          <el-option label="标题" value="title" />
        </el-select>
      </div>
      <div v-if="feishuLink" class="kn-tree__feishu">
        <span>识别到飞书文档链接</span>
        <el-button size="small" type="primary" @click="importFeishuDoc">导入到知识库</el-button>
      </div>

      <div v-if="showSearchFilters" class="kn-tree__views-saved">
        <el-input v-model="viewName" size="small" placeholder="保存当前筛选为视图" style="width: 150px" />
        <el-button size="small" text @click="saveCurrentView">保存视图</el-button>
        <el-tag
          v-for="saved in savedViews"
          :key="saved.name"
          size="small"
          closable
          class="kn-tree__view-tag"
          @click="applyView(saved)"
          @close="removeView(saved)"
        >
          {{ saved.name }}
        </el-tag>
      </div>
      <el-input
        v-if="searchHits.length"
        v-model="resultFilter"
        size="small"
        clearable
        placeholder="在结果内再筛…"
        class="kn-tree__result-filter"
      />
      <ul v-if="filteredHits.length" class="kn-tree__hits">
        <li
          v-for="hit in filteredHits"
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
      <el-button size="small" text @click="openBatchProps">批量属性</el-button>
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

    <div
      v-else
      class="kn-tree__dropzone"
      @dragover.prevent
      @drop="onTemplateDrop"
    >
    <el-tree
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
        <div
          class="kn-tree__node"
          :data-node-id="data.node.id"
          @mouseenter="onNodeHover(data.node)"
          @mouseleave="hoveredNodeId = ''"
          @contextmenu.prevent="openNodeMenu($event, data.node)"
        >
            <el-popover
              trigger="click"
              placement="right-start"
              :width="320"
              popper-class="kn-emoji-popper"
              @show="emojiTarget = data.node"
              @hide="emojiTarget = null"
            >
              <template #reference>
                <span class="kn-tree__node-icon" title="更换图标">{{ data.node.icon }}</span>
              </template>
              <IconPicker
                v-if="emojiTarget && emojiTarget.id === data.node.id"
                :model-value="data.node.icon"
                :width="300"
                @update:model-value="applyEmoji"
              />
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
              <button
                type="button"
                class="kn-tree__more"
                title="更多操作"
                aria-label="更多操作"
                @click.stop="openNodeMenu($event, data.node)"
              >⋯</button>
            </span>
          </div>
      </template>
    </el-tree>
    </div>

    <NodeMenu
      v-if="nodeMenu"
      :node="nodeMenu.node"
      :x="nodeMenu.x"
      :y="nodeMenu.y"
      @command="onNodeMenuCommand"
    />

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
      accept=".docx,.xlsx,.pptx,.md,.markdown,.txt,.html,.htm"
      @change="onFilePicked"
    />
    <input
      ref="batchFileInput"
      type="file"
      class="kn-tree__file"
      multiple
      accept=".docx,.xlsx,.pptx,.md,.markdown,.txt,.html,.htm"
      @change="onFilesPicked"
    />

    <!-- 统一快速创建面板（021/023） -->
    <el-dialog v-model="quickOpen" title="快速创建" width="560px" append-to-body>
      <div class="kn-quick">
        <el-input
          ref="quickTitleInput"
          v-model="quickTitle"
          placeholder="标题（创建后自动聚焦）"
          @keyup.enter="quickBlankDoc"
        />
        <div class="kn-quick__grid">
          <button type="button" class="kn-quick__card" @click="quickBlankDoc">
            <span class="kn-quick__icon">📄</span><span>空白文档</span>
          </button>
          <button type="button" class="kn-quick__card" @click="pickFiles()">
            <span class="kn-quick__icon">⬆️</span><span>导入文件</span>
          </button>
          <button
            type="button"
            class="kn-quick__card"
            @click="quickOpen = false; addStructuredNode(null, 'sheet')"
          >
            <span class="kn-quick__icon">📊</span><span>多维表格</span>
          </button>
          <button
            type="button"
            class="kn-quick__card"
            @click="quickOpen = false; addStructuredNode(null, 'mindmap')"
          >
            <span class="kn-quick__icon">🧠</span><span>思维导图</span>
          </button>
          <button
            type="button"
            class="kn-quick__card"
            @click="quickOpen = false; addStructuredNode(null, 'folder')"
          >
            <span class="kn-quick__icon">📁</span><span>文件夹</span>
          </button>
          <button type="button" class="kn-quick__card" @click="quickOpen = false; toggleCreate()">
            <span class="kn-quick__icon">🎨</span><span>高级创建</span>
          </button>
        </div>
        <div class="kn-quick__templates">
          <div class="kn-quick__label">从模板创建（可拖到目录树）</div>
          <div class="kn-quick__template-list">
            <div
              v-for="tpl in templates"
              :key="tpl.id"
              class="kn-quick__template"
              draggable="true"
              @dragstart="onTemplateDragStart(tpl, $event)"
              @click="quickFromTemplate(tpl)"
              @dblclick="previewTemplate = tpl"
            >
              <span>{{ tpl.icon }}</span>
              <span class="kn-quick__template-label">{{ tpl.label }}</span>
              <el-button size="small" text @click.stop="previewTemplate = tpl">预览</el-button>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 模板预览（025） -->
    <el-dialog
      :model-value="!!previewTemplate"
      :title="previewTemplate?.label ?? ''"
      width="520px"
      append-to-body
      @close="previewTemplate = null"
    >
      <div class="kn-preview" v-html="previewTemplate?.html || '（空模板）'"></div>
      <template #footer>
        <el-button @click="previewTemplate = null">关闭</el-button>
        <el-button
          type="primary"
          @click="previewTemplate && quickFromTemplate(previewTemplate)"
        >
          用此模板创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量属性（033） -->
    <el-dialog v-model="batchPropsOpen" title="批量改属性" width="420px" append-to-body>
      <div class="kn-quick">
        <el-select v-model="batchProps.status" placeholder="状态" clearable style="width: 100%">
          <el-option label="草稿" value="draft" />
          <el-option label="已发布" value="published" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <el-select v-model="batchProps.priority" placeholder="优先级" clearable style="width: 100%">
          <el-option label="低" value="low" />
          <el-option label="普通" value="normal" />
          <el-option label="高" value="high" />
          <el-option label="紧急" value="urgent" />
        </el-select>
        <el-input v-model="batchProps.tags" placeholder="标签（逗号分隔）" />
        <el-input v-model="batchProps.members" placeholder="参与人（用户 ID，逗号分隔）" />
      </div>
      <template #footer>
        <el-button @click="batchPropsOpen = false">取消</el-button>
        <el-button type="primary" @click="applyBatchProps">应用</el-button>
      </template>
    </el-dialog>

    <!-- 节点可见范围（069/070） -->
    <el-dialog
      :model-value="!!accessTarget"
      title="可见范围"
      width="420px"
      append-to-body
      @close="accessTarget = null"
    >
      <div class="kn-quick">
        <el-radio-group v-model="accessVisibility">
          <el-radio value="space">空间内可见</el-radio>
          <el-radio value="private">仅指定成员可见</el-radio>
        </el-radio-group>
        <el-input
          v-model="accessUsers"
          placeholder="用户 ID，逗号分隔（子节点继承该范围）"
          :disabled="accessVisibility !== 'private'"
        />
      </div>
      <template #footer>
        <el-button @click="accessTarget = null">取消</el-button>
        <el-button type="primary" @click="saveAccess">保存</el-button>
      </template>
    </el-dialog>

    <!-- 导入预览（090）与批量导入（091） -->
    <el-dialog v-model="importOpen" title="导入预览" width="640px" append-to-body>
      <p v-if="importBusy" class="kn-preview__hint">正在解析文件…</p>
      <div v-for="preview in importPreviews" :key="preview.filename" class="kn-preview__item">
        <div class="kn-preview__file">
          <strong>{{ preview.filename }}</strong>
          <el-tag size="small">{{ preview.kind }}</el-tag>
          <span>{{ preview.title }}</span>
        </div>
        <div v-if="preview.columns.length" class="kn-preview__columns">
          表格列：{{ preview.columns.join(' / ') }}
        </div>
        <ul v-else class="kn-preview__headings">
          <li v-for="heading in preview.headings" :key="heading">{{ heading }}</li>
        </ul>
      </div>
      <template #footer>
        <el-button @click="importOpen = false">取消</el-button>
        <el-button type="primary" :loading="importBusy" @click="confirmImport">导入</el-button>
      </template>
    </el-dialog>
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
.kn-tree__feishu {
  display: flex; align-items: center; gap: 8px;
  margin-top: 6px; padding: 6px 8px;
  font-size: 12px; color: var(--mm-text, #1d2129);
  border: 1px dashed var(--mm-blue, #1677ff); border-radius: 6px;
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
.kn-tree__dropzone { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.kn-tree__views-saved { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.kn-tree__view-tag { cursor: pointer; }
.kn-tree__result-filter { margin-top: 6px; }
.kn-quick { display: flex; flex-direction: column; gap: 10px; }
.kn-quick__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.kn-quick__card {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px;
  border: 1px solid var(--mm-line, #e5e6eb); border-radius: 8px; background: transparent;
  cursor: pointer; font-size: 12px; color: var(--mm-text, #1d2129);
}
.kn-quick__card:hover { border-color: var(--mm-blue, #1677ff); background: #f2f7ff; }
.kn-quick__icon { font-size: 20px; }
.kn-quick__label { font-size: 12px; color: var(--mm-muted, #86909c); }
.kn-quick__template-list { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto; }
.kn-quick__template {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px;
  cursor: grab; font-size: 13px;
}
.kn-quick__template:hover { background: var(--mm-hover, #f2f3f5); }
.kn-quick__template-label { flex: 1; }
.kn-preview { max-height: 420px; overflow: auto; font-size: 13px; }
.kn-preview__hint { font-size: 12px; color: var(--mm-muted, #86909c); }
.kn-preview__item { border: 1px solid var(--mm-line, #e5e6eb); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
.kn-preview__file { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.kn-preview__columns { font-size: 12px; color: var(--mm-muted, #86909c); margin-top: 4px; }
.kn-preview__headings { margin: 4px 0 0; padding-left: 18px; font-size: 12px; color: var(--mm-muted, #86909c); }
</style>
