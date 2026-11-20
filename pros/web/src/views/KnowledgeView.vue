<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import * as projectsApi from '../api/projects'
import type { Project } from '../types/project'
import KnowledgeTree from '../components/knowledge/KnowledgeTree.vue'
import DocView from '../components/knowledge/DocView.vue'
import SpaceHome from '../components/knowledge/SpaceHome.vue'
import KnowledgeGraph from '../components/knowledge/KnowledgeGraph.vue'
import SheetEditor from '../components/knowledge/SheetEditor.vue'
import MindmapEditor from '../components/knowledge/MindmapEditor.vue'
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
// 空间概览是知识库的首页：没有打开文档时显示看板。
const showHome = ref(true)
// 主区视图：概览 / 文档 / 图谱。
const mainTab = ref<'home' | 'doc' | 'graph'>('home')
// 表格与导图没有文档正文，单独用结构化编辑器承载。
const structuredNode = ref<KnowledgeNode | null>(null)

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

function openDoc(node: KnowledgeNode) {
  showHome.value = false
  mainTab.value = 'doc'
  structuredNode.value = null
  void router.replace({ name: 'knowledge-doc', params: { projectId: projectId.value, documentId: node.documentId ?? '' } })
}

function openHome() {
  showHome.value = true
  mainTab.value = 'home'
  structuredNode.value = null
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

function openDocById(documentId: string) {
  showHome.value = false
  mainTab.value = 'doc'
  structuredNode.value = null
  void router.replace({ name: 'knowledge-doc', params: { projectId: projectId.value, documentId } })
}

function backToTree() {
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
}

/** 表格 / 导图节点：右侧切换到结构化编辑器。 */
function openStructuredNode(node: KnowledgeNode) {
  structuredNode.value = node
  mainTab.value = 'doc'
  showHome.value = false
  void router.replace({ name: 'knowledge', params: { projectId: projectId.value } })
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
          @renamed="onTreeRenamed"
          @home="openHome"
          @graph="openGraph"
        />
      </el-splitter-panel>
      <el-splitter-panel :min="360">
        <main class="kn-main">
          <div class="kn-main__tabs">
            <el-radio-group v-model="mainTab" size="small">
              <el-radio-button value="home" @click="showHome = true">概览</el-radio-button>
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
          />
          <MindmapEditor
            v-else-if="structuredNode && structuredNode.nodeType === 'mindmap'"
            :key="structuredNode.id"
            :project-id="projectId"
            :node-id="structuredNode.id"
          />
          <DocView
            v-else-if="activeDocumentId && !showHome"
            ref="docViewRef"
            :key="activeDocumentId"
            :document-id="activeDocumentId"
            :project-id="projectId"
            :icon="treeRef?.docIcon(activeDocumentId)"
            @back="backToTree"
            @title-change="(title) => treeRef?.setDocTitle(activeDocumentId, title)"
            @icon-change="(icon) => treeRef?.setDocIcon(activeDocumentId, icon)"
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
}
.kn-crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  font-size: 13px;
  color: var(--mm-muted, #86909c);
  background: var(--mm-surface, #fff);
}
.kn-crumb__sep { color: var(--mm-faint, #c9cdd4); }
.kn-layout {
  flex: 1;
  min-height: 0;
}
.kn-main {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.kn-main__tabs {
  padding: 8px 16px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  background: var(--mm-surface, #fff);
}
.kn-main__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--mm-muted, #86909c);
  font-size: 14px;
}
</style>
