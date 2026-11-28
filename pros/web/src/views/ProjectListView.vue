<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, Edit, FolderOpened, MoreFilled, Plus } from '@element-plus/icons-vue'
import * as projectsApi from '../api/projects'
import type { ProjectSummary } from '../types/project'
import { friendlyApiMessage } from '../utils/apiMessage'
import ProjectCreateDialog from '../components/project/ProjectCreateDialog.vue'
import AppLoading from '../components/common/AppLoading.vue'

const router = useRouter()
const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const error = ref('')
const createOpen = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    projects.value = await projectsApi.listProjects()
  } catch (err) {
    error.value = friendlyApiMessage(err, '操作失败')
  } finally {
    loading.value = false
  }
}

function goHome() {
  void router.push({ name: 'guide' })
}

async function onCreated(payload: { name: string; emoji: string }) {
  try {
    await projectsApi.createProject(payload.name, payload.emoji)
    ElMessage.success('项目已创建')
    createOpen.value = false
    await load()
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

async function renameProject(project: ProjectSummary) {
  try {
    const { value } = await ElMessageBox.prompt('项目名称', '重命名项目', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: project.name,
      inputValidator: (input) => (input && input.trim() ? true : '请输入项目名称'),
    })
    await projectsApi.updateProject(project.id, { name: value.trim() })
    ElMessage.success('已重命名')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

async function deleteProject(project: ProjectSummary) {
  try {
    await ElMessageBox.confirm(
      '删除项目「' + project.name + '」会同时删除项目里的 ' + project.canvasCount + ' 张画布，且无法恢复。',
      '确认删除项目？',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await projectsApi.deleteProject(project.id)
    ElMessage.success('项目已删除')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  }
}

function openProject(project: ProjectSummary) {
  void router.push({ name: 'project-detail', params: { projectId: project.id } })
}

onMounted(load)
</script>

<template>
  <div class="pg-page">
    <nav class="pg-crumb">
      <button class="pg-icon-btn" type="button" title="返回首页" aria-label="返回首页" @click="goHome">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="pg-crumb__sep">/</span>
      <span class="pg-crumb__current">项目</span>
    </nav>

    <header class="pg-head">
      <div class="pg-head__text">
        <h1 class="pg-title">项目</h1>
        <p class="pg-sub">用项目把多张画布组织在一起。</p>
      </div>
      <button class="pg-primary-btn" type="button" @click="createOpen = true">
        <el-icon><Plus /></el-icon>
        <span>新建项目</span>
      </button>
    </header>

    <p v-if="error" class="pg-error">{{ error }}</p>

    <div v-if="loading" class="pg-empty"><AppLoading /></div>
    <div v-else-if="!projects.length" class="pg-empty">
      <span class="pg-empty__icon"><el-icon><FolderOpened /></el-icon></span>
      <p>还没有项目。点右上角「新建项目」开始。</p>
    </div>

    <div v-else class="pg-grid">
      <article
        v-for="project in projects"
        :key="project.id"
        class="pg-card"
        tabindex="0"
        role="button"
        @click="openProject(project)"
        @keydown.enter="openProject(project)"
      >
        <div class="pg-card__main">
          <span class="pg-card__emoji" aria-hidden="true">{{ project.emoji || '📁' }}</span>
          <div class="pg-card__text">
            <h2 class="pg-card__name">{{ project.name }}</h2>
            <div class="pg-card__meta">
              <span class="pg-card__count">{{ project.canvasCount }} 张画布</span>
              <span class="pg-card__bar" role="img" :aria-label="`进度 ${project.progress}%`">
                <i :style="{ width: Math.max(0, Math.min(100, project.progress)) + '%' }"></i>
              </span>
              <span class="pg-card__pct">{{ project.progress }}%</span>
            </div>
          </div>
        </div>
        <div class="pg-card__actions" @click.stop>
          <el-dropdown trigger="click" @command="(cmd: string) => cmd === 'rename' ? renameProject(project) : deleteProject(project)">
            <button class="pg-more-btn" type="button" title="更多操作" aria-label="更多操作">
              <el-icon><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename"><el-icon><Edit /></el-icon>重命名</el-dropdown-item>
                <el-dropdown-item command="delete" divided><el-icon><Delete /></el-icon>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </article>
    </div>

    <ProjectCreateDialog v-model="createOpen" @created="onCreated" />
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
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--mm-muted);
}
.pg-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--mm-text, #1d2129);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  transition: background-color 120ms ease, transform 120ms ease;
}
.pg-icon-btn:hover { background: #fff; transform: translateY(-1px); }
.pg-crumb__current { color: var(--mm-text, #1d2129); font-weight: 500; }

.pg-crumb a {
  color: var(--mm-blue);
  text-decoration: none;
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

.pg-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--mm-text);
}
.pg-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--el-color-primary, #165dff);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(22, 93, 255, 0.24);
  transition: filter 120ms ease, transform 120ms ease;
}
.pg-primary-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }

.pg-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--mm-muted);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 0;
  text-align: center;
  color: var(--mm-faint);
  font-size: 14px;
}
.pg-empty__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--el-color-primary, #165dff);
  font-size: 24px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}

.pg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.pg-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 15px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.pg-card:hover {
  border-color: rgba(22, 93, 255, 0.28);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.09);
}

.pg-card__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.pg-card__emoji {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(22, 93, 255, 0.08);
  font-size: 23px;
  line-height: 1;
}

.pg-card__text {
  min-width: 0;
}

.pg-card__name {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: var(--mm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pg-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mm-muted);
}

.pg-card__count {
  white-space: nowrap;
}

.pg-card__bar {
  flex: 1;
  min-width: 40px;
  height: 6px;
  border-radius: 999px;
  background: #ececec;
  overflow: hidden;
}

.pg-card__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--mm-blue);
}

.pg-card__pct {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.pg-card__actions {
  display: flex;
  flex: none;
}
.pg-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #5b6675;
  cursor: pointer;
}
.pg-more-btn:hover { background: rgba(15, 23, 42, 0.06); color: #1d2129; }
</style>
