<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Box,
  ChatDotRound,
  CircleCheck,
  Collection,
  CopyDocument,
  Download,
  Folder,
  Grid,
  PriceTag,
  Promotion,
  Reading,
  Tickets,
  User,
  Warning,
} from '@element-plus/icons-vue'
import * as knowledgeApi from '../../api/knowledge'
import * as knowledgeApiV5 from '../../api/knowledge_v5'
import SpaceMembers from './SpaceMembers.vue'
import type {
  KnowledgeEvent,
  KnowledgeQualityItem,
  KnowledgeSearchHit,
  KnowledgeSummary,
} from '../../api/knowledge'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ 'open-doc': [documentId: string] }>()

const summary = ref<KnowledgeSummary | null>(null)
const loading = ref(false)
/** 最近活动（107）。 */
const events = ref<KnowledgeEvent[]>([])
/** 质量体检（101）。 */
const quality = ref<KnowledgeQualityItem[]>([])
/** 疑似重复文档（102）。 */
const similar = ref<KnowledgeSearchHit[][]>([])
/** 属性看板（034）。 */
const board = ref<knowledgeApiV5.DocBoardItem[]>([])
const boardGroupBy = ref<'status' | 'priority'>('status')
/** 业务标签词库（098）。 */
const dict = ref<knowledgeApiV5.TagDictEntry[]>([])
const dictTag = ref('')
const dictCategory = ref('')
const dictAliases = ref('')
/** 空间成员与角色（069）。 */
const membersVisible = ref(false)

const healthLabels: Record<string, string> = {
  no_title: '缺标题',
  empty_doc: '正文为空',
  stale: '久未更新',
  no_summary: '缺摘要',
}

/** 健康度徽标语义色：按问题严重度分档。 */
const healthTones: Record<string, string> = {
  no_title: 'danger',
  empty_doc: 'warning',
  stale: 'info',
  no_summary: 'purple',
}

/** 质量体检徽标语义色（kind 是后端返回的中文分类）。 */
const qualityTones: Record<string, string> = {
  缺少摘要: 'purple',
  空文档: 'warning',
  空段落: 'info',
  重复表述: 'cyan',
  超长文档: 'muted',
}

const cards = computed(() => {
  const s = summary.value
  if (!s) return []
  return [
    { label: '目录节点', value: s.nodeCount, icon: Grid, tone: 'info' },
    { label: '内容文档', value: s.docCount, icon: Reading, tone: 'cyan' },
    { label: '文件夹', value: s.folderCount, icon: Folder, tone: 'purple' },
    { label: '标签', value: s.tagCount, icon: PriceTag, tone: 'success' },
    { label: '评论', value: s.commentCount, icon: ChatDotRound, tone: 'warning' },
    { label: '未解决评论', value: s.openComments, icon: Tickets, tone: 'danger' },
  ]
})

async function load() {
  loading.value = true
  try {
    summary.value = await knowledgeApi.getKnowledgeSummary(props.projectId)
    const [eventRows, qualityRows, similarRows] = await Promise.all([
      knowledgeApi.listKnowledgeEvents(props.projectId, 20).catch(() => []),
      knowledgeApi.listQualityIssues(props.projectId).catch(() => []),
      knowledgeApi.listSimilarDocs(props.projectId).catch(() => []),
    ])
    events.value = eventRows
    quality.value = qualityRows
    similar.value = similarRows
    board.value = await knowledgeApiV5.getDocPropsBoard(props.projectId).catch(() => [])
    dict.value = await knowledgeApiV5.listTagDict(props.projectId).catch(() => [])
  } catch {
    summary.value = null
  } finally {
    loading.value = false
  }
}

/** 整空间打包导出（092/095）。 */
async function exportSpace() {
  try {
    await knowledgeApi.exportKnowledgeSpaceZip(props.projectId)
    ElMessage.success('已导出知识空间压缩包')
  } catch {
    ElMessage.error('导出失败')
  }
}

const eventLabels: Record<string, string> = {
  'node.create': '新建节点',
  'node.update': '更新节点',
  'node.meta': '修改节点信息',
  'node.move': '移动节点',
  'node.delete': '删除节点',
  'doc.update': '更新文档',
  'doc.publish': '发布文档',
  'comment.create': '新增评论',
  'share.access': '通过链接访问',
}

/** 属性看板：按状态或优先级分组。 */
const boardGroups = computed(() => {
  const key = boardGroupBy.value
  const map = new Map<string, knowledgeApiV5.DocBoardItem[]>()
  for (const item of board.value) {
    const group = (item[key] || '未设置') as string
    const list = map.get(group) ?? []
    list.push(item)
    map.set(group, list)
  }
  const order = key === 'status' ? ['draft', 'published', 'archived'] : ['urgent', 'high', 'normal', 'low']
  return [...map.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0])
    const ib = order.indexOf(b[0])
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
})

/** 看板分组名本地化：后端给的是英文状态码。 */
const boardLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低',
}

/** 词库维护（098）。 */
async function addDictEntry() {
  if (!dictTag.value.trim()) {
    ElMessage.warning('请输入词条')
    return
  }
  try {
    await knowledgeApiV5.addTagDict(props.projectId, {
      tag: dictTag.value.trim(),
      category: dictCategory.value.trim(),
      aliases: dictAliases.value.trim(),
    })
    dictTag.value = ''
    dictCategory.value = ''
    dictAliases.value = ''
    dict.value = await knowledgeApiV5.listTagDict(props.projectId)
    ElMessage.success('已加入词库')
  } catch {
    ElMessage.error('加入词库失败')
  }
}

async function removeDictEntry(entry: knowledgeApiV5.TagDictEntry) {
  await knowledgeApiV5.deleteTagDict(props.projectId, entry.id)
  dict.value = await knowledgeApiV5.listTagDict(props.projectId)
}

async function exportTree() {
  const res = await knowledgeApi.exportKnowledgeTree(props.projectId)
  const blob = new Blob([res.content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = res.filename || 'knowledge-tree.md'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已导出 Markdown 目录树')
}

onMounted(load)
</script>

<template>
  <section class="kn-home">
    <SpaceMembers v-model="membersVisible" :project-id="props.projectId" />

    <header class="kn-home__head">
      <div class="kn-home__head-text">
        <h2>空间概览</h2>
        <p>知识库的规模、活跃度与待补内容。</p>
      </div>
      <div class="kn-home__actions">
        <el-button size="small" :icon="Download" @click="exportTree">导出目录树</el-button>
        <el-button size="small" :icon="Box" @click="exportSpace">打包导出空间</el-button>
        <el-button size="small" type="primary" :icon="User" @click="membersVisible = true">空间成员</el-button>
      </div>
    </header>

    <div v-if="loading" class="kn-home__empty">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else-if="summary">
      <!-- KPI -->
      <div class="kn-home__cards">
        <div
          v-for="card in cards"
          :key="card.label"
          class="ent-stat"
          :style="{
            '--ent-stat-accent': `var(--ent-${card.tone})`,
            '--ent-stat-soft': `var(--ent-${card.tone}-soft)`,
          }"
        >
          <span class="ent-stat__icon"><el-icon><component :is="card.icon" /></el-icon></span>
          <span class="ent-stat__body">
            <span class="ent-stat__value">{{ card.value }}</span>
            <span class="ent-stat__label">{{ card.label }}</span>
          </span>
        </div>
      </div>

      <div class="kn-home__grid">
        <!-- 健康度检查 -->
        <section class="ent-card ent-card--tg-red">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Warning /></el-icon></span>
            <span class="ent-card__title">健康度检查</span>
            <span v-if="summary.health.length" class="ent-card__count">{{ summary.health.length }}</span>
          </div>
          <div class="ent-card__body">
            <div v-if="!summary.health.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><CircleCheck /></el-icon></span>
              <span>没有发现问题，知识库状态良好。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="(item, index) in summary.health" :key="index" class="ent-list__row">
                <span class="ent-list__main">
                  <button
                    type="button"
                    class="ent-list__title"
                    @click="emit('open-doc', item.docId)"
                  >
                    {{ item.title || '未命名文档' }}
                  </button>
                  <span class="ent-badge" :class="`ent-badge--${healthTones[item.kind] || 'muted'}`">
                    {{ healthLabels[item.kind] || item.kind }}
                  </span>
                </span>
                <span class="ent-list__msg">{{ item.message }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 质量体检 -->
        <section class="ent-card ent-card--tg-purple">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Tickets /></el-icon></span>
            <span class="ent-card__title">质量体检</span>
            <span v-if="quality.length" class="ent-card__count">{{ quality.length }}</span>
          </div>
          <div class="ent-card__body">
            <div v-if="!quality.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><CircleCheck /></el-icon></span>
              <span>没有发现质量问题。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="(item, index) in quality.slice(0, 20)" :key="index" class="ent-list__row">
                <span class="ent-list__main">
                  <button
                    type="button"
                    class="ent-list__title"
                    @click="emit('open-doc', item.docId)"
                  >
                    {{ item.title || '未命名文档' }}
                  </button>
                  <span class="ent-badge" :class="`ent-badge--${qualityTones[item.kind] || 'muted'}`">
                    {{ item.kind }}
                  </span>
                </span>
                <span class="ent-list__msg">{{ item.detail }} · {{ item.suggest }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 最近活动 -->
        <section class="ent-card ent-card--tg-blue">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Promotion /></el-icon></span>
            <span class="ent-card__title">最近活动</span>
            <span v-if="events.length" class="ent-card__count">{{ events.length }}</span>
          </div>
          <div class="ent-card__body">
            <div v-if="!events.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><Promotion /></el-icon></span>
              <span>还没有活动记录。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="event in events" :key="event.id" class="ent-list__row">
                <span class="ent-list__main">
                  <span class="ent-badge ent-badge--info">
                    {{ eventLabels[event.eventType] || event.eventType }}
                  </span>
                </span>
                <span class="ent-list__meta">{{ new Date(event.createdAt).toLocaleString() }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 疑似重复文档 -->
        <section class="ent-card ent-card--tg-cyan kn-home__panel--similar">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><CopyDocument /></el-icon></span>
            <span class="ent-card__title">疑似重复文档</span>
            <span v-if="similar.length" class="ent-card__count">{{ similar.length }}</span>
          </div>
          <div class="ent-card__body">
            <div v-if="!similar.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><CircleCheck /></el-icon></span>
              <span>没有发现重复文档。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="(group, index) in similar" :key="index" class="ent-list__row">
                <span class="ent-list__main">
                  <button
                    v-for="item in group"
                    :key="item.nodeId"
                    type="button"
                    class="ent-list__title"
                    @click="item.documentId && emit('open-doc', item.documentId)"
                  >
                    {{ item.title }}
                  </button>
                </span>
                <span class="ent-badge ent-badge--muted">{{ group.length }} 篇</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 业务标签词库 -->
        <section class="ent-card ent-card--tg-green">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Collection /></el-icon></span>
            <span class="ent-card__title">业务标签词库</span>
            <span v-if="dict.length" class="ent-card__count">{{ dict.length }}</span>
          </div>
          <div class="ent-card__body">
            <div class="kn-home__dict">
              <el-input v-model="dictTag" size="small" placeholder="词条" style="width: 110px" />
              <el-input v-model="dictCategory" size="small" placeholder="分类" style="width: 90px" />
              <el-input v-model="dictAliases" size="small" placeholder="别名（逗号分隔）" style="width: 140px" />
              <el-button size="small" type="primary" @click="addDictEntry">添加</el-button>
            </div>
            <div v-if="!dict.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><PriceTag /></el-icon></span>
              <span>词库还是空的：统一标签命名后，标签推荐会更准。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="entry in dict" :key="entry.id" class="ent-list__row">
                <span class="ent-list__main">
                  <span class="ent-list__title ent-list__title--plain">{{ entry.tag }}</span>
                  <span v-if="entry.category" class="ent-badge ent-badge--info">{{ entry.category }}</span>
                </span>
                <span v-if="entry.aliases" class="ent-list__meta">{{ entry.aliases }}</span>
                <el-button size="small" text type="danger" @click="removeDictEntry(entry)">删除</el-button>
              </li>
            </ul>
          </div>
        </section>

        <!-- 最近更新 -->
        <section class="ent-card ent-card--tg-blue">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Promotion /></el-icon></span>
            <span class="ent-card__title">最近更新</span>
            <span v-if="summary.recentUpdates.length" class="ent-card__count">
              {{ summary.recentUpdates.length }}
            </span>
          </div>
          <div class="ent-card__body">
            <div v-if="!summary.recentUpdates.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><Reading /></el-icon></span>
              <span>还没有内容。</span>
            </div>
            <ul v-else class="ent-list">
              <li v-for="node in summary.recentUpdates" :key="node.id" class="ent-list__row">
                <span class="ent-list__main">
                  <button
                    type="button"
                    class="ent-list__title"
                    @click="node.documentId && emit('open-doc', node.documentId)"
                  >
                    {{ node.icon }} {{ node.title }}
                  </button>
                </span>
                <span class="ent-list__meta">{{ new Date(node.updatedAt).toLocaleString() }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- 属性看板 -->
        <section class="ent-card ent-card--tg-amber kn-home__panel--board">
          <div class="ent-card__head">
            <span class="ent-card__icon"><el-icon><Grid /></el-icon></span>
            <span class="ent-card__title">属性看板</span>
            <div class="ent-card__actions">
              <el-radio-group v-model="boardGroupBy" size="small">
                <el-radio-button value="status">按状态</el-radio-button>
                <el-radio-button value="priority">按优先级</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <div class="ent-card__body">
            <div v-if="!board.length" class="ent-empty">
              <span class="ent-empty__icon"><el-icon><Grid /></el-icon></span>
              <span>还没有挂载到目录的文档。</span>
            </div>
            <div v-else class="kn-board">
              <div v-for="[group, items] in boardGroups" :key="group" class="kn-board__column">
                <div class="kn-board__column-title">
                  <span>{{ boardLabels[group] || group }}</span>
                  <span class="kn-board__column-count">{{ items.length }}</span>
                </div>
                <button
                  v-for="item in items"
                  :key="item.docId"
                  type="button"
                  class="kn-board__card"
                  @click="emit('open-doc', item.docId)"
                >
                  <span class="kn-board__card-title">{{ item.icon }} {{ item.title }}</span>
                  <span v-if="item.dueAt" class="kn-board__card-meta">
                    截止 {{ new Date(item.dueAt).toLocaleDateString() }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </template>
    <div v-else class="kn-home__empty">看板数据加载失败。</div>
  </section>
</template>

<style scoped>
.kn-home {
  padding: 18px 20px 28px;
  overflow: auto;
  background: transparent;
  /* 面板按自身宽度排版：右侧主区被拖窄时自动降列。 */
  container-type: inline-size;
  container-name: kn-home;
}

/* 页头：标题 + 右侧操作 */
.kn-home__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.kn-home__head-text {
  min-width: 0;
}
.kn-home__head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ent-text, #1f2733);
}
.kn-home__head p {
  margin: 5px 0 0;
  font-size: 13px;
  color: var(--ent-text-2, #5a6472);
}
.kn-home__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 1 auto;
  max-width: 100%;
}
/* Telegram 胶囊按钮 */
.kn-home__actions :deep(.el-button) {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
}

/* KPI 区 */
.kn-home__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

/* 面板栅格：三列等宽等高，窄屏依次降到两列、一列 */
.kn-home__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}

/* 卡片统一为纵向弹性布局：头部固定，主体占满剩余高度 */
.kn-home__grid > .ent-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: var(--kn-panel-h, 396px);
}

/* 列表型面板：超出部分内部滚动，避免一张卡把整行撑高 */
.kn-home__grid > .ent-card > .ent-card__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ent-border-strong, #c8cfda) transparent;
}

.kn-home__grid > .ent-card > .ent-card__body::-webkit-scrollbar {
  width: 6px;
}
.kn-home__grid > .ent-card > .ent-card__body::-webkit-scrollbar-thumb {
  background: var(--ent-border-strong, #c8cfda);
  border-radius: 999px;
}

/* 看板横跨整行 */
.kn-home__panel--board {
  grid-column: 1 / -1;
}

/* 看板自身有列内滚动，不受通用高度限制 */
.kn-home__grid > .kn-home__panel--board > .ent-card__body {
  overflow: visible;
}

/* 看板按内容自适应高度 */
.kn-home__grid > .kn-home__panel--board {
  height: auto;
}

/* 词库录入行 */
.kn-home__dict {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--ent-border, #e6e9ef);
}

/* 看板列 */
.kn-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  min-width: 0;
}
.kn-board__column {
  flex: 0 0 260px;
  width: 260px;
  max-height: 340px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.045);
  border: 1px solid var(--tg-sep, var(--ent-border, #e6e9ef));
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kn-board__column-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ent-text-2, #5a6472);
}
.kn-board__column-count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--ent-text-2, #5a6472);
  font-size: 11px;
  line-height: 17px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.kn-board__card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--tg-sep, var(--ent-border, #e6e9ef));
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--ent-text, #1f2733);
  box-shadow: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.kn-board__card:hover {
  border-color: var(--tg-blue, #3390ec);
  background: #fff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}
.kn-board__card-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kn-board__card-meta {
  font-size: 11px;
  color: var(--ent-text-3, #8a94a3);
}

/* 词库标签是纯文本，不可点击 */
.ent-list__title--plain {
  color: var(--ent-text, #1f2733);
  font-weight: 500;
  cursor: default;
}
.ent-list__title--plain:hover {
  text-decoration: none;
}

/* 重复文档：同组标题做成小标签，避免连排难读 */
.kn-home__panel--similar .ent-list__main {
  gap: 6px;
}
.kn-home__panel--similar .ent-list__title {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ent-surface-3, #f1f5f9);
}
.kn-home__panel--similar .ent-list__title:hover {
  background: var(--ent-primary-soft, #eaf1fd);
}

.kn-home__empty {
  padding: 24px;
  border: 1px solid var(--ent-border, #e6e9ef);
  border-radius: var(--ent-radius-md, 12px);
  background: var(--ent-surface, #fff);
}

/* 主区变窄：面板降列，KPI 收成两列 */
@container kn-home (max-width: 1080px) {
  .kn-home__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container kn-home (max-width: 720px) {
  .kn-home__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .kn-home__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
