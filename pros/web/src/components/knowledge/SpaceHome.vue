<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Plus, Warning } from '@element-plus/icons-vue'
import * as knowledgeApi from '../../api/knowledge'
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
    { label: '节点', value: s.nodeCount },
    { label: '文档', value: s.docCount },
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
    <header class="kn-home__head">
      <div>
        <h2>空间概览</h2>
        <p>知识库的规模、活跃度与待补内容。</p>
      </div>
      <div class="kn-home__actions">
        <el-button size="small" :icon="Download" @click="exportTree">导出目录树</el-button>
        <el-button size="small" @click="exportSpace">打包导出空间</el-button>
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
.kn-home__empty { padding: 32px; text-align: center; color: var(--mm-muted, #86909c); font-size: 13px; }
</style>
