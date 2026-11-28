<script setup lang="ts">
/**
 * 首页右侧的项目模块：列出当前账号的项目，可直接进入、可就地新建。
 *
 * 项目的增删改在「全部项目」页做，这里只做首页最常用的两件事：
 * 一眼看到有哪些项目、点一下就进去。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createProject, listProjects } from '../../api/projects'
import type { ProjectSummary } from '../../types/project'
import { friendlyApiMessage } from '../../utils/apiMessage'
import LineSkeleton from '../ui/LineSkeleton.vue'

const props = defineProps<{ authenticated: boolean }>()

/** 侧栏只放得下几条，多的交给「全部项目」页。 */
const VISIBLE_LIMIT = 5

const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const error = ref('')
const creating = ref(false)

const visible = computed(() => projects.value.slice(0, VISIBLE_LIMIT))
const hiddenCount = computed(() => Math.max(0, projects.value.length - VISIBLE_LIMIT))

async function load() {
  if (!props.authenticated) {
    projects.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    projects.value = await listProjects()
  } catch (err) {
    error.value = friendlyApiMessage(err, '项目暂时不可用')
  } finally {
    loading.value = false
  }
}

async function create() {
  creating.value = true
  try {
    const { value } = await ElMessageBox.prompt('项目名称', '新建项目', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: '新项目',
      inputValidator: (input) => (input && input.trim() ? true : '请输入项目名称'),
    })
    await createProject(value.trim())
    ElMessage.success('项目已创建')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
  } finally {
    creating.value = false
  }
}

onMounted(load)
// 登录状态变了（登录、退出、刷新）就重新取一次项目列表。
watch(() => props.authenticated, load)
</script>

<template>
  <section class="guide-projects" aria-label="项目">
    <div class="projects-head">
      <h2 class="projects-title">项目</h2>
      <button
        v-if="authenticated"
        type="button"
        class="projects-add"
        :disabled="creating"
        aria-label="新建项目"
        title="新建项目"
        @click="create"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path
            d="M8 3.4v9.2M3.4 8h9.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>

    <p v-if="!authenticated" class="projects-empty">登录后可管理项目</p>
    <p v-else-if="error" class="projects-empty" role="alert">
      {{ error }}
      <button type="button" class="projects-retry" @click="load">重试</button>
    </p>
    <LineSkeleton v-else-if="loading" />
    <p v-else-if="!projects.length" class="projects-empty">还没有项目</p>
    <ul v-else class="projects-list">
      <li v-for="p in visible" :key="p.id">
        <router-link class="project-item" :to="{ name: 'project-detail', params: { projectId: p.id } }">
          <span class="project-icon" aria-hidden="true">{{ p.emoji || '📁' }}</span>
          <span class="project-name">{{ p.name }}</span>
          <span class="project-count">{{ p.canvasCount }} 张</span>
        </router-link>
      </li>
    </ul>

    <router-link
      v-if="authenticated"
      class="projects-all"
      :to="{ name: 'projects' }"
    >
      {{ hiddenCount > 0 ? `全部项目（${projects.length}）→` : '全部项目 →' }}
    </router-link>
  </section>
</template>

<style scoped>
.guide-projects {
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(232, 234, 237, 0.9);
}

.projects-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 4px 6px;
  padding: 0 2px;
}

.projects-title {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: #9aa0a6;
  letter-spacing: 0.02em;
}

.projects-add {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #5f6368;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.projects-add:hover:not(:disabled) {
  background: #e8f0fe;
  color: #1a73e8;
}

.projects-add:disabled {
  opacity: 0.45;
  cursor: default;
}

.projects-empty {
  margin: 6px 8px 0;
  font-size: 12.5px;
  color: #9aa0a6;
  line-height: 1.5;
}

.projects-retry {
  margin-left: 4px;
  border: 0;
  background: transparent;
  color: #1a73e8;
  font-size: 12px;
  cursor: pointer;
}

.projects-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 8px;
  border-radius: 10px;
  color: #202124;
  text-decoration: none;
  transition: background 0.12s ease;
}

.project-item:hover,
.project-item:focus-visible {
  background: rgba(32, 33, 36, 0.06);
  outline: none;
}

.project-icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f1f3f4;
  font-size: 15px;
  line-height: 1;
}

.project-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-count {
  flex-shrink: 0;
  font-size: 11px;
  color: #80868b;
  white-space: nowrap;
}

.projects-all {
  display: inline-block;
  margin: 8px 8px 0;
  font-size: 12px;
  color: #1a73e8;
  text-decoration: none;
}

.projects-all:hover {
  text-decoration: underline;
}
</style>
