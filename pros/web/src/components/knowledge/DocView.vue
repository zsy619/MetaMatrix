<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ChatDotRound,
  Select,
  Clock,
  Collection,
  Connection,
  CopyDocument,
  Download,
  Link,
  List,
  Lock,
  MagicStick,
  Memo,
  MoreFilled,
  Setting,
  Share,
  Tickets,
} from '@element-plus/icons-vue'
// 富文本编辑器（~260KB 源码 + TipTap 全家桶）按需加载：
// 文档页挂载时先渲染骨架，编辑器 chunk 到达后再挂载。
const RichTextEditor = defineAsyncComponent(() => import('../RichTextEditor.vue'))
import DocOutline from './DocOutline.vue'
import DocBackrefs from './DocBackrefs.vue'
import DocHistory from './DocHistory.vue'
import DocProperties from './DocProperties.vue'
import DocComments from './DocComments.vue'
import DocVersions from './DocVersions.vue'
import AiPanel from './AiPanel.vue'
import WriteAssist from './WriteAssist.vue'
import MeetingMinutesDialog from './MeetingMinutesDialog.vue'
import ShareDialog from './ShareDialog.vue'
// 图标库按需加载。
const IconPicker = defineAsyncComponent(() => import('../common/IconPicker.vue'))
import { getDocument, getDocumentBlock, listDocumentBlocks, updateBlockPermission, updateDocument } from '../../api/documents'
import { apiRequestBlob, getToken } from '../../api/http'
import { LiveCollabSession, createCollabYDoc } from './collab/yDocCollab'
import { isCollabWritable } from './collab/collabOfflineQueue'
import { collabCaretColor } from './collab/collabAwareness'
import { useAuthStore } from '../../stores/auth'
import DocAudit from './DocAudit.vue'
import type { Doc as YDoc } from 'yjs'
import type { DocumentFull } from '../../api/documents'
import {
  exportKnowledgeDoc,
  touchView,
  heartbeatPresence,
  listPresence,
  getRelatedDocs,
  listVersionAuthors,
  saveDocAsTemplate,
  getNodeData,
  saveNodeData,
} from '../../api/knowledge'
import * as knowledgeApiV5 from '../../api/knowledge_v5'
import type { PresenceUser } from '../../api/knowledge'
import { friendlyApiMessage } from '../../utils/apiMessage'
import { htmlToMarkdown } from '../../utils/rteExportMd'
import AppLoading from '../common/AppLoading.vue'
import SaveConflictPanel from './SaveConflictPanel.vue'
import BlockPermissionPanel from './BlockPermissionPanel.vue'
import { readBlockId } from '../../extensions/blockIdentity'
import { setBlockPermissionGuardState } from '../../extensions/blockPermissionGuard'
import { canEditBlockContent } from './blockPermission'
import { DATABASE_BLOCK_SYNC_EVENT, type DatabaseBlockSyncDetail } from '../../extensions/databaseBlockEvents'
import { applySafeLinkedDatabaseBlocks, probeLinkedDatabaseBlocks, syncLinkedDatabaseBlock } from '../../extensions/databaseBlockSync'
import { resolveConflictHtml, type BlockConflictChoice, type SaveConflictChoice } from './saveConflict'

const props = defineProps<{
  documentId: string
  projectId: string
  icon?: string
  /** 需要插入正文的编辑器模板 id（从「新建 → 文档」进来时带上）。 */
  editorTemplate?: string
  /** 节点被锁定时文档只读。 */
  locked?: boolean
  /** 目录树里的路径：文档头部面包屑。 */
  breadcrumb?: { id: string; title: string }[]
  /** 目录节点 id：关联推荐按节点查。 */
  nodeId?: string
}>()
const emit = defineEmits<{
  back: []
  'open-related': [documentId: string]
  'open-sheet-node': [payload: { nodeId: string; title: string }]
  'open-node': [nodeId: string]
  'title-change': [title: string]
  'icon-change': [icon: string]
  'editor-template-applied': []
}>()

const doc = ref<DocumentFull | null>(null)
const html = ref('')
const title = ref('')
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const conflictOpen = ref(false)
const conflictMineHtml = ref('')
const conflictTheirsHtml = ref('')
const conflictRemoteVersion = ref<number | undefined>()
const selectedBlockId = ref('')
const selectedBlockPermission = ref('')
const selectedBlockPermHint = ref('')
const permSaving = ref(false)
const exporting = ref(false)
const iconOpen = ref(false)
const sidebarTab = ref<'outline' | 'tasks' | 'properties' | 'comments' | 'backrefs' | 'history' | 'versions' | 'audit' | 'ai'>('outline')
const shareVisible = ref(false)
const minutesVisible = ref(false)
/** 协同编辑：开启后走正文 Yjs（A2a WebSocket），关掉后回到单人 HTTP 保存。 */
const collabOn = ref(false)
/** 正文 Yjs 协同会话。旧 HTML 级 crdtDoc 旁路已只读，本按钮不再调用它。 */
const liveSession = ref<LiveCollabSession | null>(null)
const liveYDoc = shallowRef<YDoc | null>(null)
/** 协同进房后的可写状态：浏览者为 false，编辑器强制只读。 */
const collabWritable = ref(true)
const permissionActor = computed(() => ({
  canWrite: !props.locked && collabWritable.value,
  role: liveSession.value?.role || (props.locked ? 'viewer' : 'owner'),
}))
const selectedBlockLocked = computed(() =>
  Boolean(selectedBlockId.value) &&
  !canEditBlockContent(selectedBlockPermission.value, permissionActor.value.role, permissionActor.value.canWrite),
)
const authStore = useAuthStore()
const collabUser = computed(() => {
  const user = authStore.user
  const name = (user?.displayName || user?.email || '协作者').trim() || '协作者'
  const id = user?.id || 'anon'
  return { name, color: collabCaretColor(id), id }
})
/** 切换协同时重挂编辑器，以便按需接入 Collaboration 扩展。 */
const editorSessionKey = ref(0)
const presence = ref<PresenceUser[]>([])
const quote = ref('')
/** 划线区间：正文字符偏移（041）。 */
const anchorFrom = ref(-1)
const anchorTo = ref(-1)
const editorRef = ref<InstanceType<typeof RichTextEditor>>()
/** 反向引用面板：多维表格引用需要知识库节点 ID（关联文档字段存的是节点 ID）。 */
const appliedTemplate = ref('')
/** 专注模式：隐藏侧栏与头部，只留正文。 */
const focusMode = ref(false)
/** 关联推荐（064）。 */
const relatedDocs = ref<import('../../api/knowledge').KnowledgeSearchHit[]>([])
const relatedLoading = ref(false)
/** 最后编辑人（081/052）。 */
const lastEditor = ref('')
/** 正文待办块（045）。 */
const tasks = ref<knowledgeApiV5.DocTask[]>([])
/** 正文标题层级（051 目录块 / 046 大纲）。 */
const outlineItems = ref<knowledgeApiV5.OutlineItem[]>([])
let presenceTimer: ReturnType<typeof setInterval> | null = null
let sheetProbeTimer: ReturnType<typeof setInterval> | null = null

function editorForSheetSync() {
  const inst = editorRef.value as unknown as {
    editor?: Parameters<typeof syncLinkedDatabaseBlock>[0]
  } | null
  return inst?.editor
}

function onWindowFocusProbe() {
  void probeLinkedSheets()
}

let sheetProbeInFlight = false

async function probeLinkedSheets() {
  const editor = editorForSheetSync()
  if (!editor || !props.projectId || sheetProbeInFlight) return
  sheetProbeInFlight = true
  try {
    const io = {
      load: getNodeData,
      save: saveNodeData,
    }
    // 只读浏览只对照标状态，不自动写回或拉取。
    if (!permissionActor.value.canWrite) {
      await probeLinkedDatabaseBlocks(editor, props.projectId, io)
      return
    }
    const summary = await applySafeLinkedDatabaseBlocks(editor, props.projectId, io)
    if (summary.pulled || summary.pushed) {
      const parts: string[] = []
      if (summary.pulled) parts.push(`已自动拉取 ${summary.pulled} 张树上有更新的表`)
      if (summary.pushed) parts.push(`已自动写回 ${summary.pushed} 张仅内嵌改过的表`)
      ElMessage.success(`${parts.join('，')}。两边都改过的表仍需确认，不是实时双向同步。`)
    }
  } catch {
    // 对照失败不打断编辑；状态保持上次结果或尚未对照。
  } finally {
    sheetProbeInFlight = false
  }
}

const panelId = computed(() => `doc:${props.documentId}`)
/** 面包屑去掉最后一级：右侧已经有大标题，重复显示没有意义。 */
const crumbTrail = computed(() => {
  const list = props.breadcrumb ?? []
  return list.length > 1 ? list.slice(0, -1) : []
})
/** 阅读位置记忆作用域：同一篇文档下次打开回到上次滚动的地方。 */
const scrollMemoryKey = computed(() => `doc:${props.documentId}`)
const router = useRouter()

async function load() {
  loading.value = true
  try {
    doc.value = await getDocument(props.documentId)
    const data = doc.value.currentData as { html?: string }
    html.value = data.html ?? ''
    title.value = doc.value.title
    dirty.value = false
    void applyEditorTemplate()
    // 最近浏览：飞书知识库首页有「最近浏览」入口。
    void touchView(props.documentId).catch(() => undefined)
    void loadLastEditor()
    void loadRelated()
    void loadTasks()
    void loadOutline()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '加载文档失败'))
  } finally {
    loading.value = false
    await nextTick()
    void probeLinkedSheets()
  }
}

/** 最后编辑人：从版本作者表里取最近一次保存的人。 */
async function loadLastEditor() {
  try {
    const names = await listVersionAuthors(props.documentId)
    const entries = Object.entries(names)
    if (entries.length) {
      lastEditor.value = entries[entries.length - 1][1]
    }
  } catch {
    lastEditor.value = ''
  }
}

function onHtml(next: string) {
  html.value = next
  if (liveSession.value) {
    liveSession.value.noteHtml(next)
    dirty.value = true
    // 实时协同下 current_data 由服务端随 Yjs 增量双写，避免和 HTTP 保存抢同一把版本锁。
    // 单人编辑仍走下面的 scheduleSave，保存管线没有关掉。
    return
  }
  dirty.value = true
  scheduleSave()
}

/** 插入 AI 续写建议。 */
function insertSuggestion(text: string) {
  const inst = editorRef.value as unknown as {
    editor?: { commands?: { insertContent?: (content: string) => boolean } }
  } | null
  const inserted = inst?.editor?.commands?.insertContent?.(text)
  if (!inserted) {
    html.value = `${html.value}${text}`
    dirty.value = true
    scheduleSave()
  }
}

function stopLiveCollab() {
  liveSession.value?.stop()
  liveSession.value = null
  liveYDoc.value?.destroy()
  liveYDoc.value = null
  collabWritable.value = true
  if (collabOn.value) editorSessionKey.value += 1
  collabOn.value = false
}

/** 开启 / 关闭正文 Yjs 协同（编辑模式之一）。关闭后走单人保存，不再写 doc_crdt_updates。 */
async function toggleCollab() {
  if (collabOn.value) {
    stopLiveCollab()
    ElMessage.info('已退出协同模式')
    return
  }
  const token = getToken()
  if (!token) {
    ElMessage.error('登录已失效，无法开启协同')
    return
  }
  const ydoc = createCollabYDoc()
  const session = new LiveCollabSession({
    documentId: props.documentId,
    token,
    ydoc,
    htmlProvider: () => html.value,
    onError: () => {
      ElMessage.warning('协同同步暂时不可用，已继续本地编辑')
    },
    onHello: (info) => {
      const writable = isCollabWritable(info)
      const changed = collabWritable.value !== writable
      collabWritable.value = writable
      if (changed && !writable) {
        ElMessage.info('当前是只读协同，无法编辑正文')
      }
    },
    onPresence: (users) => {
      if (Array.isArray(users)) presence.value = users as PresenceUser[]
    },
    user: collabUser.value,
  })
  try {
    await session.start()
    liveYDoc.value = ydoc
    liveSession.value = session
    collabWritable.value = isCollabWritable({ canWrite: session.canWrite, role: session.role })
    collabOn.value = true
    editorSessionKey.value += 1
    ElMessage.success(collabWritable.value ? '已进入协同模式' : '已进入只读协同模式')
  } catch {
    session.stop()
    ydoc.destroy()
    ElMessage.error('协同模式开启失败')
  }
}

/**
 * 插入「新建」时选的模板：模板是 TipTap JSON，只能由编辑器自己插入并序列化，
 * 所以等编辑器就绪后调 insertDocTemplate，再把序列化出的 HTML 存回文档。
 */
async function applyEditorTemplate() {
  const id = props.editorTemplate
  if (!id || !doc.value || appliedTemplate.value === id) return
  appliedTemplate.value = id
  await nextTick()
  type EditorInstance = {
    editor?: { getHTML: () => string }
    insertDocTemplate?: (templateId: string) => void
  }
  let inst: EditorInstance | null = null
  for (let i = 0; i < 40; i++) {
    inst = editorRef.value as unknown as EditorInstance | null
    if (inst?.editor) break
    await new Promise((r) => setTimeout(r, 50))
  }
  if (!inst?.editor || !inst.insertDocTemplate) return
  inst.insertDocTemplate(id)
  onHtml(inst.editor.getHTML())
  emit('editor-template-applied')
}

/** 点击 @ 文档 mention 节点跳转到目标文档。 */
function onEditorClick(e: MouseEvent) {
  refreshSelectedBlock(e)
  const target = e.target as HTMLElement
  const mention = target.closest('.rte-mention[data-type="mention"]') as HTMLElement | null
  if (mention) {
    const docId = mention.getAttribute('data-id')
    if (docId && /^[0-9a-fA-F-]{36}$/.test(docId)) {
      e.preventDefault()
      emit('back')
      void router.push({
        name: 'knowledge-doc',
        params: { projectId: props.projectId, documentId: docId },
      })
    }
    return
  }
  const embed = target.closest('.rte-canvas-embed[data-type="canvasEmbed"]') as HTMLElement | null
  if (embed) {
    const docId = embed.getAttribute('data-doc-id')
    if (docId) {
      e.preventDefault()
      emit('back')
      void router.push({
        name: 'node-graph',
        params: { projectId: props.projectId, canvasId: docId },
      })
    }
    return
  }
  const sheet = target.closest('[data-type="database-block"], [data-type="databaseBlock"]') as HTMLElement | null
  if (sheet) {
    const nodeId = (sheet.getAttribute('data-sheet-node-id') || '').trim()
    if (nodeId) {
      e.preventDefault()
      emit('open-sheet-node', {
        nodeId,
        title: (sheet.getAttribute('data-title') || '').trim() || '多维表格',
      })
    }
  }
}


function refreshSelectedBlock(e?: Event) {
  const inst = editorRef.value as unknown as {
    editor?: { state?: { selection?: any; doc?: any } }
  } | null
  const sel = inst?.editor?.state?.selection
  const doc = inst?.editor?.state?.doc
  let id = ''
  if (e?.target instanceof Element) {
    const host = e.target.closest('[data-block-id]') as HTMLElement | null
    if (host) id = (host.getAttribute('data-block-id') || '').trim()
  }
  if (sel && doc) {
    const node = typeof sel.node === 'object' ? sel.node : null
    if (node) id = readBlockId(node) || ''
    if (!id && sel.$from) {
      for (let depth = sel.$from.depth; depth > 0; depth -= 1) {
        const got = readBlockId(sel.$from.node(depth))
        if (got) {
          id = got
          break
        }
      }
    }
  }
  if (id !== selectedBlockId.value) {
    selectedBlockId.value = id
    selectedBlockPermission.value = ''
    selectedBlockPermHint.value = ''
    if (id) void loadBlockPermission(id)
  }
}

async function loadBlockPermission(blockId: string) {
  try {
    const row = await getDocumentBlock(props.documentId, blockId)
    if (selectedBlockId.value !== blockId) return
    selectedBlockPermission.value = row.permission || ''
    selectedBlockPermHint.value = ''
  } catch (err: unknown) {
    if (selectedBlockId.value !== blockId) return
    const status = (err as { status?: number }).status
    selectedBlockPermHint.value = status === 404 ? '保存文档后才能设置这块的权限' : '无法读取块级权限'
  }
}


let boundSelectionEditor: { on?: (ev: string, fn: () => void) => void; off?: (ev: string, fn: () => void) => void } | null = null

function onEditorSelectionUpdate() {
  refreshSelectedBlock()
}

function bindEditorSelection(editor: typeof boundSelectionEditor) {
  if (boundSelectionEditor && boundSelectionEditor !== editor) {
    boundSelectionEditor.off?.('selectionUpdate', onEditorSelectionUpdate)
    boundSelectionEditor = null
  }
  if (!editor?.on || boundSelectionEditor === editor) return
  editor.on('selectionUpdate', onEditorSelectionUpdate)
  boundSelectionEditor = editor
}

function unbindEditorSelection() {
  boundSelectionEditor?.off?.('selectionUpdate', onEditorSelectionUpdate)
  boundSelectionEditor = null
}

async function refreshBlockPermissionGuard(attempt = 0) {
  const inst = editorRef.value as unknown as {
    editor?: Parameters<typeof setBlockPermissionGuardState>[0]
  } | null
  const editor = inst?.editor
  if (!editor) {
    if (attempt < 8) window.setTimeout(() => void refreshBlockPermissionGuard(attempt + 1), 80)
    return
  }
  bindEditorSelection(editor as typeof boundSelectionEditor)
  const actor = permissionActor.value
  try {
    const rows = await listDocumentBlocks(props.documentId)
    const permissions: Record<string, string> = {}
    for (const row of rows) {
      if (row.id) permissions[row.id] = row.permission || ''
    }
    setBlockPermissionGuardState(editor, {
      role: actor.role,
      canWrite: actor.canWrite,
      permissions,
    })
  } catch {
    setBlockPermissionGuardState(editor, {
      role: actor.role,
      canWrite: actor.canWrite,
    })
  }
}

async function onBlockPermissionChange(permission: string) {
  const blockId = selectedBlockId.value
  if (!blockId) return
  permSaving.value = true
  try {
    const row = await updateBlockPermission(props.documentId, blockId, permission)
    if (selectedBlockId.value === blockId) {
      selectedBlockPermission.value = row.permission || permission
      selectedBlockPermHint.value = ''
    }
    await refreshBlockPermissionGuard()
    ElMessage.success('块级权限已更新')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '设置块级权限失败'))
  } finally {
    permSaving.value = false
  }
}

/** 划线评论：记录选中的文本与字符区间，作为评论引用与跳转锚点。 */
function onSelectionChange(e?: Event) {
  refreshSelectedBlock(e)

  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (text.length < 2 || text.length > 500) {
    quote.value = ''
    anchorFrom.value = -1
    anchorTo.value = -1
    return
  }
  quote.value = text
  const inst = editorRef.value as unknown as {
    editor?: { state?: { selection?: { from?: number; to?: number } } }
  } | null
  const sel = inst?.editor?.state?.selection
  if (sel && typeof sel.from === 'number' && typeof sel.to === 'number') {
    anchorFrom.value = sel.from
    anchorTo.value = sel.to
  } else {
    anchorFrom.value = -1
    anchorTo.value = -1
  }
}

/** 在线协作：定时上报心跳并刷新协作者列表。 */
async function syncPresence() {
  try {
    await heartbeatPresence(props.documentId, dirty.value, currentCursor())
    presence.value = await listPresence(props.documentId)
  } catch {
    /* 心跳失败不打扰用户 */
  }
}

/** 当前光标位置（077）：标题文本 + 段落偏移，用于「跳到 TA 的位置」。 */
function currentCursor() {
  const inst = editorRef.value as unknown as {
    editor?: { state?: { selection?: { $from?: { parent?: { textContent?: string } }; from?: number } } }
  } | null
  const sel = inst?.editor?.state?.selection
  if (!sel?.$from) return ''
  const text = sel.$from.parent?.textContent ?? ''
  return `${text.slice(0, 40)}@${sel.from ?? 0}`
}

/** 当前段落文本：写作补全的上下文。 */
function currentParagraph(): string {
  const inst = editorRef.value as unknown as {
    editor?: { state?: { selection?: { $from?: { parent?: { textContent?: string } } } } }
  } | null
  return inst?.editor?.state?.selection?.$from?.parent?.textContent ?? ''
}

/** 待办块（045）。 */
async function loadTasks() {
  try {
    tasks.value = await knowledgeApiV5.getDocTasks(props.documentId)
  } catch {
    tasks.value = []
  }
}

async function toggleTask(task: knowledgeApiV5.DocTask) {
  await knowledgeApiV5.toggleDocTask(props.documentId, task.index, !task.checked)
  await loadTasks()
}

/** 标题层级（051/046）。 */
async function loadOutline() {
  try {
    outlineItems.value = await knowledgeApiV5.getDocOutline(props.documentId)
  } catch {
    outlineItems.value = []
  }
}

/** 插入目录块（051）：按当前标题生成可点击目录。 */
function insertToc() {
  const items = outlineItems.value.filter((item) => item.text)
  if (!items.length) {
    ElMessage.warning('正文还没有标题，先加几个标题再插入目录')
    return
  }
  const list = items
    .map((item) => `<li style="margin-left:${(item.level - 1) * 16}px">${item.text}</li>`)
    .join('')
  const block = `<h2>目录</h2><ul>${list}</ul>`
  // TipTap 会丢掉自定义属性，目录块靠「目录」标题来识别与替换。
  const next = /<h2>目录<\/h2>/.test(html.value)
    ? html.value.replace(/<h2>目录<\/h2>[\s\S]*?<\/ul>/, block)
    : `${html.value}${block}`
  onHtml(next)
  ElMessage.success('目录已插入')
}

/** 导出 PDF（093）：用 html2canvas 渲染正文，jspdf 分页输出。 */
async function exportPdf() {
  if (exporting.value) return
  exporting.value = true
  try {
    const root = document.querySelector('.doc-view__editor .ProseMirror') as HTMLElement | null
    if (!root) throw new Error('正文未渲染')
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(root, { scale: 2, backgroundColor: '#ffffff' })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const ratio = canvas.height / canvas.width
    const imgHeight = pageWidth * ratio
    let remaining = imgHeight
    let position = 0
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, position, pageWidth, imgHeight)
    remaining -= pageHeight
    while (remaining > 0) {
      position -= pageHeight
      pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, position, pageWidth, imgHeight)
      remaining -= pageHeight
    }
    pdf.save(`${title.value || 'document'}.pdf`)
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '导出 PDF 失败'))
  } finally {
    exporting.value = false
  }
}

/** 导出 docx（094）：服务端生成，带登录态下载。 */
async function exportDocx() {
  if (exporting.value) return
  exporting.value = true
  try {
    const res = await apiRequestBlob(knowledgeApiV5.docxExportUrl(props.documentId))
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.value || 'document'}.docx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '导出 Word 失败'))
  } finally {
    exporting.value = false
  }
}

function onTitleInput(e: Event) {
  title.value = (e.target as HTMLInputElement).value
  dirty.value = true
  emit('title-change', title.value)
  scheduleSave()
}

function pickIcon(next: string) {
  iconOpen.value = false
  emit('icon-change', next)
}

/** 另存为模板（018）。 */
async function saveAsTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('模板名称', '另存为模板', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: title.value.trim() || '未命名模板',
    })
    await saveDocAsTemplate(props.documentId, value.trim())
    ElMessage.success('已保存到模板中心')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error('保存模板失败')
  }
}

/** 关联推荐：同作者 / 同引用 / 同标签的文档。 */
async function loadRelated() {
  if (!props.nodeId) {
    relatedDocs.value = []
    return
  }
  relatedLoading.value = true
  try {
    relatedDocs.value = await getRelatedDocs(props.projectId, props.nodeId)
  } catch {
    relatedDocs.value = []
  } finally {
    relatedLoading.value = false
  }
}

/** 目录树里重命名后同步过来：后端已改文档标题，这里只对齐输入框，免得下次保存把旧标题写回去。 */
defineExpose({
  setTitle(next: string) {
    title.value = next
  },
  /** 后端改过文档元信息（标题 / 图标）会推进 save_version：刷新它，下一次保存才不会误判冲突。 */
  async refreshSaveVersion() {
    if (!props.documentId || !doc.value) return
    try {
      const fresh = await getDocument(props.documentId)
      if (fresh.saveVersion != null) doc.value.saveVersion = fresh.saveVersion
    } catch {
      // 刷不到就沿用旧版本号，保存冲突时走原有的冲突处理流程。
    }
  },
})

/** 按格式导出：Markdown / HTML / 纯文本 / JSON。 */
async function exportAs(format: string) {
  if (exporting.value) return
  exporting.value = true
  try {
    const res = await exportKnowledgeDoc(props.documentId, format)
    const blob = new Blob([res.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.filename || 'document.txt'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '导出失败'))
  } finally {
    exporting.value = false
  }
}

/** 恢复历史版本：把 html 设为目标版本并标记 dirty，由防抖保存落库。 */
function onRestored(restoredHtml: string) {
  html.value = restoredHtml
  dirty.value = true
  scheduleSave()
}

function scheduleSave() {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(save, 1200)
}

/** 失焦立即保存：编辑器内的防抖保存有 1.2s 延迟，切走时不该留下未保存内容。 */
function onEditorBlur() {
  if (!dirty.value) return
  if (saveTimer.value) {
    clearTimeout(saveTimer.value)
    saveTimer.value = null
  }
  void save()
}

async function save() {
  if (!doc.value) return
  if (saveTimer.value) {
    clearTimeout(saveTimer.value)
    saveTimer.value = null
  }
  saving.value = true
  try {
    // 正文仍然以 HTML 为事实源，同时把 Markdown 源码一起存进库（content_markdown 列）
    const payload = { type: 'doc', html: html.value, markdown: htmlToMarkdown(html.value) }
    const updated = await updateDocument(props.documentId, {
      title: title.value.trim() || '无标题',
      currentData: payload as never,
      expectedSaveVersion: doc.value.saveVersion,
      operationId: `doc-save-${Date.now()}`,
    })
    doc.value = updated
    dirty.value = false
    void refreshBlockPermissionGuard()
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 409) {
      // 冲突不当成静默覆盖：给出可操作的三选一（086）。
      await resolveConflict()
    } else {
      ElMessage.error(friendlyApiMessage(err, '保存失败'))
    }
  } finally {
    saving.value = false
  }
}

/** 409 冲突处置：拉取对方版本，打开「谁的版本」面板。 */
async function resolveConflict() {
  const mine = html.value
  try {
    const latest = await getDocument(props.documentId)
    const data = latest.currentData as { html?: string }
    conflictMineHtml.value = mine
    conflictTheirsHtml.value = data.html ?? ''
    conflictRemoteVersion.value = latest.saveVersion
    conflictOpen.value = true
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '无法拉取对方版本，冲突仍未解决'))
  }
}

async function applyConflictChoice(choice: SaveConflictChoice, blockChoices?: Record<string, BlockConflictChoice>) {
  const next = resolveConflictHtml(choice, {
    mineHtml: conflictMineHtml.value,
    theirsHtml: conflictTheirsHtml.value,
  }, blockChoices)
  conflictOpen.value = false
  if (choice === 'theirs') {
    html.value = next
    await load()
    ElMessage.info('已使用对方的版本')
    return
  }
  html.value = next
  try {
    const payload = { type: 'doc', html: next }
    if (choice === 'mine') {
      doc.value = await updateDocument(props.documentId, {
        title: title.value.trim() || '无标题',
        currentData: payload as never,
        operationId: `doc-force-${Date.now()}`,
      })
      dirty.value = false
      ElMessage.success('已使用你的版本覆盖保存')
      return
    }
    doc.value = await updateDocument(props.documentId, {
      title: title.value.trim() || '无标题',
      currentData: payload as never,
      expectedSaveVersion: conflictRemoteVersion.value,
      operationId: `doc-merge-${Date.now()}`,
    })
    dirty.value = false
    ElMessage.success('已合并两边并保存')
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 409) {
      await resolveConflict()
      ElMessage.warning('保存时再次冲突，请重新选择')
      return
    }
    ElMessage.error(friendlyApiMessage(err, '解决冲突失败'))
  }
}


async function onDatabaseBlockSync(ev: Event) {
  const detail = (ev as CustomEvent<DatabaseBlockSyncDetail>).detail
  if (!detail?.sheetNodeId) return
  const editor = editorForSheetSync()
  if (!editor) return
  try {
    const io = {
      load: getNodeData,
      save: saveNodeData,
    }
    let result = await syncLinkedDatabaseBlock(editor, props.projectId, detail, io)
    if (detail.direction === 'safe') {
      if (result.action === 'noop') {
        ElMessage.info('已与知识库表格一致')
        return
      }
      if (result.action === 'aborted') {
        ElMessage.warning('两边都改过或尚未对照，请手动选择拉取或写回。安全同步不会覆盖另一侧的改动。')
        return
      }
    }
    if (result.action === 'aborted' && (result.diverged || result.drift === 'local-only' || result.drift === 'remote-only')) {
      const cover = result.drift === 'local-only'
        ? '内嵌块有尚未写回的改动，拉取会丢掉这些改动'
        : result.drift === 'remote-only'
          ? '树上表格有更新，写回会丢掉树上的改动'
          : (detail.direction === 'pull' ? '拉取会用树上表格覆盖内嵌块' : '写回会用内嵌块覆盖树上表格')
      const head = result.drift === 'both' ? '两边都改过。' : ''
      try {
        await ElMessageBox.confirm(`${head}${cover}。这只是手动快照，不是实时同步。确定继续？`, '表格已分叉', {
          type: 'warning',
          confirmButtonText: '继续覆盖',
          cancelButtonText: '取消',
        })
      } catch {
        ElMessage.info('已取消同步')
        return
      }
      result = await syncLinkedDatabaseBlock(editor, props.projectId, { ...detail, force: true }, io)
    }
    if (result.action === 'aborted') return
    ElMessage.success(result.action === 'pulled' ? '已从知识库表格拉取' : '已写回知识库表格')
    if (result.action === 'pulled' && result.droppedFilters > 0) {
      ElMessage.warning(`有 ${result.droppedFilters} 条筛选条件因字段已不存在被去掉`)
    }
    if (result.diverged) ElMessage.warning('已按你确认的方向覆盖，另一边未合并的改动会丢掉')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '同步知识库表格失败'))
  }
}

watch(() => props.documentId, load, { immediate: true })
watch(
  () => [props.documentId, permissionActor.value.role, permissionActor.value.canWrite, editorSessionKey.value, doc.value?.id] as const,
  () => { void refreshBlockPermissionGuard() },
)
/** 节点 ID 变化时，反查「哪些多维表格记录引用了本文档」。 */

watch(() => props.editorTemplate, () => void applyEditorTemplate())

/** 文档内嵌 Base 视图块里的「打开源表格」：跳到对应的多维表格节点。 */
function onOpenBaseNode(e: Event) {
  const nodeId = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId
  if (nodeId) emit('open-node', nodeId)
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener(DATABASE_BLOCK_SYNC_EVENT, onDatabaseBlockSync)
  window.addEventListener('rte:open-base-node', onOpenBaseNode)
  window.addEventListener('focus', onWindowFocusProbe)
  void syncPresence()
  presenceTimer = setInterval(() => void syncPresence(), 12000)
  sheetProbeTimer = setInterval(() => void probeLinkedSheets(), 15000)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener(DATABASE_BLOCK_SYNC_EVENT, onDatabaseBlockSync)
  window.removeEventListener('rte:open-base-node', onOpenBaseNode)
  window.removeEventListener('focus', onWindowFocusProbe)
  if (presenceTimer) clearInterval(presenceTimer)
  if (sheetProbeTimer) clearInterval(sheetProbeTimer)
  unbindEditorSelection()
  stopLiveCollab()
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
</script>

<template>
  <section class="doc-view">
    <header class="doc-view__head">
      <el-button
        class="doc-view__back"
        text
        :icon="ArrowLeft"
        title="返回目录"
        aria-label="返回目录"
        @click="emit('back')"
      />
      <!-- 路径只显示到父级：最后一级就是右侧的大标题，重复展示会显得冗余 -->
      <nav v-if="crumbTrail.length" class="doc-view__crumb">
        <template v-for="(item, index) in crumbTrail" :key="item.id">
          <span class="doc-view__crumb-item">{{ item.title }}</span>
          <span v-if="index < crumbTrail.length - 1" class="doc-view__crumb-sep">/</span>
        </template>
      </nav>
      <el-popover v-if="icon" v-model:visible="iconOpen" trigger="click" :width="420">
        <template #reference>
          <button type="button" class="doc-view__icon" title="更换图标" aria-label="更换图标">
            {{ icon }}
          </button>
        </template>
        <IconPicker
          :model-value="icon"
          :width="420"
          @update:model-value="pickIcon"
        />
      </el-popover>
      <input
        class="doc-view__title"
        v-model="title"
        @input="onTitleInput"
        placeholder="无标题文档"
        maxlength="200"
      />
      <span
        class="mm-bar__status"
        :class="{ 'is-saving': saving, 'is-dirty': dirty && !saving, 'is-saved': !dirty && !saving }"
      >
        <i class="mm-bar__status-dot" />
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else>已保存</span>
      </span>
      <div class="doc-view__meta">
        <span v-if="lastEditor" class="doc-view__last-editor">
          最后编辑：{{ lastEditor }}
        </span>
        <div v-if="presence.length" class="doc-view__presence">
          <el-avatar-group :size="24">
            <el-avatar
              v-for="user in presence"
              :key="user.userId"
              :src="user.avatar || undefined"
              :style="{ outline: `2px solid ${collabCaretColor(user.userId)}` }"
              :title="`${user.name}${user.editing ? '（正在编辑）' : ''}`"
            >
              {{ user.name.slice(0, 1) }}
            </el-avatar>
          </el-avatar-group>
          <span v-if="collabOn" class="doc-view__presence-count">在线 {{ presence.length }}</span>
        </div>
      </div>
      <!-- 工具栏：按使用频率排序，「更多」收口放最后 -->
      <div class="doc-view__actions">
        <!-- 次要操作：图标方块成组（Telegram 式紧凑工具簇） -->
        <div class="mm-bar__group mm-bar__group--icons">
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            text
            :icon="Tickets"
            title="插入目录"
            aria-label="插入目录"
            @click="insertToc"
          />
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            text
            :icon="Memo"
            title="会议纪要"
            aria-label="会议纪要"
            @click="minutesVisible = true"
          />
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            text
            :icon="Clock"
            title="版本历史"
            aria-label="版本历史"
            @click="sidebarTab = 'history'"
          />
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            :class="{ 'is-on': collabOn }"
            text
            :icon="Connection"
            :title="collabOn ? '退出协同编辑' : '开启协同编辑'"
            :aria-label="collabOn ? '退出协同编辑' : '开启协同编辑'"
            @click="toggleCollab"
          />
        </div>
        <div class="kn-doc__assist">
          <WriteAssist
            :document-id="props.documentId"
            :paragraph="currentParagraph()"
            @insert="insertSuggestion"
          />
        </div>
        <!-- 主要操作：分享（品牌蓝实心） -->
        <el-button
          class="mm-bar__btn mm-bar__btn--primary"
          text
          :icon="Share"
          title="分享"
          @click="shareVisible = true"
        >
          分享
        </el-button>
        <el-dropdown trigger="click" @command="(format: string) => exportAs(format)">
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            text
            :icon="Download"
            :loading="exporting"
            title="导出"
            aria-label="导出"
          />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
              <el-dropdown-item command="html">HTML</el-dropdown-item>
              <el-dropdown-item command="text">纯文本</el-dropdown-item>
              <el-dropdown-item command="json">JSON</el-dropdown-item>
              <el-dropdown-item command="pdf" divided @click.stop="exportPdf">PDF（分页）</el-dropdown-item>
              <el-dropdown-item command="docx" @click.stop="exportDocx">Word（docx）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click">
          <el-button
            class="mm-bar__btn mm-bar__btn--square"
            text
            :icon="MoreFilled"
            title="更多"
            aria-label="更多"
          />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="saveAsTemplate">另存为模板</el-dropdown-item>
              <el-dropdown-item @click="focusMode = !focusMode">
                {{ focusMode ? '退出专注模式' : '专注模式' }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <div v-if="locked" class="doc-view__lock">
      <el-icon><Lock /></el-icon>
      此文档已被锁定，当前为只读状态。
    </div>
    <div v-else-if="collabOn && !collabWritable" class="doc-view__lock">
      <el-icon><Lock /></el-icon>
      协同房间为只读，浏览者不能编辑正文。
    </div>
    <div v-else-if="selectedBlockLocked" class="doc-view__lock">
      <el-icon><Lock /></el-icon>
      当前选中块只读，不能在编辑器里改这块，建议模式的接受或拒绝也不会绕过。
    </div>

    <div v-if="loading" class="doc-view__empty"><AppLoading /></div>
    <div v-else-if="!doc" class="doc-view__empty">文档不存在或已被删除。</div>
    <div v-else class="doc-view__body" :class="{ 'is-focus': focusMode }">
      <div v-if="locked" class="doc-view__readonly" v-html="html" />
      <RichTextEditor
        v-else
        :key="`${documentId}-${editorSessionKey}`"
        ref="editorRef"
        class="doc-view__editor"
        :panel-id="panelId"
        :scroll-memory-key="scrollMemoryKey"
        :knowledge-project-id="projectId"
        :collab-document="liveYDoc"
        :collab-provider="liveSession?.provider ?? null"
        :collab-user="collabUser"
        :editable="collabWritable"
        :compact="false"
        :expanded="true"
        :show-title="false"
        :show-bottom-bar="true"
        :show-publish-actions="false"
        placeholder="从这里开始写作…"
        :model-value="html"
        @update:model-value="onHtml"
        @click="onEditorClick"
        @mouseup="onSelectionChange"
        @focusout="onEditorBlur"
      />
      <aside class="doc-view__sidebar">
        <el-tabs v-model="sidebarTab" class="doc-view__tabs">
          <el-tab-pane name="outline">
              <template #label>
                <el-icon class="doc-view__tab-icon"><List /></el-icon>大纲
              </template>
            
            <DocOutline
              :html="html"
              :document-id="documentId"
              @reordered="loadOutline"
            />
          </el-tab-pane>
          <el-tab-pane name="tasks">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Select /></el-icon>任务
              </template>
            
            <div class="doc-view__tasks">
              <p v-if="!tasks.length" class="doc-view__tasks-empty">正文里还没有待办块。</p>
              <label v-for="task in tasks" :key="task.index" class="doc-view__task">
                <el-checkbox
                  :model-value="task.checked"
                  @change="(v: boolean) => toggleTask({ ...task, checked: v })"
                />
                <span :class="{ 'is-done': task.checked }">{{ task.text }}</span>
              </label>
            </div>
          </el-tab-pane>
          <el-tab-pane name="properties">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Setting /></el-icon>属性
              </template>
            
            <DocProperties :document-id="documentId" />
          </el-tab-pane>
          <el-tab-pane name="comments">
              <template #label>
                <el-icon class="doc-view__tab-icon"><ChatDotRound /></el-icon>评论
              </template>
            
            <DocComments
              :document-id="documentId"
              :quote="quote"
              :anchor-from="anchorFrom"
              :anchor-to="anchorTo"
              @quoted="quote = ''; anchorFrom = -1; anchorTo = -1"
            />
          </el-tab-pane>
          <el-tab-pane name="backrefs">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Link /></el-icon>反向引用
              </template>
            
            <DocBackrefs
              :document-id="documentId"
              :project-id="projectId"
              :node-id="props.nodeId"
              @back="emit('back')"
              @open-node="(nodeId) => emit('open-node', nodeId)"
            />
          </el-tab-pane>
          <el-tab-pane name="history">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Clock /></el-icon>历史
              </template>
            
            <DocHistory :document-id="documentId" @restored="onRestored" />
          </el-tab-pane>
          <el-tab-pane name="versions">
              <template #label>
                <el-icon class="doc-view__tab-icon"><CopyDocument /></el-icon>版本
              </template>
            
            <DocVersions :document-id="documentId" @restored="onRestored" />
          </el-tab-pane>
          <el-tab-pane name="audit">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Tickets /></el-icon>审计
              </template>
            <DocAudit :document-id="documentId" />
          </el-tab-pane>
          <el-tab-pane name="ai">
              <template #label>
                <el-icon class="doc-view__tab-icon"><MagicStick /></el-icon>智能
              </template>
            
            <AiPanel :project-id="projectId" :document-id="documentId" />
          </el-tab-pane>
          <el-tab-pane name="related">
              <template #label>
                <el-icon class="doc-view__tab-icon"><Collection /></el-icon>相关
              </template>
            
            <p v-if="relatedLoading" class="doc-view__related-empty">加载中…</p>
            <p v-else-if="!relatedDocs.length" class="doc-view__related-empty">暂无相关文档。</p>
            <ul v-else class="doc-view__related">
              <li
                v-for="item in relatedDocs"
                :key="item.nodeId"
                class="doc-view__related-item"
                @click="item.documentId && emit('open-related', item.documentId)"
              >
                <span class="doc-view__related-title">{{ item.title }}</span>
                <span v-if="item.author" class="doc-view__related-author">{{ item.author }}</span>
              </li>
            </ul>
          </el-tab-pane>
        </el-tabs>
      </aside>
    </div>
    <MeetingMinutesDialog
      v-model="minutesVisible"
      :project-id="props.projectId"
      :parent-id="props.nodeId ?? null"
    />
    <ShareDialog :document-id="documentId" :visible="shareVisible" @close="shareVisible = false" />
    <BlockPermissionPanel
      v-if="selectedBlockId"
      :block-id="selectedBlockId"
      :permission="selectedBlockPermission"
      :role="permissionActor.role"
      :can-write="permissionActor.canWrite"
      :saving="permSaving"
      :unavailable="selectedBlockPermHint"
      @change="onBlockPermissionChange"
    />
    <SaveConflictPanel
      v-if="conflictOpen"
      :versions="{ mineHtml: conflictMineHtml, theirsHtml: conflictTheirsHtml }"
      :remote-version="conflictRemoteVersion"
      @choose="applyConflictChoice"
    />
  </section>
</template>

<style scoped>
.doc-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
/* 头部玻璃条与功能区之间必须留出安全间距：
   1) z-index 高于功能区的 sticky(40)，任何滚动状态下头部都不会被功能区压住；
   2) 底部多留 6px + 动作组 4px，玻璃卡的圆角与投影不再压到功能区首行（此前被误读成「遮挡」）。 */
.doc-view__head {
  position: relative;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 14px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.34);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.doc-view__head .mm-bar__group {
  margin-bottom: 4px;
}
.doc-view__icon {
  flex: none;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.doc-view__icon:hover,
.doc-view__icon:focus-visible {
  background: var(--mm-hover, #f2f3f5);
}
.doc-view__icon-reset {
  margin-top: 8px;
}
.doc-view__title {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 18px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
  background: transparent;
}
.doc-view__title:focus {
  border-bottom: 2px solid var(--mm-blue, #1677ff);
}
/* 工具栏：紧凑成组，靠右排列，分隔线与内容区区分 */
.doc-view__meta {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}
.doc-view__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
}
.doc-view__presence {
  margin-right: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.doc-view__presence :deep(.el-avatar) {
  outline-offset: 1px;
}
.doc-view__presence-count {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  white-space: nowrap;
}
.doc-view__empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--mm-muted, #86909c);
  font-size: 14px;
}
.doc-view__crumb {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--mm-muted, #86909c);
  max-width: 320px; overflow: hidden; white-space: nowrap;
}
.doc-view__crumb-item { overflow: hidden; text-overflow: ellipsis; }
.doc-view__crumb-sep { color: var(--mm-faint, #c9cdd4); }
.doc-view__last-editor { font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-view__tasks { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.doc-view__tasks-empty { font-size: 12px; color: var(--mm-muted, #86909c); }
.doc-view__task { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.doc-view__task .is-done { text-decoration: line-through; color: var(--mm-muted, #86909c); }
.doc-view__lock {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 16px;
  font-size: 12px;
  color: #b26a00;
  background: #fff7e6;
  border-bottom: 1px solid #ffe0a3;
}
.doc-view__readonly {
  flex: 1; min-width: 0; padding: 24px 32px; overflow: auto;
  background: var(--mm-surface, #fff);
}
.doc-view__related { list-style: none; margin: 0; padding: 0; }
.doc-view__related-item {
  padding: 6px 4px; cursor: pointer; border-bottom: 1px solid var(--mm-line, #f2f3f5);
  display: flex; flex-direction: column; gap: 2px;
}
.doc-view__related-item:hover { background: var(--mm-hover, #f2f3f5); }
.doc-view__related-title { font-size: 13px; color: var(--mm-text, #1d2129); }
.doc-view__related-author { font-size: 11px; color: var(--mm-muted, #86909c); }
.doc-view__related-empty { font-size: 12px; color: var(--mm-muted, #86909c); padding: 8px 4px; }
.doc-view__body.is-focus .doc-view__sidebar { display: none; }
.doc-view__body {
  border-top: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: auto;
  background: transparent;
}
.doc-view__editor {
  flex: 1;
  min-width: 0;
  min-height: 100%;
}
.doc-view__sidebar {
  flex: none;
  /* 220px 太窄：正文里的标题被截成「…」，侧栏页签也挤成一行。放宽 80px。 */
  width: 300px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border-left: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}

/* ---------------- 侧栏页签：Telegram 分段按钮组 + 单行横向滚动 ---------------- */
/* 9 个页签一行放不下：保持单行不换行，用原生横向滚动条（滚动条隐藏），
   滚轮/触控板可左右滑动；整组表现为一个分段按钮组：
   灰色圆角容器 + 白色药丸选中块 + 每项带图标，单项不再各自描边。 */
.doc-view__tabs :deep(.el-tabs__header) {
  margin: 0 0 10px;
  padding: 0;
}
/* 胶囊外壳画在 nav-wrap 上（不随内容滚动），滚动区只做内容渐隐，
   这样右侧「还有更多页签」的提示不会被胶囊圆角切掉。 */
.doc-view__tabs :deep(.el-tabs__nav-wrap) {
  position: relative;
  height: auto;
  overflow: hidden;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(12px) saturate(165%);
  -webkit-backdrop-filter: blur(12px) saturate(165%);
  border: 1px solid rgba(255, 255, 255, 0.62);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.doc-view__tabs :deep(.el-tabs__nav-scroll) {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-radius: inherit;
  /* 右侧渐隐：提示还可以继续横向滑动 */
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent 100%);
  mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent 100%);
}
.doc-view__tabs :deep(.el-tabs__nav-scroll::-webkit-scrollbar) {
  display: none;
  height: 0;
}
.doc-view__tabs :deep(.el-tabs__nav) {
  height: auto;
  flex-wrap: nowrap;
  gap: 2px;
  width: max-content;
  min-width: 100%;
}
.doc-view__tabs :deep(.el-tabs__nav-prev),
.doc-view__tabs :deep(.el-tabs__nav-next) {
  display: none;
}
.doc-view__tabs :deep(.el-tabs__active-bar) {
  display: none;
}
.doc-view__tabs :deep(.el-tabs__item) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  line-height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tg-text-2, #707579);
  font-size: 12.5px;
  font-weight: 400;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease,
    transform 0.16s ease;
}
.doc-view__tabs :deep(.el-tabs__item:hover) {
  color: var(--tg-text, #0f0f0f);
  background: rgba(255, 255, 255, 0.72);
}
.doc-view__tabs :deep(.el-tabs__item:hover .doc-view__tab-icon) {
  color: var(--tg-blue, #3390ec);
}
.doc-view__tabs :deep(.el-tabs__item.is-active) {
  color: var(--tg-blue, #3390ec);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(51, 144, 236, 0.12);
}
/* 页签图标：与文字基线对齐 */
.doc-view__tab-icon {
  font-size: 13.5px;
  line-height: 1;
  opacity: 0.9;
}
.doc-view__tabs :deep(.el-tabs__item.is-active) .doc-view__tab-icon {
  color: var(--tg-blue, #3390ec);
  opacity: 1;
}
.doc-view__tabs :deep(.el-tabs__content) {
  padding-top: 4px;
}
</style>
