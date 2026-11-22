<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, DocumentAdd, Edit } from '@element-plus/icons-vue'
import { Collection } from '@element-plus/icons-vue'
import * as projectsApi from '../api/projects'
import * as documentsApi from '../api/documents'
import type { DocumentSummary } from '../api/documents'
import type { Project } from '../types/project'
import { friendlyApiMessage } from '../utils/apiMessage'
import { NODE_GRAPH_TYPE, emptyNodeGraphDoc } from '../types/nodeGraph'
// 图标库按需加载：点击画布图标 / 编辑项目时才下载。
const IconPicker = defineAsyncComponent(() => import('../components/common/IconPicker.vue'))
import AppLoading from '../components/common/AppLoading.vue'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<Project | null>(null)
const canvases = ref<DocumentSummary[]>([])
const loading = ref(false)
const error = ref('')

/** 编辑项目信息（名称 / 表情 / 进度）。 */
const editOpen = ref(false)
const editName = ref('')
const editEmoji = ref('📁')
const editProgress = ref(0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    project.value = await projectsApi.getProject(projectId.value)
    // 项目画布只取 node-graph 这一类：
    // - doc（知识库富文本）有自己的知识库视图
    // - 模板 id 类型（fde-contract / pm-solution-triangle…）是节点绑定的画布副本
    // 混进来都会变成打不开的假条目，所以按内容分类取集合，而不是按 project_id 全取。
    const rows = await documentsApi.listDocuments({
      projectId: projectId.value,
      category: 'node-graph',
    })
    // 客户端再兜一层：后端未升级（不认 category）时也不会把别的内容放进来。
    canvases.value = rows.filter((d) => d.canvasType === NODE_GRAPH_TYPE)
  } catch (err) {
    error.value = friendlyApiMessage(err, '操作失败')
  } finally {
    loading.value = false
  }
}

function goBack() {
  void router.push({ name: 'projects' })
}

function goKnowledge() {
  void router.push({ name: 'knowledge', params: { projectId: projectId.value } })
}

function openEdit() {
  if (!project.value) return
  editName.value = project.value.name
  editEmoji.value = project.value.emoji || '📁'
  editProgress.value = project.value.progress ?? 0
  editOpen.value = true
}

async function saveEdit() {
  if (!project.value) return
  const name = editName.value.trim()
  if (!name) {
    ElMessage.warning('请输入项目名称')
    return
  }
  try {
    project.value = await projectsApi.updateProject(project.value.id, {
      name,
      emoji: editEmoji.value,
      progress: editProgress.value,
    })
    editOpen.value = false
    ElMessage.success('已保存')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

async function createCanvas() {
  try {
    const { value } = await ElMessageBox.prompt('画布名称', '新建画布', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: '新画布',
      inputValidator: (input) => (input && input.trim() ? true : '请输入画布名称'),
    })
    const doc = await documentsApi.createDocument({
      title: value.trim(),
      canvasType: NODE_GRAPH_TYPE,
      templateId: NODE_GRAPH_TYPE,
      projectId: projectId.value,
      data: emptyNodeGraphDoc(''),
    })
    ElMessage.success('画布已创建')
    await router.push({
      name: 'node-graph',
      params: { projectId: projectId.value, canvasId: doc.id },
    })
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

/** 当前打开图标选择器的画布。 */
const iconTarget = ref('')

/** 画布标题图标：走统一的文档图标接口，改完立即回写列表。 */
async function pickCanvasIcon(canvas: DocumentSummary, icon: string) {
  try {
    await documentsApi.setDocumentIcon(canvas.id, icon)
    canvas.icon = icon
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '修改图标失败'))
  }
}

async function renameCanvas(canvas: DocumentSummary) {
  try {
    const { value } = await ElMessageBox.prompt('画布名称', '重命名画布', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: canvas.title,
      inputValidator: (input) => (input && input.trim() ? true : '请输入画布名称'),
    })
    await documentsApi.renameDocument(canvas.id, value.trim())
    ElMessage.success('已重命名')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

async function deleteCanvas(canvas: DocumentSummary) {
  try {
    await ElMessageBox.confirm(
      '删除画布「' + canvas.title + '」无法恢复。引用了它的节点会显示「已失效」。',
      '确认删除画布？',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await documentsApi.deleteDocument(canvas.id)
    ElMessage.success('画布已删除')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

async function deleteProject() {
  if (!project.value) return
  try {
    await ElMessageBox.confirm(
      '删除项目「' + project.value.name + '」会同时删除项目里的全部画布、' +
        '节点绑定的画布副本与知识库文档，且无法恢复。',
      '确认删除项目？',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await projectsApi.deleteProject(project.value.id)
    ElMessage.success('项目已删除')
    void router.push({ name: 'projects' })
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

function openCanvas(canvas: DocumentSummary) {
  void router.push({
    name: 'node-graph',
    params: { projectId: projectId.value, canvasId: canvas.id },
  })
}

onMounted(load)
</script>

<template>
  <div class="pg-page">
    <nav class="pg-crumb">
      <el-button text :icon="ArrowLeft" @click="goBack">返回项目列表</el-button>
      <span class="pg-crumb__sep">/</span>
      <span>{{ project?.name || '…' }}</span>
    </nav>

    <header class="pg-head">
      <div class="pg-head__main">
        <span class="pg-hero-emoji" aria-hidden="true">{{ project?.emoji || '📁' }}</span>
        <div class="pg-head__text">
          <h1 class="pg-title">{{ project?.name || '项目' }}</h1>
          <div class="pg-head__meta">
            <span class="pg-head__count">{{ canvases.length }} 张画布</span>
            <span class="pg-head__bar" role="img" :aria-label="`进度 ${project?.progress ?? 0}%`">
              <i :style="{ width: Math.max(0, Math.min(100, project?.progress ?? 0)) + '%' }"></i>
            </span>
            <span class="pg-head__pct">{{ project?.progress ?? 0 }}%</span>
          </div>
        </div>
      </div>
      <div class="pg-head__actions">
        <el-button size="small" :icon="Collection" @click="goKnowledge">知识库</el-button>
        <el-button size="small" :icon="Edit" @click="openEdit">编辑信息</el-button>
        <el-button size="small" :icon="DocumentAdd" @click="createCanvas">新建画布</el-button>
        <el-button size="small" type="danger" plain :icon="Delete" @click="deleteProject">删除项目</el-button>
      </div>
    </header>

    <p v-if="error" class="pg-error">{{ error }}</p>
    <div v-if="loading" class="pg-empty"><AppLoading /></div>
    <div v-else-if="!canvases.length" class="pg-empty">这个项目还没有画布。点右上角「新建画布」。</div>

    <div v-else class="pg-list">
      <article
        v-for="canvas in canvases"
        :key="canvas.id"
        class="pg-canvas"
        tabindex="0"
        role="button"
        @click="openCanvas(canvas)"
        @keydown.enter="openCanvas(canvas)"
      >
        <div class="pg-canvas__main">
          <el-popover
            trigger="click"
            placement="right-start"
            :width="340"
            @show="iconTarget = canvas.id"
            @hide="iconTarget = ''"
          >
            <template #reference>
              <button
                type="button"
                class="pg-canvas__icon"
                title="更换图标"
                aria-label="更换图标"
                @click.stop
              >
                {{ canvas.icon || '🎨' }}
              </button>
            </template>
            <IconPicker
              v-if="iconTarget === canvas.id"
              :model-value="canvas.icon || '🎨'"
              :width="320"
              @update:model-value="(icon: string) => pickCanvasIcon(canvas, icon)"
            />
          </el-popover>
          <h2 class="pg-canvas__name">{{ canvas.title }}</h2>
          <p class="pg-canvas__meta">更新于 {{ new Date(canvas.updatedAt).toLocaleString() }}</p>
        </div>
        <div class="pg-canvas__actions" @click.stop>
          <el-button size="small" text :icon="Edit" @click="renameCanvas(canvas)">重命名</el-button>
          <el-button size="small" text type="danger" :icon="Delete" @click="deleteCanvas(canvas)">删除</el-button>
        </div>
      </article>
    </div>

    <el-dialog
      v-model="editOpen"
      title="编辑项目信息"
      width="min(880px, 94vw)"
      class="pg-edit-dialog"
      :close-on-click-modal="false"
    >
      <div class="pg-edit">
        <section class="pg-edit__side">
          <div class="pg-edit__preview">
            <span class="pg-edit__emoji">{{ editEmoji || '📁' }}</span>
            <div class="pg-edit__preview-text">
              <strong>{{ editName || '未命名项目' }}</strong>
              <span>进度 {{ editProgress }}%</span>
            </div>
          </div>
          <label class="pg-field">
            <span class="pg-field__label">项目名称</span>
            <el-input v-model="editName" placeholder="项目名称" maxlength="120" />
          </label>
          <div class="pg-field">
            <span class="pg-field__label">项目进度（{{ editProgress }}%）</span>
            <el-slider v-model="editProgress" :min="0" :max="100" :step="5" />
          </div>
        </section>
        <section class="pg-edit__main">
          <span class="pg-field__label">项目表情</span>
          <IconPicker v-model="editEmoji" :width="520" />
        </section>
      </div>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :icon="Edit" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pg-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}

.pg-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--mm-muted);
}

.pg-crumb__sep {
  color: var(--mm-faint);
}

.pg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.pg-head__main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.pg-hero-emoji {
  flex: none;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: #f1f3f4;
  font-size: 30px;
  line-height: 1;
}

.pg-head__text {
  min-width: 0;
}

.pg-head__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mm-muted);
}

.pg-head__count {
  white-space: nowrap;
}

.pg-head__bar {
  width: 160px;
  height: 6px;
  border-radius: 999px;
  background: #ececec;
  overflow: hidden;
}

.pg-head__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--mm-blue);
}

.pg-head__pct {
  font-variant-numeric: tabular-nums;
}

.pg-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--mm-text);
}

.pg-head__actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.pg-error {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.pg-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--mm-faint);
  font-size: 14px;
}

.pg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pg-canvas {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border: 1px solid var(--mm-line);
  border-radius: 12px;
  background: var(--mm-surface);
  cursor: pointer;
}

.pg-canvas:hover {
  border-color: var(--mm-blue);
}

.pg-canvas__main {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 10px;
  row-gap: 2px;
  min-width: 0;
}

.pg-canvas__icon {
  border: 0;
  background: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.pg-canvas__icon:hover {
  background: var(--el-fill-color-light, #f2f3f5);
}

.pg-canvas__name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--mm-text);
}

.pg-canvas__meta {
  margin: 0;
  font-size: 12px;
  color: var(--mm-muted);
}

.pg-canvas__actions {
  display: flex;
  gap: 4px;
  flex: none;
}

.pg-field {
  display: block;
  margin-bottom: 14px;
}

.pg-field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #5f6368;
}

/* 编辑项目信息弹窗：左信息右选图，两栏布局 */
.pg-edit {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.pg-edit__side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pg-edit__preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: var(--glass-shadow-sm, 0 2px 8px rgba(15, 23, 42, 0.06));
}

.pg-edit__emoji {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  font-size: 24px;
  line-height: 1;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
}

.pg-edit__preview-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pg-edit__preview-text strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--cv-ink, #3c4043);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pg-edit__preview-text span {
  font-size: 12px;
  color: var(--mm-muted, #5f6368);
}

.pg-edit__main {
  min-width: 0;
}

@media (max-width: 760px) {
  .pg-edit {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  /* IconPicker 宽度是内联样式，窄屏必须强制覆盖，否则撑破弹窗 */
  .pg-edit__main :deep(.icon-picker) {
    width: 100% !important;
  }
}
</style>
