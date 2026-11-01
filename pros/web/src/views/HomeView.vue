<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  useDocumentStore,
  isTemplateId,
  TEMPLATE_META,
  type TemplateId,
} from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import CanvasViewport from '../components/canvas/CanvasViewport.vue'
import RevisionHistory from '../components/canvas/RevisionHistory.vue'
import PageSettingsPanel from '../components/PageSettingsPanel.vue'
import { listDocumentsPage, type DocumentSummary } from '../api/documents'
import {
  getAIContext,
  listRevisions,
  diffRevisions,
} from '../api/documents'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyApiMessage } from '../utils/apiMessage'

const route = useRoute()
const router = useRouter()
const documentStore = useDocumentStore()
const ui = useUiStore()
const auth = useAuthStore()
const { dirty, saving, document_id, conflict } = storeToRefs(documentStore)

const statusMsg = ref('')
const docsOpen = ref(false)
const myDocs = ref<DocumentSummary[]>([])
const docsLoading = ref(false)
const docsError = ref('')
const docsPage = ref(0)
const docsTotal = ref(0)
const docsHasMore = ref(false)
const docsPageSize = 20
const historyOpen = ref(false)
const saveFailed = ref(false)
const offline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

const templateId = computed<TemplateId>(() => {
  const raw = String(route.params.templateId ?? 'dual-triangle')
  return isTemplateId(raw) ? raw : 'dual-triangle'
})

const badge = computed(() => TEMPLATE_META[templateId.value].badge)
const syncLabel = computed(() => {
  if (saving.value) return '同步中…'
  if (offline.value && dirty.value) return '网络已断开，修改留在本机'
  if (saveFailed.value) return '同步失败，可重试'
  if (statusMsg.value) return statusMsg.value
  if (!auth.isAuthenticated) return dirty.value ? '本地未保存' : '仅本地'
  if (dirty.value) return '未同步'
  return document_id.value ? '已同步' : '未建档'
})

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

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!documentStore.dirty) return
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

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('online', onNetworkOnline)
  window.addEventListener('offline', onNetworkOffline)
})

onBeforeRouteLeave(() => {
  if (!documentStore.dirty) return true
  return window.confirm('画布还有未同步的修改。离开后本机仍保留草稿，云端可能不是最新。确定离开？')
})

watch(
  () => dirty.value,
  (d) => {
    if (d) scheduleAutoSave()
  },
)

async function bootstrap() {
  statusMsg.value = ''
  const qid = typeof route.query.documentId === 'string' ? route.query.documentId : ''
  if (qid && auth.isAuthenticated) {
    try {
      await documentStore.load(qid)
      return
    } catch (e) {
      statusMsg.value = friendlyApiMessage(e, '打开文档失败')
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
  documentStore.persistLocal(templateId.value)
  if (!auth.isAuthenticated) {
    statusMsg.value = '已存本地（登录后可同步云端）'
    documentStore.dirty = false
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
    statusMsg.value = '任务名称为空，已仅存本地'
    documentStore.dirty = false
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
    statusMsg.value = checkpoint ? '已存版' : '已同步'
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
  await loadDocsPage()
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

async function openDoc(id: string) {
  docsOpen.value = false
  try {
    await documentStore.load(id)
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
        <span class="badge">{{ badge }}</span>
      </div>
      <div class="actions">
        <span class="meta">{{ syncLabel }}</span>
        <template v-if="auth.isAuthenticated">
          <router-link class="user" :to="{ name: 'account' }">{{ auth.user?.displayName || auth.user?.email }}</router-link>
          <el-button size="small" @click="openDocsPanel">我的文档</el-button>
          <el-button size="small" @click="newDocument">新建</el-button>
          <el-button size="small" @click="manualCheckpoint">存版</el-button>
          <el-button size="small" @click="historyOpen = true">版本</el-button>
          <el-button size="small" @click="copyAIContext(false)">AI 上下文</el-button>
          <el-button size="small" @click="diffPrevRevision">与上一版对比</el-button>
        </template>
        <el-button
          v-else
          size="small"
          @click="requireLogin()"
        >
          登录同步
        </el-button>
        <el-button size="small" type="primary" :loading="saving" @click="doSave(false)">
          保存
        </el-button>
        <el-button size="small" @click="ui.toggleConfigPanel">
          设置
        </el-button>
      </div>
    </header>
    <p v-if="saveFailed || offline" class="save-retry" role="status">
      {{ offline ? '网络已断开，修改留在本机。' : '同步没有成功，修改仍在本机。' }}
      <button type="button" class="mm-btn mm-btn--primary" :disabled="saving || offline" @click="doSave(false)">
        重试同步
      </button>
    </p>
    <Teleport to="body">
    <div v-if="conflict" class="conflict conflict-float" role="alert">
      <p>这份画布刚在其他地方保存过。编辑区已换成云端最新内容，你刚才未同步的修改还留着。</p>
      <div class="conflict-actions">
        <button type="button" class="conflict-primary" @click="restoreMine">恢复我的修改并保存</button>
        <button type="button" class="conflict-ghost" @click="keepServerVersion">保留云端版本</button>
      </div>
    </div>
    </Teleport>
    <div class="workspace">
      <main class="main">
        <CanvasViewport />
      </main>
      <PageSettingsPanel />
    </div>

    <RevisionHistory
      :open="historyOpen"
      :document-id="document_id"
      @close="historyOpen = false"
    />

    <el-drawer v-model="docsOpen" title="我的文档" size="360px">
      <p v-if="docsLoading">正在读取这个模板下的文档…</p>
      <p v-else-if="docsError" class="empty" role="alert">
        {{ docsError }}
        <button type="button" class="mm-btn mm-btn--ghost" @click="loadDocsPage">重试</button>
      </p>
      <p v-else-if="docsTotal === 0" class="empty">这个模板下还没有云端画布。填写任务名称后保存即可建档。</p>
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
          <button type="button" @click="openDoc(d.id)">
            <strong>{{ d.title || '未命名' }}</strong>
            <span>修订 {{ new Date(d.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            <span class="sub">创建 {{ new Date(d.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            <span v-if="d.notes" class="notes">{{ d.notes }}</span>
          </button>
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
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #dadce0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.badge {
  font-size: 12px;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.meta {
  font-size: 12px;
  color: #5f6368;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user {
  font-size: 12px;
  color: #1a73e8;
  text-decoration: none;
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

.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
