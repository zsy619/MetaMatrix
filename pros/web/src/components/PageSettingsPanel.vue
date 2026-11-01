<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import html2canvas from 'html2canvas'
import {
  useDocumentStore,
  isTemplateId,
  TEMPLATE_META,
  type TemplateId,
} from '../stores/document'
import { useHistoryStore } from '../stores/history'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import type { DocumentSummary } from '../api/documents'
import {
  getAIContext,
  listRevisions,
  diffRevisions,
  deleteDocument,
} from '../api/documents'

const route = useRoute()
const router = useRouter()
const documentStore = useDocumentStore()
const history = useHistoryStore()
const ui = useUiStore()

const auth = useAuthStore()
const {
  dirty,
  head_revision_id,
  current_data,
  saving,
  activeTemplateId,
  document_id,
  doc_title,
  doc_notes,
  created_at,
  updated_at,
} = storeToRefs(documentStore)
const { zoom, snapEnabled, configPanelOpen } = storeToRefs(ui)
const { canUndo, canRedo } = storeToRefs(history)

const panelOpen = computed(() => configPanelOpen.value)
const exporting = ref(false)
const deletingId = ref<string | null>(null)
const titleInputRef = ref<{ focus?: () => void } | null>(null)

const storedDocs = ref<DocumentSummary[]>([])
const storedLoading = ref(false)

/** Accordion section keys — defaults + localStorage persistence */
type SectionKey =
  | 'document'
  | 'files'
  | 'stored'
  | 'ai'
  | 'edit'
  | 'view'

const SECTION_STORAGE_KEY = 'metamatrix:pageSettings:sections'

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  document: true,
  files: true,
  stored: false,
  ai: false,
  edit: false,
  view: false,
}

function readPersistedSections(): Partial<Record<SectionKey, boolean>> | null {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const out: Partial<Record<SectionKey, boolean>> = {}
    for (const key of Object.keys(DEFAULT_OPEN) as SectionKey[]) {
      if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean
    }
    return out
  } catch {
    return null
  }
}

function persistSections(state: Record<SectionKey, boolean>) {
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}

const saved = readPersistedSections()
const sectionOpen = reactive<Record<SectionKey, boolean>>({
  ...DEFAULT_OPEN,
  ...(saved || {}),
})

function toggleSection(key: SectionKey) {
  sectionOpen[key] = !sectionOpen[key]
  persistSections({ ...sectionOpen })
}

const templateId = computed<TemplateId>(() => {
  if (activeTemplateId.value && isTemplateId(activeTemplateId.value)) {
    return activeTemplateId.value
  }
  const raw = String(route.params.templateId ?? 'dual-triangle')
  return isTemplateId(raw) ? raw : 'dual-triangle'
})

const meta = computed(() => TEMPLATE_META[templateId.value])
const zoomPercent = computed(() => Math.round(zoom.value * 100))
const syncLabel = computed(() => (dirty.value ? '未保存' : '已同步'))

const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

/** Avoid pushing history while restoring undo/redo */
const restoring = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastPushedJson = ''

function snapshotCurrent() {
  if (!current_data.value || restoring.value) return
  const json = JSON.stringify(current_data.value)
  if (json === lastPushedJson) return
  history.push(current_data.value)
  lastPushedJson = json
}

watch(
  current_data,
  () => {
    if (restoring.value || !current_data.value) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      snapshotCurrent()
    }, 600)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

async function refreshStoredList() {
  if (!auth.isAuthenticated) {
    storedDocs.value = []
    return
  }
  storedLoading.value = true
  try {
    storedDocs.value = await documentStore.listMyDocuments(templateId.value)
  } catch {
    console.warn('[PageSettingsPanel.refreshStoredList] failed')
  } finally {
    storedLoading.value = false
  }
}

watch(
  [panelOpen, templateId, () => auth.isAuthenticated],
  ([open]) => {
    if (open) void refreshStoredList()
  },
  { immediate: true },
)

async function onSave() {
  const name = doc_title.value.trim()
  if (!name) {
    ElMessage.warning('请填写任务名称')
    await nextTick()
    titleInputRef.value?.focus?.()
    if (!sectionOpen.document) {
      sectionOpen.document = true
      persistSections({ ...sectionOpen })
    }
    return
  }
  snapshotCurrent()
  documentStore.doc_title = name
  try {
    if (!auth.isAuthenticated) {
      documentStore.persistLocal(templateId.value)
      documentStore.dirty = false
      ElMessage.success('已存本地')
      return
    }
    await documentStore.save({
      title: name,
      notes: doc_notes.value,
    })
    documentStore.persistLocal(templateId.value)
    if (
      documentStore.document_id &&
      route.query.documentId !== documentStore.document_id
    ) {
      await router.replace({
        name: 'canvas',
        params: { templateId: templateId.value },
        query: { documentId: documentStore.document_id },
      })
    }
    ElMessage.success('已保存')
    await refreshStoredList()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  }
}

async function onOpenStored(id: string) {
  if (id === document_id.value) return
  try {
    await documentStore.load(id)
    await router.replace({
      name: 'canvas',
      params: { templateId: templateId.value },
      query: { documentId: id },
    })
    history.clear()
    lastPushedJson = current_data.value
      ? JSON.stringify(current_data.value)
      : ''
    ElMessage.success('已打开文档')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '打开失败')
  }
}

async function onDeleteStored(d: DocumentSummary) {
  if (!auth.isAuthenticated) {
    ElMessage.warning('请先登录')
    return
  }
  const title = d.title || '未命名'
  try {
    await ElMessageBox.confirm(
      `确定删除已存文档「${title}」？此操作不可恢复。`,
      '删除文档',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  deletingId.value = d.id
  try {
    await deleteDocument(d.id)
    const wasCurrent = d.id === document_id.value
    storedDocs.value = storedDocs.value.filter((x) => x.id !== d.id)
    if (wasCurrent) {
      documentStore.resetToTemplate(templateId.value)
      documentStore.persistLocal(templateId.value)
      history.clear()
      lastPushedJson = current_data.value
        ? JSON.stringify(current_data.value)
        : ''
      await router.replace({
        name: 'canvas',
        params: { templateId: templateId.value },
        query: {},
      })
    }
    ElMessage.success('已删除文档')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deletingId.value = null
  }
}

async function onNewTask() {
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
  if (!auth.isAuthenticated) {
    documentStore.resetToTemplate(templateId.value)
    documentStore.doc_title = name
    documentStore.doc_notes = ''
    documentStore.persistLocal(templateId.value)
    history.clear()
    lastPushedJson = current_data.value
      ? JSON.stringify(current_data.value)
      : ''
    await router.replace({
      name: 'canvas',
      params: { templateId: templateId.value },
      query: {},
    })
    ElMessage.success('已新建本地任务')
    return
  }
  try {
    documentStore.resetToTemplate(templateId.value)
    documentStore.doc_title = name
    documentStore.doc_notes = ''
    const id = await documentStore.createOnServer({
      templateId: templateId.value,
      title: name,
      notes: '',
    })
    await router.replace({
      name: 'canvas',
      params: { templateId: templateId.value },
      query: { documentId: id },
    })
    history.clear()
    lastPushedJson = current_data.value
      ? JSON.stringify(current_data.value)
      : ''
    ElMessage.success('已新建任务')
    await refreshStoredList()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '新建失败')
  }
}

function goLogin() {
  router.push({
    name: 'login',
    query: { redirect: route.fullPath },
  })
}

function onExportJson() {
  snapshotCurrent()
  const ok = documentStore.exportJson()
  if (ok) ElMessage.success('已导出 JSON')
  else ElMessage.warning('当前没有可导出的文档')
}

async function onExportPng() {
  const el = document.querySelector(
    '[data-export-root]',
  ) as HTMLElement | null
  if (!el) {
    ElMessage.warning('未找到画布导出区域')
    return
  }
  exporting.value = true
  const prevZoom = zoom.value
  try {
    ui.setZoom(1)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 50))
    const canvas = await html2canvas(el, {
      backgroundColor: '#fcfcfc',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const link = document.createElement('a')
    const name =
      doc_title.value.replace(/\s+/g, '_') ||
      current_data.value?.id?.replace(/\s+/g, '_') ||
      templateId.value
    link.download = `${name}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('已导出图片')
  } catch {
    ElMessage.error('导出图片失败')
  } finally {
    ui.setZoom(prevZoom)
    exporting.value = false
  }
}

function onUndo() {
  if (!current_data.value || !canUndo.value) return
  restoring.value = true
  const prev = history.undo(current_data.value)
  if (prev) {
    documentStore.setCurrentData(prev)
    lastPushedJson = JSON.stringify(prev)
  }
  restoring.value = false
}

function onRedo() {
  if (!current_data.value || !canRedo.value) return
  restoring.value = true
  const next = history.redo(current_data.value)
  if (next) {
    documentStore.setCurrentData(next)
    lastPushedJson = JSON.stringify(next)
  }
  restoring.value = false
}

async function onReset() {
  try {
    await ElMessageBox.confirm(
      '将丢弃当前未保存的修改，并重新加载空白模板。此操作不可撤销（已保存到云端的文档不受影响）。是否继续？',
      '重置模板',
      {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  snapshotCurrent()
  documentStore.resetToTemplate(templateId.value)
  documentStore.persistLocal(templateId.value)
  history.clear()
  lastPushedJson = current_data.value
    ? JSON.stringify(current_data.value)
    : ''
  ElMessage.success('已重置为模板')
}

function onZoomReset() {
  ui.setZoom(1)
}

async function onCopyAIContext(asPlain: boolean) {
  if (!auth.isAuthenticated || !document_id.value) {
    ElMessage.warning('登录并同步到云端后可用')
    return
  }
  try {
    const ctx = await getAIContext(document_id.value)
    const text = asPlain
      ? `# ${ctx.title}\n\n${ctx.plainText || ctx.summary}`
      : JSON.stringify(ctx, null, 2)
    await navigator.clipboard.writeText(text)
    ElMessage.success(asPlain ? '已复制纯文本' : '已复制 AI 上下文 JSON')
  } catch {
    ElMessage.error('暂时无法复制 AI 上下文')
  }
}

async function onDiffPrev() {
  if (!auth.isAuthenticated || !document_id.value) {
    ElMessage.warning('登录并同步到云端后可用')
    return
  }
  try {
    const revs = await listRevisions(document_id.value)
    if (revs.length < 2) {
      ElMessage.info('暂无上一版可对比')
      return
    }
    const prev = revs[1]
    const diff = await diffRevisions(document_id.value, prev.id)
    const body =
      (diff.unified && diff.unified.trim()) ||
      '(无文本差异)'
    await ElMessageBox.alert(
      `<pre style="max-height:320px;overflow:auto;white-space:pre-wrap;font-size:12px;text-align:left">${body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`,
      '与上一版对比',
      { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' },
    )
  } catch {
    ElMessage.error('暂时无法对比上一版')
  }
}

function goGuide() {
  router.push({ name: 'guide' })
}
</script>

<template>
  <aside v-if="panelOpen" class="page-settings-panel">
    <header class="panel-header">
      <div class="panel-header-top">
        <h3>页面设置</h3>
        <span
          class="status-chip"
          :class="dirty ? 'status-chip--dirty' : 'status-chip--clean'"
          :title="dirty ? '有未保存更改' : '已与本地/云端同步'"
        >
          <span class="status-dot" aria-hidden="true" />
          {{ syncLabel }}
        </span>
      </div>
      <p class="panel-sub">{{ meta.name }}</p>
    </header>

    <div class="panel-body">
      <!-- 当前文档 -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.document }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.document"
          @click="toggleSection('document')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">当前文档</span>
          <span class="acc-meta-badge">{{ meta.badge }}</span>
        </button>
        <div v-show="sectionOpen.document" class="acc-body">
          <div class="field">
            <label class="field-label">任务名称 <span class="req">*</span></label>
            <el-input
              ref="titleInputRef"
              v-model="doc_title"
              size="small"
              placeholder="必填，保存时作为任务名称"
              maxlength="255"
              clearable
            />
          </div>
          <div class="field">
            <label class="field-label">备注信息</label>
            <el-input
              v-model="doc_notes"
              type="textarea"
              :rows="3"
              size="small"
              placeholder="可选备注"
              maxlength="2000"
            />
          </div>
          <div class="meta-grid">
            <div class="info-row">
              <span class="label">创建时间</span>
              <span class="time">{{ fmtTime(created_at) }}</span>
            </div>
            <div class="info-row">
              <span class="label">修订时间</span>
              <span class="time">{{ fmtTime(updated_at) }}</span>
            </div>
            <div class="info-row">
              <span class="label">模板</span>
              <span class="badge">{{ meta.badge }}</span>
            </div>
            <div class="info-row">
              <span class="label">修订</span>
              <span class="mono" :title="head_revision_id ?? undefined">{{
                head_revision_id ?? '—'
              }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 文件 -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.files }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.files"
          @click="toggleSection('files')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">文件</span>
        </button>
        <div v-show="sectionOpen.files" class="acc-body">
          <el-button
            class="btn-save"
            type="primary"
            size="small"
            :loading="saving"
            @click="onSave"
          >
            保存
          </el-button>
          <div class="btn-grid">
            <el-button size="small" @click="onExportJson">导出 JSON</el-button>
            <el-button
              size="small"
              :loading="exporting"
              @click="onExportPng"
            >
              导出图片
            </el-button>
          </div>
          <el-button
            class="btn-danger-full"
            size="small"
            type="danger"
            plain
            @click="onReset"
          >
            重置模板
          </el-button>
        </div>
      </section>

      <!-- 本模板已存文档 -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.stored }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.stored"
          @click="toggleSection('stored')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">本模板已存文档</span>
          <span
            v-if="auth.isAuthenticated && storedDocs.length"
            class="acc-count"
          >{{ storedDocs.length }}</span>
        </button>
        <div v-show="sectionOpen.stored" class="acc-body">
          <div class="section-toolbar">
            <el-button size="small" type="primary" plain @click="onNewTask">
              新建任务
            </el-button>
          </div>
          <template v-if="auth.isAuthenticated">
            <p v-if="storedLoading" class="hint">加载中…</p>
            <ul v-else class="stored-list">
              <li v-if="storedDocs.length === 0" class="hint">暂无已存文档</li>
              <li
                v-for="d in storedDocs"
                :key="d.id"
                class="stored-item"
                :class="{ active: d.id === document_id }"
              >
                <button
                  type="button"
                  class="stored-open"
                  @click="onOpenStored(d.id)"
                >
                  <strong class="stored-title">{{ d.title || '未命名' }}</strong>
                  <span class="stored-time">修订 {{ fmtTime(d.updatedAt) }}</span>
                  <span class="stored-created">创建 {{ fmtTime(d.createdAt) }}</span>
                  <span v-if="d.notes" class="stored-notes">{{ d.notes }}</span>
                </button>
                <el-button
                  class="stored-delete"
                  size="small"
                  type="danger"
                  text
                  :loading="deletingId === d.id"
                  title="删除文档"
                  @click.stop="onDeleteStored(d)"
                >
                  删除
                </el-button>
              </li>
            </ul>
          </template>
          <p v-else class="hint">
            登录后查看云端列表
            <el-button size="small" text type="primary" @click="goLogin">
              去登录
            </el-button>
          </p>
        </div>
      </section>

      <!-- 检索 / AI -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.ai }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.ai"
          @click="toggleSection('ai')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">检索 · AI</span>
        </button>
        <div v-show="sectionOpen.ai" class="acc-body">
          <div class="btn-grid">
            <el-button size="small" @click="onCopyAIContext(false)">AI 上下文 JSON</el-button>
            <el-button size="small" @click="onCopyAIContext(true)">复制纯文本</el-button>
            <el-button size="small" class="btn-span-2" @click="onDiffPrev">与上一版对比</el-button>
          </div>
        </div>
      </section>

      <!-- 编辑 -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.edit }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.edit"
          @click="toggleSection('edit')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">编辑</span>
        </button>
        <div v-show="sectionOpen.edit" class="acc-body">
          <div class="btn-row">
            <el-button size="small" :disabled="!canUndo" @click="onUndo">
              撤销
            </el-button>
            <el-button size="small" :disabled="!canRedo" @click="onRedo">
              重做
            </el-button>
          </div>
        </div>
      </section>

      <!-- 视图 -->
      <section class="acc-section" :class="{ 'is-open': sectionOpen.view }">
        <button
          type="button"
          class="acc-header"
          :aria-expanded="sectionOpen.view"
          @click="toggleSection('view')"
        >
          <span class="acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.22 3.22a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06z"
              />
            </svg>
          </span>
          <span class="acc-title">视图</span>
          <span class="acc-meta-muted">{{ zoomPercent }}%</span>
        </button>
        <div v-show="sectionOpen.view" class="acc-body">
          <div class="info-row">
            <span class="label">缩放</span>
            <span class="mono">{{ zoomPercent }}%</span>
          </div>
          <div class="btn-row">
            <el-button size="small" @click="ui.zoomOut">－</el-button>
            <el-button size="small" @click="onZoomReset">100%</el-button>
            <el-button size="small" @click="ui.zoomIn">＋</el-button>
          </div>
          <div class="btn-row snap-row">
            <el-button size="small" @click="ui.toggleSnap">
              吸附 {{ snapEnabled ? '开' : '关' }}
            </el-button>
          </div>
        </div>
      </section>
    </div>

    <footer class="panel-footer">
      <el-button size="small" text type="primary" @click="goGuide">
        ← 返回引导页
      </el-button>
    </footer>
  </aside>
</template>

<style scoped>
.page-settings-panel {
  width: 320px;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 0;
  height: 100%;
  background: #fff;
  border-left: 1px solid #dadce0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #e8eaed;
  background: #fafbfc;
}

.panel-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #202124;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #5f6368;
  line-height: 1.35;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-chip--dirty {
  color: #b06000;
  background: #fef7e0;
}

.status-chip--clean {
  color: #137333;
  background: #e6f4ea;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 0 8px;
}

.acc-section {
  border-bottom: 1px solid #e8eaed;
}

.acc-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: #3c4043;
  transition: background 0.12s ease;
}

.acc-header:hover {
  background: #f1f3f4;
}

.acc-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: #80868b;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.acc-section.is-open .acc-chevron {
  transform: rotate(90deg);
  color: #5f6368;
}

.acc-title {
  font-size: 12px;
  font-weight: 650;
  color: #5f6368;
  letter-spacing: 0.02em;
  flex: 1 1 auto;
  min-width: 0;
}

.acc-section.is-open .acc-title {
  color: #202124;
}

.acc-meta-badge {
  font-size: 10px;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.acc-meta-muted {
  font-size: 11px;
  color: #80868b;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.acc-count {
  font-size: 10px;
  font-weight: 650;
  color: #5f6368;
  background: #e8eaed;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.acc-body {
  padding: 0 14px 12px 34px;
}

.field {
  margin-bottom: 10px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: #5f6368;
  margin-bottom: 4px;
}

.req {
  color: #d93025;
}

.meta-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.info-row .label {
  color: #80868b;
  flex-shrink: 0;
}

.time {
  font-size: 12px;
  color: #3c4043;
  text-align: right;
}

.badge {
  font-size: 11px;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: #3c4043;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.btn-save {
  width: 100%;
  margin: 0 0 8px !important;
}

.btn-danger-full {
  width: 100%;
  margin: 8px 0 0 !important;
}

.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.btn-grid .el-button {
  margin: 0;
}

.btn-span-2 {
  grid-column: 1 / -1;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-row .el-button {
  margin: 0;
}

.snap-row {
  margin-top: 8px;
}

.section-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #5f6368;
  line-height: 1.5;
}

.stored-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}

.stored-item {
  display: flex;
  align-items: stretch;
  gap: 2px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.stored-item.active {
  border-color: #1a73e8;
  background: #e8f0fe;
}

.stored-open {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stored-open:hover {
  background: rgba(26, 115, 232, 0.04);
}

.stored-delete {
  flex-shrink: 0;
  align-self: center;
  margin: 0 4px !important;
  opacity: 0.7;
}

.stored-item:hover .stored-delete {
  opacity: 1;
}

.stored-title {
  font-size: 13px;
  color: #202124;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-time {
  font-size: 11px;
  color: #5f6368;
}

.stored-created {
  font-size: 11px;
  color: #80868b;
}

.stored-notes {
  font-size: 11px;
  color: #5f6368;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-footer {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid #e8eaed;
  background: #fafbfc;
}
</style>
