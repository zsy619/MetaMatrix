<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  useDocumentStore,
  resolveTemplateId,
  TEMPLATE_META,
  type TemplateId,
} from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import { NODE_GRAPH_TYPE } from '../types/nodeGraph'
import CanvasViewport from '../components/canvas/CanvasViewport.vue'
import RevisionHistory from '../components/canvas/RevisionHistory.vue'
import PageSettingsPanel from '../components/PageSettingsPanel.vue'
import { batchDocuments, listDocumentsPage, renameDocument, type DocumentSummary } from '../api/documents'
import LineSkeleton from '../components/ui/LineSkeleton.vue'
import {
  getAIContext,
  listRevisions,
  diffRevisions,
} from '../api/documents'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Camera, Check, Clock, Document, Loading, MagicStick, MoreFilled, Plus, Setting, Switch } from '@element-plus/icons-vue'
import { friendlyApiMessage } from '../utils/apiMessage'
import { focusSearchMatch } from '../utils/highlight'
import { trapTab } from '../utils/focusTrap'

const route = useRoute()
const router = useRouter()
const documentStore = useDocumentStore()
const ui = useUiStore()
const auth = useAuthStore()
const {
  dirty,
  saving,
  document_id,
  conflict,
  localPersistError,
  remoteSaveNotice,
} = storeToRefs(documentStore)

const statusMsg = ref('')
const docsOpen = ref(false)
const myDocs = ref<DocumentSummary[]>([])
const docsLoading = ref(false)
const docsError = ref('')
const docsPage = ref(0)
const docsTotal = ref(0)
const docsHasMore = ref(false)
const docsPageSize = 20
const docsArchived = ref(false)
const docsSelected = ref<string[]>([])
const docsConfirm = ref(false)
const historyOpen = ref(false)
const saveFailed = ref(false)
const openError = ref('')
const conflictBox = ref<HTMLElement | null>(null)
const offline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

const routeTemplateRaw = computed(() => String(route.params.templateId ?? ''))
const resolvedTemplateId = computed(() => resolveTemplateId(routeTemplateRaw.value))
const unknownTemplate = computed(() => routeTemplateRaw.value.length > 0 && resolvedTemplateId.value == null)
const templateId = computed<TemplateId>(() => resolvedTemplateId.value ?? 'dual-triangle')

const badge = computed(() => (unknownTemplate.value ? '未找到' : TEMPLATE_META[templateId.value].badge))
const canvasName = computed(() => (unknownTemplate.value ? '没有这张画布' : TEMPLATE_META[templateId.value].name))
const syncLabel = computed(() => {
  if (saving.value) return '同步中…'
  if (localPersistError.value) {
    return dirty.value ? '本地保存失败，修改未保存' : '云端已同步，本地缓存失败'
  }
  if (offline.value && dirty.value) return '网络已断开，修改留在本机'
  if (saveFailed.value) return '同步失败，可重试'
  if (remoteSaveNotice.value) return '另一标签页有新版本'
  if (statusMsg.value) return statusMsg.value
  if (!auth.isAuthenticated) return dirty.value ? '本地未保存' : '仅本地'
  if (dirty.value) return '未同步'
  return document_id.value ? '已同步' : '未建档'
})

const syncStateClass = computed(() => {
  if (saving.value) return 'is-saving'
  if (localPersistError.value || saveFailed.value) return 'is-error'
  if (dirty.value || offline.value) return 'is-dirty'
  return 'is-saved'
})

const userInitial = computed(() => {
  const name = auth.user?.displayName || auth.user?.email || ''
  return name ? name.slice(0, 1).toUpperCase() : '?'
})

function onMoreCommand(command: string) {
  if (command === 'ai') copyAIContext(false)
  else if (command === 'diff') diffPrevRevision()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function autosaveDelay(): number {
  try {
    const size = JSON.stringify(documentStore.current_data ?? '').length
    if (size > 400_000) return 3000
    if (size > 120_000) return 2000
  } catch {
    /* 体积未知时用默认间隔 */
  }
  return 1200
}

function scheduleAutoSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void doSave(false)
  }, autosaveDelay())
}

function hasUnsavedWork(): boolean {
  // dirty 只代表编辑/云端状态；本地存储失败本身也是离页风险，必须独立提醒。
  return documentStore.dirty || Boolean(documentStore.localPersistError)
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedWork()) return
  event.preventDefault()
  event.returnValue = ''
}

function onNetworkOnline() {
  offline.value = false
}

function onNetworkOffline() {
  offline.value = true
  saveFailed.value = true
  statusMsg.value = '网络已断开，修改留在本机。恢复后可重试同步。'
}

function onSaveHotkey() {
  void doSave(false)
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('online', onNetworkOnline)
  window.addEventListener('offline', onNetworkOffline)
  window.addEventListener('metamatrix:save', onSaveHotkey)
})

onBeforeRouteLeave(() => {
  if (!hasUnsavedWork()) return true
  if (documentStore.localPersistError) {
    return window.confirm('画布尚未可靠保存到本机，现在离开可能丢失修改。确定离开？')
  }
  return window.confirm('画布还有未同步的修改。离开后本机仍保留草稿，云端可能不是最新。确定离开？')
})

// 用编辑序号而不是 dirty 布尔值驱动自动保存。
// dirty 从 false 变 true 只发生一次，飞行期间的新编辑不会再次触发 watch，
// 于是旧实现会把新改动一直留在“未保存”状态。序号每次编辑都递增，天然可重入。
watch(
  () => documentStore.editSeq,
  () => scheduleAutoSave(),
)

async function revealSearchMatch() {
  const q = typeof route.query.q === 'string' ? route.query.q : ''
  const panel = typeof route.query.panel === 'string' ? route.query.panel : ''
  if (!q && !panel) return
  await nextTick()
  window.setTimeout(() => {
    focusSearchMatch(document.querySelector('.main'), q, panel)
  }, 80)
}

function onConflictKey(event: KeyboardEvent) {
  trapTab(event, conflictBox.value)
  if (event.key === 'Escape') keepServerVersion()
}

async function bootstrap() {
  if (unknownTemplate.value) return
  const raw = routeTemplateRaw.value
  if (resolvedTemplateId.value && raw && raw !== resolvedTemplateId.value) {
    await router.replace({
      name: 'canvas',
      params: { templateId: resolvedTemplateId.value },
      query: route.query,
    })
  }
  statusMsg.value = ''
  openError.value = ''
  const qid = typeof route.query.documentId === 'string' ? route.query.documentId : ''
  if (qid && auth.isAuthenticated) {
    try {
      await documentStore.load(qid)
      if (
        documentStore.loaded_canvas_type === NODE_GRAPH_TYPE &&
        documentStore.loaded_project_id
      ) {
        // 节点画布有自己的视图：模板画布渲染它只会得到一张白纸。
        await router.replace({
          name: 'node-graph',
          params: { projectId: documentStore.loaded_project_id, canvasId: qid },
        })
        return
      }
      await revealSearchMatch()
      return
    } catch (e) {
      openError.value = friendlyApiMessage(e, '打开文档失败')
      statusMsg.value = openError.value
    }
  }
  documentStore.loadFromTemplate(templateId.value)
  if (auth.isAuthenticated && !documentStore.document_id) {
    // Prefer most recent server doc for this template if no local draft dirty path
    try {
      const list = await documentStore.listMyDocuments(templateId.value)
      if (list.length > 0 && !documentStore.dirty) {
        // keep local draft if present; otherwise open latest
        const localExists = Boolean(documentStore.loadLocal(templateId.value))
        if (!localExists) {
          await documentStore.load(list[0].id)
          router.replace({
            name: 'canvas',
            params: { templateId: templateId.value },
            query: { documentId: list[0].id },
          })
        }
      }
    } catch {
      /* ignore list errors */
    }
  }
}

watch(conflict, async (value) => {
  if (!value) return
  await nextTick()
  conflictBox.value?.querySelector<HTMLElement>('button')?.focus()
})

watch(
  templateId,
  () => {
    void bootstrap()
  },
  { immediate: true },
)

watch(
  () => route.query.documentId,
  (id, prev) => {
    if (id && id !== prev) void bootstrap()
  },
)

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('online', onNetworkOnline)
  window.removeEventListener('offline', onNetworkOffline)
  window.removeEventListener('metamatrix:save', onSaveHotkey)
})


async function copyAIContext(asPlain: boolean) {
  if (!requireLogin()) return
  if (!document_id.value) {
    ElMessage.warning('请先保存文档到云端')
    return
  }
  try {
    const ctx = await getAIContext(document_id.value)
    const text = asPlain
      ? `# ${ctx.title}\n\n${ctx.plainText || ctx.summary}`
      : JSON.stringify(ctx, null, 2)
    await navigator.clipboard.writeText(text)
    ElMessage.success(asPlain ? '已复制纯文本' : '已复制 AI 上下文 JSON')
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '暂时无法复制 AI 上下文')
  }
}

async function diffPrevRevision() {
  if (!requireLogin()) return
  if (!document_id.value) {
    ElMessage.warning('请先保存文档到云端')
    return
  }
  try {
    const revs = await listRevisions(document_id.value)
    if (revs.length < 2) {
      ElMessage.info('暂无上一版可对比（至少需要两个存版）')
      return
    }
    // revs ordered DESC: [0]=head, [1]=previous
    const prev = revs[1]
    const diff = await diffRevisions(document_id.value, prev.id)
    const body =
      (diff.unified && diff.unified.trim()) ||
      diff.textDiff
        .map((op) => {
          const prefix = op.op === 'insert' ? '+ ' : op.op === 'delete' ? '- ' : '  '
          return prefix + op.text
        })
        .join('\n') ||
      '(无文本差异)'
    const hashNote = diff.contentHashChanged ? 'contentHash 已变化' : 'contentHash 相同'
    await ElMessageBox.alert(
      `<pre style="max-height:360px;overflow:auto;white-space:pre-wrap;font-size:12px;text-align:left">${escapeHtml(body)}\n\njsonPatch: ${diff.jsonPatch?.length ?? 0} ops\n${hashNote}</pre>`,
      `与上一版对比（${prev.label || prev.id.slice(0, 8)}）`,
      { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' },
    )
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '暂时无法对比上一版')
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function goGuide() {
  router.push({ name: 'guide' })
}

function requireLogin(): boolean {
  if (auth.isAuthenticated) return true
  router.push({
    name: 'login',
    query: { redirect: route.fullPath },
  })
  return false
}

async function doSave(checkpoint: boolean) {
  if (saving.value) {
    scheduleAutoSave()
    return
  }
  statusMsg.value = ''
  const localSaved = documentStore.persistLocal(templateId.value)
  if (!auth.isAuthenticated) {
    if (localSaved) {
      documentStore.dirty = false
      saveFailed.value = false
      statusMsg.value = '已存本地（登录后可同步云端）'
    } else {
      // 本地写入失败时绝不能再清 dirty，否则用户会看到“仅本地”的假安全感。
      statusMsg.value = documentStore.localPersistError || '本地保存失败，请重试'
    }
    return
  }
  const taskName = (documentStore.doc_title || '').trim()
  // 首次云端创建必须有任务名称
  if (!documentStore.document_id && !taskName) {
    statusMsg.value = '请先在右侧填写任务名称后再同步云端'
    return
  }
  // 任务名为空时跳过云端 PUT，仅本地
  if (documentStore.document_id && !taskName) {
    if (localSaved) {
      documentStore.dirty = false
      statusMsg.value = '任务名称为空，已仅存本地'
    } else {
      statusMsg.value = documentStore.localPersistError || '任务名称为空，且本地保存失败'
    }
    return
  }
  try {
    await documentStore.save({
      checkpoint,
      title: taskName || undefined,
      notes: documentStore.doc_notes,
    })
    if (documentStore.document_id && route.query.documentId !== documentStore.document_id) {
      router.replace({
        name: 'canvas',
        params: { templateId: templateId.value },
        query: { documentId: documentStore.document_id },
      })
    }
    saveFailed.value = false
    statusMsg.value = documentStore.localPersistError
      ? `${checkpoint ? '已存版' : '云端已同步'}，但本地缓存失败`
      : checkpoint
        ? '已存版'
        : '已同步'
  } catch (e) {
    saveFailed.value = true
    statusMsg.value = conflict.value
      ? '检测到编辑冲突。可以选择保留云端，或恢复刚才的修改再保存。'
      : offline.value
        ? '网络已断开，修改留在本机。恢复后可重试同步。'
        : friendlyApiMessage(e, '同步失败，修改仍在本机。')
  }
}

async function newDocument() {
  if (!requireLogin()) return
  let name = ''
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入新任务名称',
      '新建任务',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPlaceholder: '任务名称',
        inputValue: TEMPLATE_META[templateId.value]?.name || '',
        inputValidator: (v) => {
          if (!v || !String(v).trim()) return '任务名称不能为空'
          return true
        },
      },
    )
    name = String(value).trim()
  } catch {
    return
  }
  documentStore.resetToTemplate(templateId.value)
  documentStore.doc_title = name
  documentStore.doc_notes = ''
  try {
    const id = await documentStore.createOnServer({
      templateId: templateId.value,
      title: name,
      notes: '',
    })
    router.replace({
      name: 'canvas',
      params: { templateId: templateId.value },
      query: { documentId: id },
    })
    statusMsg.value = '已新建'
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '新建失败')
  }
}

async function loadDocsPage() {
  docsLoading.value = true
  docsError.value = ''
  try {
    const page = await listDocumentsPage({
      templateId: templateId.value,
      limit: docsPageSize,
      offset: docsPage.value * docsPageSize,
      archived: docsArchived.value,
    })
    myDocs.value = page.items
    docsTotal.value = page.total
    docsHasMore.value = page.hasMore
  } catch (e) {
    docsError.value = friendlyApiMessage(e, '文档列表暂时不可用')
    myDocs.value = []
    docsTotal.value = 0
    docsHasMore.value = false
  } finally {
    docsLoading.value = false
  }
}

async function openDocsPanel() {
  if (!requireLogin()) return
  docsOpen.value = true
  docsPage.value = 0
  docsSelected.value = []
  docsConfirm.value = false
  await loadDocsPage()
}

function toggleDocsArchived() {
  docsArchived.value = !docsArchived.value
  docsPage.value = 0
  docsSelected.value = []
  docsConfirm.value = false
  void loadDocsPage()
}

function toggleDocSelected(id: string) {
  docsSelected.value = docsSelected.value.includes(id)
    ? docsSelected.value.filter((item) => item !== id)
    : [...docsSelected.value, id]
}

async function applyDocBatch() {
  if (!docsSelected.value.length) return
  const action = docsArchived.value ? 'restore' : 'archive'
  const ids = [...docsSelected.value]
  try {
    await batchDocuments(action, ids)
    if (action === 'archive' && document_id.value && ids.includes(document_id.value)) {
      documentStore.resetToTemplate(templateId.value)
      await router.replace({
        name: 'canvas',
        params: { templateId: templateId.value },
        query: {},
      })
    }
    docsSelected.value = []
    docsConfirm.value = false
    statusMsg.value = action === 'archive' ? `已归档 ${ids.length} 份画布` : `已恢复 ${ids.length} 份画布`
    await loadDocsPage()
  } catch (e) {
    docsError.value = friendlyApiMessage(e, action === 'archive' ? '归档失败' : '恢复失败')
  }
}

function docsPrev() {
  if (docsPage.value <= 0 || docsLoading.value) return
  docsPage.value -= 1
  void loadDocsPage()
}

function docsNext() {
  if (!docsHasMore.value || docsLoading.value) return
  docsPage.value += 1
  void loadDocsPage()
}

async function commitTitle(event: Event) {
  const input = event.target as HTMLInputElement
  const next = input.value.trim()
  const prev = documentStore.doc_title
  if (!document_id.value || !next || next === prev) {
    input.value = prev
    return
  }
  documentStore.doc_title = next
  try {
    await renameDocument(document_id.value, next)
    statusMsg.value = '标题已更新'
  } catch (e) {
    documentStore.doc_title = prev
    input.value = prev
    statusMsg.value = friendlyApiMessage(e, '标题没有保存，已恢复原名')
  }
}

async function renameListed(d: DocumentSummary) {
  const next = window.prompt('画布标题', d.title || '未命名')
  if (next == null) return
  const title = next.trim()
  if (!title || title === d.title) return
  const prev = d.title
  d.title = title
  if (d.id === document_id.value) documentStore.doc_title = title
  try {
    await renameDocument(d.id, title)
    statusMsg.value = '标题已更新'
  } catch (e) {
    d.title = prev
    if (d.id === document_id.value) documentStore.doc_title = prev
    docsError.value = friendlyApiMessage(e, '标题没有保存，已恢复原名')
  }
}

async function openDoc(id: string) {
  docsOpen.value = false
  try {
    await documentStore.load(id)
    await revealSearchMatch()
    router.replace({
      name: 'canvas',
      params: { templateId: templateId.value },
      query: { documentId: id },
    })
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '打开文档失败')
  }
}

function keepServerVersion() {
  documentStore.discardConflict()
  statusMsg.value = '已保留云端版本'
}

async function restoreMine() {
  try {
    await documentStore.restoreConflictDraft()
    statusMsg.value = '已用你的修改覆盖并保存'
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '恢复修改失败')
  }
}

async function manualCheckpoint() {
  if (!requireLogin()) return
  try {
    await documentStore.checkpoint('manual-snapshot')
    statusMsg.value = '已手动存版'
  } catch (e) {
    statusMsg.value = friendlyApiMessage(e, '存版失败')
  }
}
</script>

<template>
  <div class="home">
    <header class="topbar">
      <div class="brand">
        <el-button size="small" text @click="goGuide">← 返回引导</el-button>
        <strong>元矩阵 MetaMatrix</strong>
        <input
          v-if="auth.isAuthenticated && document_id"
          class="title-input"
          :value="documentStore.doc_title"
          maxlength="255"
          aria-label="画布标题"
          @change="commitTitle"
        />
        <span v-else class="canvas-name">{{ canvasName }}</span>
        <span class="badge">{{ badge }}</span>
      </div>
      <div class="actions">
        <span class="mm-bar__status" :class="syncStateClass">
          <i class="mm-bar__status-dot" />
          <span>{{ syncLabel }}</span>
        </span>
        <template v-if="auth.isAuthenticated">
          <router-link class="user" :to="{ name: 'account' }" title="账号与设置">
            <span class="user__avatar">{{ userInitial }}</span>
            <span class="user__name">{{ auth.user?.displayName || auth.user?.email }}</span>
          </router-link>
          <div class="mm-bar__group">
            <el-tooltip content="我的文档" placement="bottom" :show-after="400">
              <button type="button" class="mm-bar__btn" aria-label="我的文档" @click="openDocsPanel">
                <el-icon><Document /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="新建画布" placement="bottom" :show-after="400">
              <button type="button" class="mm-bar__btn" aria-label="新建画布" @click="newDocument">
                <el-icon><Plus /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="存版（手动快照）" placement="bottom" :show-after="400">
              <button type="button" class="mm-bar__btn" aria-label="存版" @click="manualCheckpoint">
                <el-icon><Camera /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="版本历史" placement="bottom" :show-after="400">
              <button type="button" class="mm-bar__btn" aria-label="版本历史" @click="historyOpen = true">
                <el-icon><Clock /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </template>
        <el-button
          v-else
          size="small"
          @click="requireLogin()"
        >
          登录同步
        </el-button>
        <el-tooltip :content="ui.configPanelOpen ? '收起设置' : '页面设置'" placement="bottom" :show-after="400">
          <button
            type="button"
            class="mm-bar__btn mm-bar__btn--square home__settings"
            :class="{ 'is-active': ui.configPanelOpen }"
            :aria-pressed="ui.configPanelOpen"
            aria-label="页面设置"
            @click="ui.toggleConfigPanel"
          >
            <el-icon><Setting /></el-icon>
          </button>
        </el-tooltip>
        <button type="button" class="mm-bar__primary home__save" :disabled="saving" @click="doSave(false)">
          <el-icon class="home__save-icon" :class="{ 'is-spin': saving }">
            <Loading v-if="saving" />
            <Check v-else />
          </el-icon>
          <span>{{ saving ? '保存中…' : '保存' }}</span>
        </button>
        <el-dropdown v-if="auth.isAuthenticated" trigger="click" @command="onMoreCommand">
          <button type="button" class="mm-bar__btn mm-bar__btn--square" aria-label="更多操作">
            <el-icon><MoreFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="ai">
                <el-icon><MagicStick /></el-icon>
                <span>AI 上下文</span>
              </el-dropdown-item>
              <el-dropdown-item command="diff">
                <el-icon><Switch /></el-icon>
                <span>与上一版对比</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>
    <p v-if="openError" class="save-retry" role="alert">
      {{ openError }}
      <button type="button" class="mm-btn mm-btn--primary" @click="bootstrap">重试打开</button>
    </p>
    <p v-if="localPersistError" class="save-retry" role="alert">
      <span>{{ localPersistError }}</span>
      <button type="button" class="mm-btn mm-btn--primary" :disabled="saving" @click="doSave(false)">
        重试保存
      </button>
    </p>
    <p v-if="remoteSaveNotice" class="save-retry" role="status">
      另一标签页已保存到版本 {{ remoteSaveNotice.saveVersion }}（{{ remoteSaveNotice.updatedAt }}）。
      当前页已记录该版本，下次保存会先检查冲突，不会直接用旧草稿覆盖。
    </p>
    <p v-if="saveFailed || offline" class="save-retry" role="status">
      {{ offline ? (localPersistError ? '网络已断开，且本地保存失败。' : '网络已断开，修改留在本机。') : '同步没有成功，修改仍在本机。' }}
      <button type="button" class="mm-btn mm-btn--primary" :disabled="saving || offline" @click="doSave(false)">
        重试同步
      </button>
    </p>
    <Teleport to="body">
    <div
      v-if="conflict"
      ref="conflictBox"
      class="conflict conflict-float"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      tabindex="-1"
      @keydown="onConflictKey"
    >
      <p id="conflict-title">云端已有更新。编辑区换成了最新内容，你未同步的修改还留着，可以再保存回去。</p>
      <div class="conflict-actions">
        <button type="button" class="conflict-primary" @click="restoreMine">恢复我的修改并保存</button>
        <button type="button" class="conflict-ghost" @click="keepServerVersion">保留云端版本</button>
      </div>
    </div>
    </Teleport>
    <div class="workspace">
      <main class="main">
        <div v-if="unknownTemplate" class="missing-canvas">
          <p>没有名为「{{ routeTemplateRaw }}」的画布。</p>
          <el-button type="primary" @click="goGuide">返回引导</el-button>
        </div>
        <CanvasViewport v-else />
      </main>
      <PageSettingsPanel />
      <button
        v-if="!ui.configPanelOpen"
        type="button"
        class="settings-rail"
        @click="ui.toggleConfigPanel"
      >
        页面设置
      </button>
    </div>

    <RevisionHistory
      :open="historyOpen"
      :document-id="document_id"
      @close="historyOpen = false"
    />

    <el-drawer v-model="docsOpen" title="我的文档" size="360px">
      <div class="doc-tools">
        <button type="button" class="mm-btn mm-btn--ghost" @click="toggleDocsArchived">
          {{ docsArchived ? '查看在用画布' : '查看已归档' }}
        </button>
        <button
          type="button"
          class="mm-btn mm-btn--ghost"
          :disabled="!docsSelected.length"
          @click="docsConfirm = true"
        >
          {{ docsArchived ? '恢复所选' : '归档所选' }}（{{ docsSelected.length }}）
        </button>
      </div>
      <p v-if="docsConfirm && docsSelected.length" class="save-retry" role="alert">
        {{ docsArchived ? `确认恢复 ${docsSelected.length} 份画布？` : `确认归档 ${docsSelected.length} 份画布？它们会从在用列表消失，可再恢复。` }}
        <span>
          <button type="button" class="mm-btn mm-btn--primary" @click="applyDocBatch">再次确认</button>
          <button type="button" class="mm-btn mm-btn--ghost" @click="docsConfirm = false">取消</button>
        </span>
      </p>
      <LineSkeleton v-if="docsLoading" />
      <p v-else-if="docsError" class="empty" role="alert">
        {{ docsError }}
        <button type="button" class="mm-btn mm-btn--ghost" @click="loadDocsPage">重试</button>
      </p>
      <p v-else-if="docsTotal === 0" class="empty">
        {{ docsArchived ? '没有已归档的画布。' : '这个模板下还没有云端画布。填写任务名称后保存即可建档。' }}
      </p>
      <p v-else class="empty">
        第 {{ docsPage * docsPageSize + 1 }}–{{ docsPage * docsPageSize + myDocs.length }} 份，共 {{ docsTotal }} 份
      </p>
      <ul v-if="!docsLoading && !docsError && myDocs.length" class="doc-list">
        <li
          v-for="d in myDocs"
          :key="d.id"
          class="doc-item"
          :class="{ active: d.id === document_id }"
        >
          <label class="doc-check">
            <input
              type="checkbox"
              :checked="docsSelected.includes(d.id)"
              :aria-label="`选择 ${d.title || '未命名'}`"
              @change="toggleDocSelected(d.id)"
            />
          </label>
          <button type="button" @click="openDoc(d.id)">
            <strong>{{ d.title || '未命名' }}</strong>
            <span>修订 {{ new Date(d.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            <span class="sub">创建 {{ new Date(d.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            <span v-if="d.notes" class="notes">{{ d.notes }}</span>
          </button>
          <button type="button" class="mm-btn mm-btn--ghost" @click="renameListed(d)">改名</button>
        </li>
      </ul>
      <div v-if="!docsError && docsTotal > docsPageSize" class="doc-pager">
        <button type="button" class="mm-btn mm-btn--ghost" :disabled="docsPage === 0 || docsLoading" @click="docsPrev">上一页</button>
        <span>第 {{ docsPage + 1 }} 页</span>
        <button type="button" class="mm-btn mm-btn--ghost" :disabled="!docsHasMore || docsLoading" @click="docsNext">下一页</button>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: #e6dfd4;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 18px;
  background: rgba(255, 252, 247, 0.92);
  border-bottom: 1px solid rgba(62, 48, 28, 0.08);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.title-input {
  border: 1px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  max-width: 240px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 8px;
}
.title-input:focus {
  border-color: #dadce0;
  background: #fff;
}

.canvas-name {
  font-size: 14px;
  font-weight: 650;
  color: #202124;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-canvas {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #3c4043;
}

.badge {
  font-size: 12px;
  color: #1c4c7c;
  background: #e8f1fa;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.conflict {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  background: #fef7e0;
  border-bottom: 1px solid #f9e2ae;
}

.conflict-float {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(720px, calc(100vw - 24px));
  z-index: 5000;
  border: 1px solid #f9e2ae;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(32, 33, 36, 0.18);
}

.conflict p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.conflict-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.conflict-primary,
.conflict-ghost {
  font: inherit;
  cursor: pointer;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 650;
}

.conflict-primary {
  border: 0;
  background: #1a73e8;
  color: #fff;
}

.conflict-ghost {
  border: 1px solid #dadce0;
  background: #fff;
}

.user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px 0 3px;
  border-radius: 999px;
  color: var(--ent-text-2, #5a6472);
  text-decoration: none;
  font-size: 12px;
  transition: background-color 0.16s ease, box-shadow 0.16s ease;
}
.user:hover {
  background: rgba(255, 255, 255, 0.72);
  box-shadow: var(--glass-shadow-sm, 0 6px 18px rgba(15, 23, 42, 0.1));
}
.user__avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f8cff, #1264e8);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.user__name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 设置开关：打开态用主色描边+浅底提示当前面板已展开 */
.home__settings.is-active {
  background: rgba(47, 140, 255, 0.14);
  color: var(--mm-blue, #1677ff);
}

.home__save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.home__save:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.18);
}
.home__save-icon.is-spin {
  animation: home-spin 0.9s linear infinite;
}
@keyframes home-spin {
  to {
    transform: rotate(360deg);
  }
}

.save-retry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 8px 16px;
  background: #fef7e0;
  color: #202124;
  font-size: 13px;
}

.workspace {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-rail {
  flex: none;
  width: 40px;
  border: 0;
  border-left: 1px solid rgba(62, 48, 28, 0.1);
  background: #f7f4ee;
  color: #3c3428;
  writing-mode: vertical-rl;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  cursor: pointer;
}

.settings-rail:hover {
  background: #efeae2;
}

.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.doc-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.doc-check {
  padding-top: 12px;
}

.doc-item button {
  width: 100%;
  text-align: left;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-item.active button {
  border-color: #1a73e8;
  background: #e8f0fe;
}

.doc-item span {
  font-size: 12px;
  color: #5f6368;
}

.doc-item .sub {
  font-size: 11px;
  color: #80868b;
}

.doc-item .notes {
  font-size: 11px;
  color: #5f6368;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: #5f6368;
  font-size: 13px;
}

.doc-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
}

.doc-pager button {
  font: inherit;
  border: 1px solid #dadce0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.doc-pager button:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 800px) {
  .conflict {
    flex-direction: column;
    align-items: stretch;
  }
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
