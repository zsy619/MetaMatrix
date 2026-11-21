<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Lock } from '@element-plus/icons-vue'
import { Download } from '@element-plus/icons-vue'
import { Clock } from '@element-plus/icons-vue'
import { Share } from '@element-plus/icons-vue'
import RichTextEditor from '../RichTextEditor.vue'
import DocOutline from './DocOutline.vue'
import DocBackrefs from './DocBackrefs.vue'
import DocHistory from './DocHistory.vue'
import DocProperties from './DocProperties.vue'
import DocComments from './DocComments.vue'
import DocVersions from './DocVersions.vue'
import AiPanel from './AiPanel.vue'
import ShareDialog from './ShareDialog.vue'
import ProjectEmojiPicker from '../project/ProjectEmojiPicker.vue'
import { getDocument, updateDocument } from '../../api/documents'
import type { DocumentFull } from '../../api/documents'
import {
  exportKnowledgeDoc,
  touchView,
  heartbeatPresence,
  listPresence,
  getRelatedDocs,
  listVersionAuthors,
  saveDocAsTemplate,
} from '../../api/knowledge'
import type { PresenceUser } from '../../api/knowledge'
import { friendlyApiMessage } from '../../utils/apiMessage'

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
const exporting = ref(false)
const iconOpen = ref(false)
const sidebarTab = ref<'outline' | 'properties' | 'comments' | 'backrefs' | 'history' | 'versions' | 'ai'>('outline')
const shareVisible = ref(false)
const presence = ref<PresenceUser[]>([])
const quote = ref('')
const editorRef = ref<InstanceType<typeof RichTextEditor>>()
const appliedTemplate = ref('')
/** 专注模式：隐藏侧栏与头部，只留正文。 */
const focusMode = ref(false)
/** 关联推荐（064）。 */
const relatedDocs = ref<import('../../api/knowledge').KnowledgeSearchHit[]>([])
const relatedLoading = ref(false)
/** 最后编辑人（081/052）。 */
const lastEditor = ref('')
let presenceTimer: ReturnType<typeof setInterval> | null = null

const panelId = computed(() => `doc:${props.documentId}`)
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
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '加载文档失败'))
  } finally {
    loading.value = false
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
  dirty.value = true
  scheduleSave()
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
  }
}

/** 划线评论：记录鼠标抬起时选中的文本，作为评论引用。 */
function onSelectionChange() {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (text.length >= 2 && text.length <= 500) quote.value = text
}

/** 在线协作：定时上报心跳并刷新协作者列表。 */
async function syncPresence() {
  try {
    await heartbeatPresence(props.documentId, dirty.value)
    presence.value = await listPresence(props.documentId)
  } catch {
    /* 心跳失败不打扰用户 */
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
    const payload = { type: 'doc', html: html.value }
    const updated = await updateDocument(props.documentId, {
      title: title.value.trim() || '无标题',
      currentData: payload as never,
      expectedSaveVersion: doc.value.saveVersion,
      operationId: `doc-save-${Date.now()}`,
    })
    doc.value = updated
    dirty.value = false
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 409) {
      ElMessage.warning('文档已被其他端更新，正在重新加载…')
      await load()
    } else {
      ElMessage.error(friendlyApiMessage(err, '保存失败'))
    }
  } finally {
    saving.value = false
  }
}

watch(() => props.documentId, load, { immediate: true })
watch(() => props.editorTemplate, () => void applyEditorTemplate())

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  void syncPresence()
  presenceTimer = setInterval(() => void syncPresence(), 12000)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (presenceTimer) clearInterval(presenceTimer)
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
      <el-button text :icon="ArrowLeft" @click="emit('back')">返回目录</el-button>
      <nav v-if="breadcrumb?.length" class="doc-view__crumb">
        <template v-for="(item, index) in breadcrumb" :key="item.id">
          <span class="doc-view__crumb-item">{{ item.title }}</span>
          <span v-if="index < breadcrumb.length - 1" class="doc-view__crumb-sep">/</span>
        </template>
      </nav>
      <el-popover v-if="icon" v-model:visible="iconOpen" trigger="click" :width="420">
        <template #reference>
          <button type="button" class="doc-view__icon" title="更换图标" aria-label="更换图标">
            {{ icon }}
          </button>
        </template>
        <ProjectEmojiPicker :model-value="icon" @update:model-value="pickIcon" />
        <el-button class="doc-view__icon-reset" text size="small" @click="pickIcon('')">
          恢复默认图标
        </el-button>
      </el-popover>
      <input
        class="doc-view__title"
        v-model="title"
        @input="onTitleInput"
        placeholder="无标题文档"
        maxlength="200"
      />
      <span class="doc-view__status">
        <span v-if="saving">保存中…</span>
        <span v-else-if="dirty">未保存</span>
        <span v-else class="is-saved">已保存</span>
      </span>
      <el-dropdown trigger="click" @command="(format: string) => exportAs(format)">
        <el-button text :icon="Download" :loading="exporting">导出</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
            <el-dropdown-item command="html">HTML</el-dropdown-item>
            <el-dropdown-item command="text">纯文本</el-dropdown-item>
            <el-dropdown-item command="json">JSON</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown trigger="click">
        <el-button text>更多</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="saveAsTemplate">另存为模板</el-dropdown-item>
            <el-dropdown-item @click="focusMode = !focusMode">
              {{ focusMode ? '退出专注模式' : '专注模式' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button text :icon="Clock" @click="sidebarTab = 'history'">历史</el-button>
      <el-button text :icon="Share" @click="shareVisible = true">分享</el-button>
      <span v-if="lastEditor" class="doc-view__last-editor">
        最后编辑：{{ lastEditor }}
      </span>
      <el-avatar-group v-if="presence.length" class="doc-view__presence" :size="24">
        <el-avatar
          v-for="user in presence"
          :key="user.userId"
          :src="user.avatar || undefined"
          :title="`${user.name}${user.editing ? '（正在编辑）' : ''}`"
        >
          {{ user.name.slice(0, 1) }}
        </el-avatar>
      </el-avatar-group>
    </header>

    <div v-if="locked" class="doc-view__lock">
      <el-icon><Lock /></el-icon>
      此文档已被锁定，当前为只读状态。
    </div>

    <div v-if="loading" class="doc-view__empty">加载中…</div>
    <div v-else-if="!doc" class="doc-view__empty">文档不存在或已被删除。</div>
    <div v-else class="doc-view__body" :class="{ 'is-focus': focusMode }">
      <div v-if="locked" class="doc-view__readonly" v-html="html" />
      <RichTextEditor
        v-else
        ref="editorRef"
        class="doc-view__editor"
        :panel-id="panelId"
        :knowledge-project-id="projectId"
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
          <el-tab-pane label="大纲" name="outline">
            <DocOutline :html="html" />
          </el-tab-pane>
          <el-tab-pane label="属性" name="properties">
            <DocProperties :document-id="documentId" />
          </el-tab-pane>
          <el-tab-pane label="评论" name="comments">
            <DocComments :document-id="documentId" :quote="quote" @quoted="quote = ''" />
          </el-tab-pane>
          <el-tab-pane label="反向引用" name="backrefs">
            <DocBackrefs :document-id="documentId" :project-id="projectId" @back="emit('back')" />
          </el-tab-pane>
          <el-tab-pane label="历史" name="history">
            <DocHistory :document-id="documentId" @restored="onRestored" />
          </el-tab-pane>
          <el-tab-pane label="版本" name="versions">
            <DocVersions :document-id="documentId" @restored="onRestored" />
          </el-tab-pane>
          <el-tab-pane label="智能" name="ai">
            <AiPanel :project-id="projectId" :document-id="documentId" />
          </el-tab-pane>
          <el-tab-pane label="相关" name="related">
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
    <ShareDialog :document-id="documentId" :visible="shareVisible" @close="shareVisible = false" />
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
.doc-view__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  background: var(--mm-surface, #fff);
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
.doc-view__status {
  flex: none;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.doc-view__status .is-saved {
  color: var(--el-color-success);
}
.doc-view__presence {
  margin-right: 4px;
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
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: auto;
  background: var(--mm-page, #f7f7f7);
}
.doc-view__editor {
  flex: 1;
  min-width: 0;
  min-height: 100%;
}
.doc-view__sidebar {
  flex: none;
  width: 220px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border-left: 1px solid var(--mm-line, #e5e6eb);
  background: var(--mm-surface, #fff);
}
</style>
