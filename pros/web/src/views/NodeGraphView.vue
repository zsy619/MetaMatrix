<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChatDotRound,
  Clock,
  Collection,
  Delete,
  Files,
  RefreshLeft,
  Setting,
  Share,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as projectsApi from '../api/projects'
import * as documentsApi from '../api/documents'
import type { DocumentSummary } from '../api/documents'
import { useNodeGraphStore } from '../stores/nodeGraph'
import type { RefMap } from '../components/canvas/nodeGraph/refCycle'
import NodeGraphCanvas from '../components/canvas/nodeGraph/NodeGraphCanvas.vue'
import NodeGraphNodeProps from '../components/canvas/nodeGraph/NodeGraphNodeProps.vue'
import NodeGraphNodeEditor from '../components/canvas/nodeGraph/NodeGraphNodeEditor.vue'
import NodeGraphCanvasEditor from '../components/canvas/nodeGraph/NodeGraphCanvasEditor.vue'
import { friendlyApiMessage } from '../utils/apiMessage'

const route = useRoute()
const router = useRouter()
const store = useNodeGraphStore()

const projectId = computed(() => String(route.params.projectId ?? ''))
const canvasId = computed(() => String(route.params.canvasId ?? ''))
/** 从引用节点跳转进来时带着来源画布 id，面包屑据此给出「返回上一级」。 */
const fromCanvasId = computed(() => String(route.query.from ?? ''))
/** 只读分享链接：?view=readonly */
const readonly = computed(() => String(route.query.view ?? '') === 'readonly')

const projectName = ref('')
const canvases = ref<DocumentSummary[]>([])
const refs = ref<RefMap>({})
const loading = ref(true)
const error = ref('')
const versionBusy = ref(false)
const historyOpen = ref(false)
const historyLoading = ref(false)
const revisions = ref<documentsApi.RevisionSummary[]>([])

/* ---------------- 本次会话的附加面板 ---------------- */
const undoOpen = ref(false)
const recycleOpen = ref(false)
const templatesOpen = ref(false)
const commentsOpen = ref(false)
const commentNodeId = ref<string | null>(null)
const commentText = ref('')
type CanvasTemplate = { id: string; name: string; createdAt: string }
const templates = ref<CanvasTemplate[]>([])

const commentNode = computed(() => store.nodes.find((node) => node.id === commentNodeId.value) || null)

function openComments(id: string) {
  commentNodeId.value = id
  commentsOpen.value = true
  commentText.value = ''
}

function submitComment() {
  if (!commentNodeId.value || !commentText.value.trim()) return
  store.addComment(commentNodeId.value, commentText.value)
  commentText.value = ''
}

function openTemplates() {
  templates.value = store.listTemplates()
  templatesOpen.value = true
}

async function saveAsTemplate() {
  try {
    const { value } = await ElMessageBox.prompt('模板名称', '存为画布模板', {
      inputValue: store.title || '未命名模板',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    store.saveTemplate(value)
    templates.value = store.listTemplates()
    ElMessage.success('已存为模板')
  } catch {
    /* 取消 */
  }
}

function useTemplate(id: string) {
  if (!store.applyTemplate(id)) {
    ElMessage.warning('模板不存在')
    return
  }
  templatesOpen.value = false
  ElMessage.success('模板已套用（可撤销）')
}

function removeTemplate(id: string) {
  store.deleteTemplate(id)
  templates.value = store.listTemplates()
}

async function shareReadonly() {
  const url = window.location.origin + route.path + '?view=readonly'
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('只读链接已复制')
  } catch {
    ElMessage.info(url)
  }
}

async function resolveConflict(choice: 'mine' | 'remote' | 'copy') {
  try {
    await store.resolveConflict(choice)
    ElMessage.success(choice === 'copy' ? '已另存为副本' : '冲突已解决')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '冲突处理失败'))
  }
}

/** 自动保存状态：时间 + 重试次数，避免只显示「已保存」看不出在补存。 */
const savedLabel = computed(() => {
  if (store.retryCount > 0) return '保存失败，重试 ' + store.retryCount
  if (!store.lastSavedAt) return '已保存'
  const date = new Date(store.lastSavedAt)
  return Number.isNaN(date.getTime())
    ? '已保存'
    : '已保存 ' + date.toLocaleTimeString('zh-CN', { hour12: false })
})

const activeNode = computed(() =>
  store.nodes.find((node) => node.id === store.activeNodeId) || null,
)

/** 双击节点打开的编辑弹窗：里面是放大的富文本编辑或画布预览。 */
const editorOpen = ref(false)
const editorNodeId = ref<string | null>(null)
const editorNode = computed(() =>
  store.nodes.find((node) => node.id === editorNodeId.value) || null,
)

/**
 * 双击节点。
 *
 * 富文本节点打开最大化的富文本编辑；
 * 画布节点在弹窗里直接编辑这张画布，节点与画布保持绑定，不再跳走。
 */
function openEditor(id: string) {
  const node = store.nodes.find((item) => item.id === id)
  if (!node) return
  editorNodeId.value = id
  editorOpen.value = true
}

/** 关闭编辑层：节点 id 也要清掉，否则浮层会留在屏幕上。 */
function closeEditor() {
  editorOpen.value = false
  editorNodeId.value = null
}

async function loadRefs() {
  try {
    const res = await projectsApi.listProjectRefs(projectId.value)
    refs.value = res.refs || {}
  } catch {
    // 引用图拿不到时只是不能判环，不该让画布打不开。
    refs.value = {}
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [project, list] = await Promise.all([
      projectsApi.getProject(projectId.value),
      documentsApi.listDocuments({ projectId: projectId.value }),
    ])
    projectName.value = project.name
    canvases.value = list
    await Promise.all([store.load(canvasId.value), loadRefs()])
    if (store.loadError) error.value = store.loadError
  } catch (err) {
    error.value = friendlyApiMessage(err, "操作失败")
  } finally {
    loading.value = false
  }
}

function backToSource() {
  if (!fromCanvasId.value) return
  void router.push({
    name: 'node-graph',
    params: { projectId: projectId.value, canvasId: fromCanvasId.value },
  })
}

function goProject() {
  void router.push({ name: 'project-detail', params: { projectId: projectId.value } })
}

/** 存版：把当前内容打成一个带标签的 revision。 */
async function saveCheckpoint() {
  if (versionBusy.value) return
  versionBusy.value = true
  try {
    const label = '手动存版 ' + new Date().toLocaleString('zh-CN', { hour12: false })
    await store.createCheckpoint(label)
    ElMessage.success('已存版')
    if (historyOpen.value) await loadRevisions()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '存版失败'))
  } finally {
    versionBusy.value = false
  }
}

async function loadRevisions() {
  historyLoading.value = true
  try {
    const page = await documentsApi.listRevisions(canvasId.value, { limit: 50 })
    revisions.value = Array.isArray(page) ? page : page.items
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '读取版本失败'))
  } finally {
    historyLoading.value = false
  }
}

async function openHistory() {
  historyOpen.value = true
  await loadRevisions()
}

async function restoreRevision(revision: documentsApi.RevisionSummary) {
  try {
    await ElMessageBox.confirm(
      '恢复到「' + (revision.label || formatTime(revision.createdAt)) + '」会覆盖当前内容（可再从历史恢复）。',
      '恢复版本',
      { type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  versionBusy.value = true
  try {
    await store.restoreRevision(revision.id)
    ElMessage.success('已恢复到这个版本')
    await loadRevisions()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '恢复失败'))
  } finally {
    versionBusy.value = false
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

// 离开页面时把未保存的改动落盘，避免刷新丢内容。
function flush() {
  if (store.dirty && !readonly.value) void store.save()
}

// 关标签页/刷新时的兜底：save 是异步的，页面卸载后请求可能发不完，
// 浏览器原生确认框给 save 留出发送时间（大多数浏览器会等到用户选择）。
function beforeUnload(event: BeforeUnloadEvent) {
  if (readonly.value || !store.dirty) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(load)
onBeforeUnmount(flush)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch([projectId, canvasId], load)
</script>

<template>
  <div class="ng-page">
    <header class="ng-topbar">
      <nav class="ng-crumb">
        <router-link :to="{ name: 'projects' }">项目</router-link>
        <span class="ng-crumb__sep">/</span>
        <router-link :to="{ name: 'project-detail', params: { projectId } }">{{ projectName || '…' }}</router-link>
        <span class="ng-crumb__sep">/</span>
        <span class="ng-crumb__current">{{ store.title || '画布' }}</span>
        <el-button
          v-if="fromCanvasId"
          size="small"
          text
          class="ng-crumb__back"
          @click="backToSource"
        >
          ← 返回上一级
        </el-button>
      </nav>
      <div class="ng-status">
        <span v-if="store.saveError" class="ng-status__error">{{ store.saveError }}</span>
        <span v-else-if="store.saving" class="ng-status__text">保存中…</span>
        <span v-else-if="store.dirty" class="ng-status__text">未保存</span>
        <span v-else class="ng-status__text" :class="{ 'ng-status__text--ok': !store.retryCount }">{{ savedLabel }}</span>
        <template v-if="!readonly">
        <el-button size="small" :loading="versionBusy" @click="saveCheckpoint">
          <el-icon><Collection /></el-icon>
          存版
        </el-button>
        <el-button size="small" @click="openHistory">
          <el-icon><Clock /></el-icon>
          历史
        </el-button>
        <el-button size="small" @click="undoOpen = true">
          <el-icon><RefreshLeft /></el-icon>
          步骤
        </el-button>
        <el-button size="small" @click="openTemplates">
          <el-icon><Files /></el-icon>
          模板
        </el-button>
        <el-button size="small" @click="recycleOpen = true">
          <el-icon><Delete /></el-icon>
          回收站
        </el-button>
        <el-button size="small" @click="openComments(store.activeNodeId || store.nodes[0]?.id || '')">
          <el-icon><ChatDotRound /></el-icon>
          评论
        </el-button>
        </template>
        <el-button size="small" @click="shareReadonly">
          <el-icon><Share /></el-icon>
          分享
        </el-button>
        <el-button size="small" @click="goProject">返回项目</el-button>
      </div>
    </header>

    <div class="ng-stage">
      <p v-if="error" class="ng-error">{{ error }}</p>
      <div v-else-if="loading" class="ng-loading">加载中…</div>
      <NodeGraphCanvas
        v-else
        :canvases="canvases"
        :current-canvas-id="canvasId"
        :refs="refs"
        :readonly="readonly"
        @open-panel="(id: string) => store.openPanel(id)"
        @open-editor="openEditor"
        @open-comments="openComments"
      />

      <!-- 自绘面板而不是 el-drawer：抽屉自带的全屏层会吃掉画布点击，
           「点画布空白处关闭面板」和「点节点图标换面板」都会失灵。 -->
      <aside v-if="activeNode && !readonly" class="ng-panel-host">
        <header class="ng-panel-head">
          <el-icon class="ng-panel-head__icon" style="color: #7c3aed">
            <Setting />
          </el-icon>
          <span class="ng-panel-head__label">节点属性</span>
          <el-button size="small" text class="ng-panel-head__close" @click="store.closePanel()">
            关闭
          </el-button>
        </header>
        <div class="ng-panel-body">
          <NodeGraphNodeProps :key="activeNode.id" :node="activeNode" :canvases="canvases" />
        </div>
      </aside>

      <!-- 双击节点：全屏最大化的内容编辑（组件自己 Teleport 到 body） -->
      <NodeGraphCanvasEditor
        v-if="editorNode && editorNode.type === 'canvasRef'"
        :node="editorNode"
        :project-id="projectId"
        @close="closeEditor"
      />
      <NodeGraphNodeEditor
        v-else-if="editorNode"
        :node="editorNode"
        @close="closeEditor"
      />
    </div>

    <!-- 版本历史：恢复会生成新 revision，不会抹掉中间过程 -->
    <el-drawer v-model="historyOpen" title="版本历史" size="420px">
      <div v-loading="historyLoading" class="ng-history">
        <p v-if="!historyLoading && !revisions.length" class="ng-history__empty">
          还没有历史版本，点顶栏「存版」先存一个。
        </p>
        <article v-for="item in revisions" :key="item.id" class="ng-history__item">
          <header>
            <b>{{ item.label || '自动版本' }}</b>
            <el-tag size="small" effect="plain">{{ item.revisionType }}</el-tag>
          </header>
          <p class="ng-history__time">{{ formatTime(item.createdAt) }}</p>
          <el-button
            size="small"
            :disabled="versionBusy"
            @click="restoreRevision(item)"
          >
            恢复此版本
          </el-button>
        </article>
      </div>
    </el-drawer>

    <!-- 撤销历史：本次会话里的每一步，点了直接回退 -->
    <el-drawer v-model="undoOpen" title="编辑步骤" size="380px">
      <div class="ng-history">
        <p v-if="!store.historyEntries.length" class="ng-history__empty">这一步之前没有可回退的记录。</p>
        <button
          v-for="entry in store.historyEntries"
          :key="entry.index"
          type="button"
          class="ng-step"
          @click="store.undoTo(entry.index)"
        >
          <el-icon><RefreshLeft /></el-icon>
          <span>{{ entry.label }}</span>
          <em>#{{ entry.index + 1 }}</em>
        </button>
      </div>
    </el-drawer>

    <!-- 画布模板：把当前画布存成模板，或套用已有模板 -->
    <el-drawer v-model="templatesOpen" title="画布模板" size="420px">
      <div class="ng-history">
        <el-button type="primary" plain @click="saveAsTemplate">把当前画布存为模板</el-button>
        <p v-if="!templates.length" class="ng-history__empty">还没有模板。存一个之后就能一键复用。</p>
        <article v-for="item in templates" :key="item.id" class="ng-history__item">
          <header>
            <b>{{ item.name }}</b>
            <span class="ng-history__time">{{ formatTime(item.createdAt) }}</span>
          </header>
          <div class="ng-row-actions">
            <el-button size="small" type="primary" plain @click="useTemplate(item.id)">套用</el-button>
            <el-button size="small" text @click="removeTemplate(item.id)">删除</el-button>
          </div>
        </article>
      </div>
    </el-drawer>

    <!-- 回收站：删除的节点先放这里，可恢复 -->
    <el-drawer v-model="recycleOpen" title="回收站" size="420px">
      <div class="ng-history">
        <div class="ng-row-actions">
          <span class="ng-history__time">最多保留 50 条</span>
          <el-button size="small" text :disabled="!store.deleted.length" @click="store.clearDeleted()">
            清空回收站
          </el-button>
        </div>
        <p v-if="!store.deleted.length" class="ng-history__empty">回收站是空的。</p>
        <article v-for="entry in store.deleted" :key="entry.node.id" class="ng-history__item">
          <header>
            <b>{{ entry.node.title || '未命名节点' }}</b>
            <span class="ng-history__time">{{ formatTime(entry.deletedAt) }}</span>
          </header>
          <el-button size="small" plain @click="store.restoreDeleted(entry.node.id)">恢复节点</el-button>
        </article>
      </div>
    </el-drawer>

    <!-- 节点评论 -->
    <el-drawer v-model="commentsOpen" title="节点评论" size="420px">
      <div class="ng-history">
        <p class="ng-history__time">
          {{ commentNode ? '给「' + (commentNode.title || '未命名节点') + '」留言' : '先在画布上选一个节点' }}
        </p>
        <el-input
          v-model="commentText"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="写一条评论，回车换行"
          :disabled="!commentNodeId"
        />
        <el-button type="primary" plain :disabled="!commentNodeId || !commentText.trim()" @click="submitComment">
          发表评论
        </el-button>
        <p v-if="!commentNodeId || !store.commentsOf(commentNodeId).length" class="ng-history__empty">
          还没有评论。
        </p>
        <article
          v-for="item in commentNodeId ? store.commentsOf(commentNodeId) : []"
          :key="item.id"
          class="ng-history__item"
          :class="{ 'is-resolved': item.resolved }"
        >
          <header>
            <b>{{ item.author }}</b>
            <span class="ng-history__time">{{ formatTime(item.createdAt) }}</span>
          </header>
          <p class="ng-comment__text">{{ item.text }}</p>
          <div class="ng-row-actions">
            <el-button size="small" text @click="store.toggleCommentResolved(item.id)">
              {{ item.resolved ? '重新打开' : '标记解决' }}
            </el-button>
            <el-button size="small" text @click="store.removeComment(item.id)">删除</el-button>
          </div>
        </article>
      </div>
    </el-drawer>

    <!-- 保存冲突：远端更新与本地改动二选一，或另存副本 -->
    <el-dialog
      :model-value="!!store.conflict"
      title="保存冲突"
      width="440px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <p class="ng-conflict__hint">
        远端已有更新（版本 {{ store.conflict?.remoteVersion ?? '—' }}）。你的本地改动还没保存：
      </p>
      <ul class="ng-conflict__stats">
        <li>本地：{{ store.nodes.length }} 节点 / {{ store.edges.length }} 连线</li>
        <li>远端：{{ store.conflict?.remote.nodes.length ?? 0 }} 节点 / {{ store.conflict?.remote.edges.length ?? 0 }} 连线</li>
      </ul>
      <template #footer>
        <el-button @click="resolveConflict('copy')">另存副本</el-button>
        <el-button @click="resolveConflict('remote')">用远端</el-button>
        <el-button type="primary" @click="resolveConflict('mine')">用我的覆盖</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ng-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--mm-bg);
}

.ng-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--mm-line);
  background: var(--mm-surface);
  flex: none;
}

.ng-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--mm-muted);
  min-width: 0;
}

.ng-crumb a {
  color: var(--mm-blue);
  text-decoration: none;
}

.ng-crumb__sep {
  color: var(--mm-faint);
}

.ng-crumb__current {
  color: var(--mm-text);
  font-weight: 600;
}

.ng-crumb__back {
  margin-left: 8px;
}

.ng-status {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

.ng-status__text {
  font-size: 12px;
  color: var(--mm-muted);
}

.ng-status__text--ok {
  color: #16a34a;
}

.ng-status__error {
  font-size: 12px;
  color: #b91c1c;
}

.ng-error,
.ng-loading {
  margin: 24px;
  padding: 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ng-loading {
  background: var(--mm-surface);
  color: var(--mm-muted);
}

.ng-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.ng-panel-host {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--mm-surface);
  border-left: 1px solid var(--mm-line);
  box-shadow: -10px 0 28px rgba(15, 23, 42, 0.06);
  z-index: 20;
}

.ng-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ng-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mm-line);
  flex: none;
}

.ng-panel-head__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--mm-text);
}

.ng-panel-head__close {
  margin-left: auto;
}

.ng-panel-body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}

.ng-history {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}

.ng-history__empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--mm-muted);
}

.ng-history__item {
  padding: 12px;
  border: 1px solid var(--mm-line);
  border-radius: 10px;
  background: var(--mm-surface);
}

.ng-history__item header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ng-history__item header b {
  font-size: 13px;
  color: var(--mm-text);
}

.ng-history__time {
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--mm-muted);
}

.ng-history__item.is-resolved {
  opacity: 0.6;
}

.ng-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--mm-line);
  border-radius: 9px;
  background: var(--mm-surface);
  color: var(--mm-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.ng-step:hover {
  border-color: var(--mm-blue);
  background: var(--mm-blue-soft);
}

.ng-step em {
  margin-left: auto;
  font-style: normal;
  font-size: 11px;
  color: var(--mm-faint);
}

.ng-row-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ng-comment__text {
  margin: 6px 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mm-text);
  white-space: pre-wrap;
}

.ng-conflict__hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--mm-text);
}

.ng-conflict__stats {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
  line-height: 1.8;
  color: var(--mm-muted);
}
</style>
