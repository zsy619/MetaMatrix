<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Plus, Warning } from '@element-plus/icons-vue'
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

const cards = computed(() => {
  const s = summary.value
  if (!s) return []
  return [
    { label: '目录节点', value: s.nodeCount },
    { label: '内容文档', value: s.docCount },
    { label: '文件夹', value: s.folderCount },
    { label: '标签', value: s.tagCount },
    { label: '评论', value: s.commentCount },
    { label: '未解决评论', value: s.openComments },
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
      <div>
        <h2>空间概览</h2>
        <p>知识库的规模、活跃度与待补内容。</p>
      </div>
      <div class="kn-home__actions">
        <el-button size="small" :icon="Download" @click="exportTree">导出目录树</el-button>
        <el-button size="small" @click="exportSpace">打包导出空间</el-button>
        <el-button size="small" @click="membersVisible = true">空间成员</el-button>
      </div>
    </header>

    <div v-if="loading" class="kn-home__empty">加载中…</div>
    <template v-else-if="summary">
      <div class="kn-home__cards">
        <div v-for="card in cards" :key="card.label" class="kn-home__card">
          <span class="kn-home__card-value">{{ card.value }}</span>
          <span class="kn-home__card-label">{{ card.label }}</span>
        </div>
      </div>

      <div class="kn-home__grid">
        <section class="kn-home__panel">
          <h3><el-icon><Warning /></el-icon> 健康度检查</h3>
          <p v-if="!summary.health.length" class="kn-home__ok">没有发现问题，知识库状态良好。</p>
          <ul v-else class="kn-home__health">
            <li v-for="(item, index) in summary.health" :key="index">
              <button type="button" class="kn-home__health-link" @click="emit('open-doc', item.docId)">
                {{ item.title || '未命名文档' }}
              </button>
              <span class="kn-home__tag">{{ healthLabels[item.kind] || item.kind }}</span>
              <span class="kn-home__msg">{{ item.message }}</span>
            </li>
          </ul>
        </section>

        <section class="kn-home__panel">
          <h3>最近活动</h3>
          <p v-if="!events.length" class="kn-home__ok">还没有活动记录。</p>
          <ul v-else class="kn-home__recent">
            <li v-for="event in events" :key="event.id">
              <span class="kn-home__tag">{{ eventLabels[event.eventType] || event.eventType }}</span>
              <span class="kn-home__msg">{{ new Date(event.createdAt).toLocaleString() }}</span>
            </li>
          </ul>
        </section>

        <section class="kn-home__panel">
          <h3>质量体检</h3>
          <p v-if="!quality.length" class="kn-home__ok">没有发现质量问题。</p>
          <ul v-else class="kn-home__health">
            <li v-for="(item, index) in quality.slice(0, 20)" :key="index">
              <button type="button" class="kn-home__health-link" @click="emit('open-doc', item.docId)">
                {{ item.title || '未命名文档' }}
              </button>
              <span class="kn-home__tag">{{ item.kind }}</span>
              <span class="kn-home__msg">{{ item.detail }} · {{ item.suggest }}</span>
            </li>
          </ul>
        </section>

        <section class="kn-home__panel">
          <h3>疑似重复文档</h3>
          <p v-if="!similar.length" class="kn-home__ok">没有发现重复文档。</p>
          <ul v-else class="kn-home__health">
            <li v-for="(group, index) in similar" :key="index">
              <button
                v-for="item in group"
                :key="item.nodeId"
                type="button"
                class="kn-home__health-link"
                @click="item.documentId && emit('open-doc', item.documentId)"
              >
                {{ item.title }}
              </button>
            </li>
          </ul>
        </section>

        <section class="kn-home__panel kn-home__panel--board">
          <h3>
            属性看板
            <el-radio-group v-model="boardGroupBy" size="small" style="margin-left: auto">
              <el-radio-button value="status">按状态</el-radio-button>
              <el-radio-button value="priority">按优先级</el-radio-button>
            </el-radio-group>
          </h3>
          <p v-if="!board.length" class="kn-home__ok">还没有挂载到目录的文档。</p>
          <div v-else class="kn-board">
            <div v-for="[group, items] in boardGroups" :key="group" class="kn-board__column">
              <div class="kn-board__column-title">{{ group }}（{{ items.length }}）</div>
              <button
                v-for="item in items"
                :key="item.docId"
                type="button"
                class="kn-board__card"
                @click="emit('open-doc', item.docId)"
              >
                <span>{{ item.icon }} {{ item.title }}</span>
                <span v-if="item.dueAt" class="kn-home__msg">
                  截止 {{ new Date(item.dueAt).toLocaleDateString() }}
                </span>
              </button>
            </div>
          </div>
        </section>

        <section class="kn-home__panel">
          <h3>业务标签词库</h3>
          <div class="kn-home__dict">
            <el-input v-model="dictTag" size="small" placeholder="词条" style="width: 110px" />
            <el-input v-model="dictCategory" size="small" placeholder="分类" style="width: 90px" />
            <el-input v-model="dictAliases" size="small" placeholder="别名（逗号分隔）" style="width: 140px" />
            <el-button size="small" type="primary" @click="addDictEntry">添加</el-button>
          </div>
          <p v-if="!dict.length" class="kn-home__ok">词库还是空的：统一标签命名后，标签推荐会更准。</p>
          <ul v-else class="kn-home__recent">
            <li v-for="entry in dict" :key="entry.id">
              <span class="kn-home__health-link">{{ entry.tag }}</span>
              <span v-if="entry.category" class="kn-home__tag">{{ entry.category }}</span>
              <span v-if="entry.aliases" class="kn-home__msg">{{ entry.aliases }}</span>
              <el-button size="small" text type="danger" @click="removeDictEntry(entry)">删除</el-button>
            </li>
          </ul>
        </section>

        <section class="kn-home__panel">
          <h3><el-icon><Plus /></el-icon> 最近更新</h3>
          <p v-if="!summary.recentUpdates.length" class="kn-home__ok">还没有内容。</p>
          <ul v-else class="kn-home__recent">
            <li v-for="node in summary.recentUpdates" :key="node.id">
              <button type="button" class="kn-home__health-link" @click="node.documentId && emit('open-doc', node.documentId)">
                {{ node.icon }} {{ node.title }}
              </button>
              <span class="kn-home__msg">{{ new Date(node.updatedAt).toLocaleString() }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
    <div v-else class="kn-home__empty">看板数据加载失败。</div>
  </section>
</template>

<style scoped>
.kn-home { padding: 20px 24px; overflow: auto; }
.kn-home__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kn-home__head h2 { margin: 0; font-size: 18px; color: var(--mm-text, #1d2129); }
.kn-home__head p { margin: 4px 0 0; font-size: 13px; color: var(--mm-muted, #86909c); }
.kn-home__cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px; margin: 16px 0;
}
.kn-home__card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 14px; border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 10px; background: var(--mm-surface, #fff);
}
.kn-home__card-value { font-size: 22px; font-weight: 600; color: var(--mm-text, #1d2129); }
.kn-home__card-label { font-size: 12px; color: var(--mm-muted, #86909c); }
.kn-home__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.kn-home__panel {
  border: 1px solid var(--mm-line, #e5e6eb); border-radius: 10px;
  background: var(--mm-surface, #fff); padding: 12px 14px;
}
.kn-home__panel h3 {
  display: flex; align-items: center; gap: 6px;
  margin: 0 0 8px; font-size: 14px; color: var(--mm-text, #1d2129);
}
.kn-home__health, .kn-home__recent { list-style: none; margin: 0; padding: 0; }
.kn-home__health li, .kn-home__recent li {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 0; border-bottom: 1px solid var(--mm-line, #f2f3f5);
  font-size: 13px;
}
.kn-home__health-link {
  border: 0; background: none; padding: 0; cursor: pointer;
  color: var(--mm-blue, #1677ff); font-size: 13px;
}
.kn-home__tag {
  font-size: 11px; padding: 1px 6px; border-radius: 10px;
  background: var(--mm-hover, #f2f3f5); color: var(--mm-muted, #86909c);
}
.kn-home__msg { font-size: 12px; color: var(--mm-muted, #86909c); }
.kn-home__ok { font-size: 13px; color: var(--mm-muted, #86909c); margin: 0; }
.kn-home__panel--board { grid-column: 1 / -1; }
.kn-home__dict { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.kn-board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.kn-board__column {
  min-width: 180px; background: var(--mm-hover, #f7f8fa);
  border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px;
}
.kn-board__column-title { font-size: 12px; color: var(--mm-muted, #86909c); font-weight: 600; }
.kn-board__card {
  display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer;
  border: 1px solid var(--mm-line, #e5e6eb); border-radius: 6px; background: var(--mm-surface, #fff);
  padding: 6px 8px; font-size: 13px; color: var(--mm-text, #1d2129);
}
.kn-board__card:hover { border-color: var(--mm-blue, #1677ff); }
.kn-home__empty { padding: 32px; text-align: center; color: var(--mm-muted, #86909c); font-size: 13px; }
</style>
