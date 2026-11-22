<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import * as projectsApi from '../api/projects'
import * as knowledgeApi from '../api/knowledge'
import * as documentsApi from '../api/documents'
import type { Project } from '../types/project'
import KnowledgeTree from '../components/knowledge/KnowledgeTree.vue'
import DocView from '../components/knowledge/DocView.vue'
import CanvasPanel from '../components/knowledge/CanvasPanel.vue'
import SpaceHome from '../components/knowledge/SpaceHome.vue'
import KnowledgeGraph from '../components/knowledge/KnowledgeGraph.vue'
import SheetEditor from '../components/knowledge/SheetEditor.vue'
import MindmapEditor from '../components/knowledge/MindmapEditor.vue'
import FolderPanel from '../components/knowledge/FolderPanel.vue'
import type { KnowledgeNode } from '../api/knowledge'
import { friendlyApiMessage } from '../utils/apiMessage'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<Project | null>(null)
// 当前文档只认路由：树点击、@ 文档跳转、浏览器前进后退走同一条路。
const activeDocumentId = computed(() =>
  route.name === 'knowledge-doc' ? String(route.params.documentId ?? '') : '',
)
const treeRef = ref<InstanceType<typeof KnowledgeTree>>()
const docViewRef = ref<InstanceType<typeof DocView>>()
const canvasPanelRef = ref<InstanceType<typeof CanvasPanel>>()
// 空间概览是知识库的首页：没有打开文档时显示看板。
const showHome = ref(true)
// 主区视图：概览 / 文档 / 图谱。
const mainTab = ref<'home' | 'doc' | 'graph'>('home')
// 表格与导图没有文档正文，单独用结构化编辑器承载。
const structuredNode = ref<KnowledgeNode | null>(null)
// 画布在右侧面板里渲染：和文档同级，不跳到独立画布页。
const canvasNode = ref<KnowledgeNode | null>(null)
// 从模板新建时，把要插入的编辑器模板 id 传给文档视图。
const pendingEditorTemplate = ref('')
// 打开的文件夹：右侧展示它的子节点列表。
const folderView = ref<{ folder: KnowledgeNode; children: KnowledgeNode[] } | null>(null)

async function loadProject() {
  try {
    project.value = await projectsApi.getProject(projectId.value)
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '加载项目失败'))
  }
}

/** 深链直接打开文档时不能停在概览页。 */
watch(
  activeDocumentId,
  (docId) => {
    if (docId) {
      showHome.value = false
      mainTab.value = 'doc'
      structuredNode.value = null
    }
  },
  { immediate: true },
)

function openDoc(node: KnowledgeNode, editorTemplateId?: string) {
  showHome.value = false
  mainTab.value = 'doc'
  structuredNode.value = null
  canvasNode.value = null
  folderView.value = null
  pendingEditorTemplate.value = editorTemplateId ?? ''
  void router.replace({ name: 'knowledge-doc', params: { projectId: projectId.value, documentId: node.documentId ?? '' } })
}

function openHome() {
  showHome.value = true
  mainTab.value = 'home'
  structuredNode.value = null
  canvasNode.value = null
  folderView.value = null
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

function openDocById(documentId: string) {
  showHome.value = false
  mainTab.value = 'doc'
  structuredNode.value = null
  canvasNode.value = null
  folderView.value = null
  void router.replace({ name: 'knowledge-doc', params: { projectId: projectId.value, documentId } })
}

function backToTree() {
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

/** 表格 / 导图节点：右侧切换到结构化编辑器。 */
function openStructuredNode(node: KnowledgeNode) {
  structuredNode.value = node
  canvasNode.value = null
  folderView.value = null
  mainTab.value = 'doc'
  showHome.value = false
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

/** 画布节点：跳到画布编辑器，按模板 id 选组件，带文档 id 打开本项目这一份。 */
function openCanvasNode(node: KnowledgeNode, templateId?: string) {
  const id = (templateId || node.documentTemplateId || node.documentCanvasType || '').replace(/_/g, '-')
  if (!id || !node.documentId) {
    ElMessage.warning('这张画布没有可用的模板信息')
    return
  }
  canvasNode.value = node
  structuredNode.value = null
  folderView.value = null
  showHome.value = false
  mainTab.value = 'doc'
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

/** 点击文件夹：右侧展示该文件夹的子节点列表。 */
function openFolder(folder: KnowledgeNode, children: KnowledgeNode[]) {
  folderView.value = { folder, children }
  structuredNode.value = null
  canvasNode.value = null
  showHome.value = false
  mainTab.value = 'doc'
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

/** 子列表里点开一项：按节点类型分派到对应编辑器。 */
function openFolderChild(node: KnowledgeNode) {
  if (node.nodeType === 'canvas') return openCanvasNode(node)
  if (node.nodeType === 'sheet' || node.nodeType === 'mindmap') return openStructuredNode(node)
  if (node.nodeType === 'folder') return openFolder(node, treeRef.value?.childrenOf(node.id) ?? [])
  if (node.documentId) return openDoc(node)
}

/** 在文件夹下新建子文档：复用目录树的快速新建面板。 */
function createInFolder(folder: KnowledgeNode) {
  treeRef.value?.openQuickCreate(folder.id)
}

/** 目录树刷新后，同步右侧打开着的文件夹子列表。 */
function onTreeUpdated() {
  // 树重载后节点对象会换新：把右侧打开着的面板重新绑到新对象，标题 / 图标才不是旧的。
  if (canvasNode.value) {
    canvasNode.value = treeRef.value?.nodeById(canvasNode.value.id) ?? canvasNode.value
  }
  if (structuredNode.value) {
    structuredNode.value = treeRef.value?.nodeById(structuredNode.value.id) ?? structuredNode.value
  }
  const view = folderView.value
  if (!view) return
  folderView.value = {
    folder: view.folder,
    children: treeRef.value?.childrenOf(view.folder.id) ?? view.children,
  }
}

/** 独立窗口打开：在画布编辑器里打开这一份，带完整工具栏。 */
function openCanvasFull(node: KnowledgeNode) {
  const id = (node.documentTemplateId || node.documentCanvasType || '').replace(/_/g, '-')
  if (!id || !node.documentId) return
  void router.push({
    name: 'canvas',
    params: { templateId: id },
    query: { documentId: node.documentId },
  })
}

/** 画布标题保存：回写目录树（树里防抖落库，刷新后标题不回退）。 */
function onCanvasSaved(node: KnowledgeNode, title: string) {
  const clean = title.trim()
  if (!clean) return
  treeRef.value?.setDocTitle(node.documentId ?? '', clean)
}

/** 画布标题图标：写回目录树节点，树的行图标与画布标题保持一致。 */
async function setCanvasIcon(node: KnowledgeNode, icon: string) {
  try {
    await knowledgeApi.updateKnowledgeNode(projectId.value, node.id, { icon })
    node.icon = icon
    if (node.documentId) {
      await documentsApi.setDocumentIcon(node.documentId, icon)
      // 改图标会推进文档的 save_version：同步刷新面板手里的版本号，下一次保存才不会误判冲突。
      if (canvasNode.value?.id === node.id) await canvasPanelRef.value?.refreshSaveVersion()
    }
  } catch {
    ElMessage.error('修改图标失败')
  }
}

/** 树里改了标题 / 图标：同步右侧打开着的面板。 */
function onTreeNodeMeta(nodeId: string, meta: { title?: string; icon?: string }) {
  const apply = (node: KnowledgeNode | null) => {
    if (!node || node.id !== nodeId) return
    if (meta.title !== undefined) node.title = meta.title
    if (meta.icon !== undefined) node.icon = meta.icon
  }
  apply(canvasNode.value)
  apply(structuredNode.value)
  if (meta.title !== undefined) void syncDocTitle(nodeId, meta.title)
  if (meta.icon !== undefined) void syncDocIcon(nodeId, meta.icon)
}

/**
 * 文档侧标题：面板开着就让面板自己存（它手里有当前 save_version，直接写会撞乐观锁），
 * 面板没开才直接改文档。
 */
async function syncDocTitle(nodeId: string, title: string) {
  const node = treeRef.value?.nodeById(nodeId)
  const documentId = node?.documentId
  if (!documentId) return
  if (canvasNode.value?.id === nodeId) {
    canvasPanelRef.value?.applyTitle(title)
    return
  }
  try {
    await documentsApi.renameDocument(documentId, title)
    // 文档面板开着：把输入框对齐，并刷新它手里的 save_version，避免下次保存误判冲突。
    if (activeDocumentId.value === documentId) {
      docViewRef.value?.setTitle(title)
      await docViewRef.value?.refreshSaveVersion()
    }
  } catch {
    ElMessage.warning('节点已改名，文档标题同步失败')
  }
}

/** 文档侧图标：面板开着只更新面板显示（节点图标就是面板的图标来源），面板没开才写文档。 */
async function syncDocIcon(nodeId: string, icon: string) {
  const node = treeRef.value?.nodeById(nodeId)
  const documentId = node?.documentId
  if (!documentId) return
  const panelOpen =
    canvasNode.value?.id === nodeId || activeDocumentId.value === documentId
  if (panelOpen) return
  try {
    await documentsApi.setDocumentIcon(documentId, icon)
  } catch {
    ElMessage.warning('节点图标已更新，文档图标同步失败')
  }
}

function openGraph() {
  mainTab.value = 'graph'
  showHome.value = false
}

function onTreeRenamed(documentId: string, title: string) {
  if (documentId === activeDocumentId.value) docViewRef.value?.setTitle(title)
}

function goBack() {
  void router.push({ name: 'project-detail', params: { projectId: projectId.value } })
}

loadProject()
</script>

<template>
  <div class="kn-page">
    <nav class="kn-crumb">
      <el-button text :icon="ArrowLeft" @click="goBack">返回项目</el-button>
      <span class="kn-crumb__sep">/</span>
      <span>{{ project?.emoji }} {{ project?.name || '…' }} / 知识库</span>
    </nav>

    <el-splitter class="kn-layout">
      <el-splitter-panel :size="280" :min="200" :max="520">
        <KnowledgeTree
          ref="treeRef"
          :project-id="projectId"
          :active-document-id="activeDocumentId"
          @open-doc="openDoc"
          @open-node="openStructuredNode"
          @open-canvas="openCanvasNode"
          @open-folder="openFolder"
          @tree-updated="onTreeUpdated"
          @renamed="onTreeRenamed"
          @node-meta="onTreeNodeMeta"
          @home="openHome"
          @graph="openGraph"
        />
      </el-splitter-panel>
      <el-splitter-panel :min="360">
        <main class="kn-main">
          <div class="kn-main__tabs">
            <el-radio-group v-model="mainTab" size="small">
              <el-radio-button value="home" @click="openHome()">概览</el-radio-button>
              <el-radio-button value="doc" @click="showHome = false">内容</el-radio-button>
              <el-radio-button value="graph">图谱</el-radio-button>
            </el-radio-group>
          </div>
          <KnowledgeGraph
            v-if="mainTab === 'graph'"
            :project-id="projectId"
            @open-node="openDocById"
          />
          <SheetEditor
            v-else-if="structuredNode && structuredNode.nodeType === 'sheet'"
            :key="structuredNode.id"
            :project-id="projectId"
            :node-id="structuredNode.id"
            :title="structuredNode.title"
          />
          <MindmapEditor
            v-else-if="structuredNode && structuredNode.nodeType === 'mindmap'"
            :key="structuredNode.id"
            :project-id="projectId"
            :node-id="structuredNode.id"
          />
          <CanvasPanel
            v-else-if="canvasNode"
            ref="canvasPanelRef"
            :key="canvasNode.id"
            :document-id="canvasNode.documentId ?? ''"
            :template-id="(canvasNode.documentTemplateId || canvasNode.documentCanvasType || '').replace(/_/g, '-')"
            :icon="canvasNode.icon"
            @saved="(title) => onCanvasSaved(canvasNode!, title)"
            @icon-change="(icon) => setCanvasIcon(canvasNode!, icon)"
            @open-full="openCanvasFull(canvasNode!)"
          />
          <FolderPanel
            v-else-if="folderView && !showHome"
            :key="folderView.folder.id"
            :folder="folderView.folder"
            :children="folderView.children"
            @open="openFolderChild"
            @back="openHome"
            @create="createInFolder"
          />
          <DocView
            v-else-if="activeDocumentId && !showHome"
            ref="docViewRef"
            :key="activeDocumentId"
            :document-id="activeDocumentId"
            :project-id="projectId"
            :icon="treeRef?.docIcon(activeDocumentId)"
            :editor-template="pendingEditorTemplate"
            :locked="treeRef?.nodeOf(activeDocumentId)?.locked"
            :breadcrumb="treeRef?.pathOf(activeDocumentId) ?? []"
            :node-id="treeRef?.nodeOf(activeDocumentId)?.id"
            @back="backToTree"
            @open-related="openDocById"
            @title-change="(title) => treeRef?.setDocTitle(activeDocumentId, title)"
            @icon-change="(icon) => treeRef?.setDocIcon(activeDocumentId, icon)"
            @editor-template-applied="pendingEditorTemplate = ''"
          />
          <SpaceHome
            v-else
            :project-id="projectId"
            @open-doc="openDocById"
          />
        </main>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped>
.kn-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* 面包屑：返回项目做成返回按钮，路径文字降级为辅助信息 */
.kn-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  font-size: 13px;
  color: var(--ent-text-2, #5a6472);
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kn-crumb__sep {
  color: var(--ent-text-3, #8a94a3);
}
.kn-crumb :deep(.el-button) {
  font-weight: 500;
}

.kn-layout {
  flex: 1;
  min-height: 0;
}

/* 左侧目录与右侧主区之间的分隔线 */
.kn-layout :deep(.el-splitter-panel) {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kn-layout :deep(.el-splitter-bar) {
  background: var(--glass-ring, rgba(15, 23, 42, 0.09));
}

.kn-main {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* 视图切换：分段控件贴顶，右侧留白 */
.kn-main__tabs {
  padding: 10px 16px;
  border-bottom: 1px solid var(--glass-ring, rgba(15, 23, 42, 0.09));
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 18px)) saturate(var(--glass-saturate, 165%));
}
.kn-main__tabs :deep(.el-radio-button__inner) {
  padding: 7px 16px;
}

.kn-main__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ent-text-2, #5a6472);
  font-size: 14px;
}
</style>
