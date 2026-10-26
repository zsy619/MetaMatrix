<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
const titleInputRef = ref<{ focus?: () => void } | null>(null)

const storedDocs = ref<DocumentSummary[]>([])
const storedLoading = ref(false)

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
  } catch (e) {
    console.warn('[PageSettingsPanel.refreshStoredList]', e)
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
  } catch (err) {
    console.error(err)
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
      '将丢弃当前修改并重新加载模板，是否继续？',
      '重置模板',
      {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning',
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
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '获取失败')
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
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '对比失败')
  }
}

function goGuide() {
  router.push({ name: 'guide' })
}
</script>

<template>
  <aside v-if="panelOpen" class="page-settings-panel">
    <header class="panel-header">
      <h3>页面设置</h3>
      <p class="panel-sub">{{ meta.name }}</p>
    </header>

    <section class="section">
      <h4 class="section-title">当前文档</h4>
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
        <span class="label">状态</span>
        <span :class="['status', dirty ? 'dirty' : 'clean']">{{
          syncLabel
        }}</span>
      </div>
      <div class="info-row">
        <span class="label">修订</span>
        <span class="mono">{{ head_revision_id ?? '—' }}</span>
      </div>
    </section>

    <section class="section">
      <h4 class="section-title">文件</h4>
      <div class="btn-grid">
        <el-button
          type="primary"
          size="small"
          :loading="saving"
          @click="onSave"
        >
          保存
        </el-button>
        <el-button size="small" @click="onExportJson">导出 JSON</el-button>
        <el-button
          size="small"
          :loading="exporting"
          @click="onExportPng"
        >
          导出图片
        </el-button>
        <el-button size="small" type="danger" plain @click="onReset">
          重置模板
        </el-button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h4 class="section-title" style="margin: 0">本模板已存文档</h4>
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
            <button type="button" @click="onOpenStored(d.id)">
              <strong class="stored-title">{{ d.title || '未命名' }}</strong>
              <span class="stored-time">修订 {{ fmtTime(d.updatedAt) }}</span>
              <span class="stored-created">创建 {{ fmtTime(d.createdAt) }}</span>
              <span v-if="d.notes" class="stored-notes">{{ d.notes }}</span>
            </button>
          </li>
        </ul>
      </template>
      <p v-else class="hint">
        登录后查看云端列表
        <el-button size="small" text type="primary" @click="goLogin">
          去登录
        </el-button>
      </p>
    </section>

    <section class="section">
      <h4 class="section-title">检索 / AI</h4>
      <div class="btn-grid">
        <el-button size="small" @click="onCopyAIContext(false)">AI 上下文 JSON</el-button>
        <el-button size="small" @click="onCopyAIContext(true)">复制纯文本</el-button>
        <el-button size="small" @click="onDiffPrev">与上一版对比</el-button>
      </div>
    </section>

    <section class="section">
      <h4 class="section-title">编辑</h4>
      <div class="btn-row">
        <el-button size="small" :disabled="!canUndo" @click="onUndo">
          撤销
        </el-button>
        <el-button size="small" :disabled="!canRedo" @click="onRedo">
          重做
        </el-button>
      </div>
    </section>

    <section class="section">
      <h4 class="section-title">视图</h4>
      <div class="info-row">
        <span class="label">缩放</span>
        <span class="mono">{{ zoomPercent }}%</span>
      </div>
      <div class="btn-row">
        <el-button size="small" @click="ui.zoomOut">－</el-button>
        <el-button size="small" @click="onZoomReset">100%</el-button>
        <el-button size="small" @click="ui.zoomIn">＋</el-button>
      </div>
      <div class="btn-row" style="margin-top: 8px">
        <el-button size="small" @click="ui.toggleSnap">
          吸附 {{ snapEnabled ? '开' : '关' }}
        </el-button>
      </div>
    </section>

    <section class="section section-foot">
      <el-button size="small" text type="primary" @click="goGuide">
        ← 返回引导页
      </el-button>
    </section>
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
  padding: 14px 16px;
  box-sizing: border-box;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-header {
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 650;
  color: #202124;
}

.panel-sub {
  margin: 0;
  font-size: 12px;
  color: #5f6368;
}

.section {
  padding: 12px 0;
  border-top: 1px solid #e8eaed;
}

.section-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: #5f6368;
  letter-spacing: 0.02em;
  text-transform: none;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
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

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-row .label {
  color: #5f6368;
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

.status.dirty {
  color: #e37400;
  font-weight: 600;
}

.status.clean {
  color: #188038;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #3c4043;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.btn-grid .el-button {
  margin: 0;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-row .el-button {
  margin: 0;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #5f6368;
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

.stored-item button {
  width: 100%;
  text-align: left;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stored-item.active button {
  border-color: #1a73e8;
  background: #e8f0fe;
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

.section-foot {
  margin-top: auto;
  border-top: 1px solid #e8eaed;
  padding-bottom: 4px;
}
</style>
