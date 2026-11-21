<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  askKnowledgeFollowUp,
  askKnowledgeGlobal,
  askKnowledgeSpace,
  getDocSummary,
  getDocTags,
  updateDocProperties,
} from '../../api/knowledge'
import type { KnowledgeAnswer } from '../../api/knowledge'

const props = defineProps<{ projectId: string; documentId: string }>()

const summary = ref('')
const tags = ref<string[]>([])
const question = ref('')
const answers = ref<KnowledgeAnswer[]>([])
const loading = ref(false)
const asking = ref(false)
/** 多轮追问的上下文（历史问题）。 */
const history = ref<string[]>([])
/** 语料范围：当前空间 / 全部项目。 */
const scope = ref<'space' | 'global'>('space')

async function load() {
  loading.value = true
  try {
    const [sum, tagList] = await Promise.all([
      getDocSummary(props.documentId),
      getDocTags(props.documentId),
    ])
    summary.value = sum.summary
    tags.value = tagList
  } catch {
    ElMessage.error('加载智能结果失败')
  } finally {
    loading.value = false
  }
}

async function applyTags() {
  try {
    await updateDocProperties(props.documentId, { tags: tags.value.join(',') })
    ElMessage.success('标签已写入文档属性')
  } catch {
    ElMessage.error('保存标签失败')
  }
}

async function ask() {
  const q = question.value.trim()
  if (!q) return
  asking.value = true
  try {
    if (scope.value === 'global') {
      // 跨项目语料（100）。
      answers.value = await askKnowledgeGlobal(q)
    } else if (history.value.length) {
      // 多轮追问（061）：把历史问题一起带上。
      answers.value = await askKnowledgeFollowUp(props.projectId, q, history.value)
    } else {
      answers.value = await askKnowledgeSpace(props.projectId, q)
    }
    history.value = [...history.value, q].slice(-5)
    question.value = ''
    if (!answers.value.length) ElMessage.info('没有检索到相关内容')
  } catch {
    ElMessage.error('检索失败')
  } finally {
    asking.value = false
  }
}

/** 跳到出处文档（062）。 */
function openSource(documentId: string) {
  window.location.href = `/projects/${props.projectId}/knowledge/docs/${documentId}`
}

watch(() => props.documentId, load)
onMounted(load)
</script>

<template>
  <div class="ai">
    <section class="ai__block">
      <h4>摘要</h4>
      <p v-if="loading" class="ai__empty">生成中…</p>
      <p v-else-if="summary" class="ai__summary">{{ summary }}</p>
      <p v-else class="ai__empty">正文太短，暂无摘要。</p>
    </section>
    <section class="ai__block">
      <h4>标签建议</h4>
      <div class="ai__tags">
        <el-tag v-for="tag in tags" :key="tag" closable size="small" @close="tags = tags.filter((t) => t !== tag)">
          {{ tag }}
        </el-tag>
        <span v-if="!tags.length" class="ai__empty">暂无标签建议。</span>
      </div>
      <el-button size="small" :disabled="!tags.length" @click="applyTags">写入属性</el-button>
    </section>
    <section class="ai__block">
      <h4>知识问答</h4>
      <el-radio-group v-model="scope" size="small">
        <el-radio-button value="space">本空间</el-radio-button>
        <el-radio-button value="global">全部项目</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="question"
        size="small"
        placeholder="例如：预算是多少？（可继续追问）"
        @keyup.enter="ask"
      />
      <el-button size="small" type="primary" :loading="asking" @click="ask">检索</el-button>
      <ul v-if="answers.length" class="ai__answers">
        <li v-for="item in answers" :key="item.documentId">
          <div class="ai__answer-title" @click="openSource(item.documentId)">
            {{ item.title }}
          </div>
          <div class="ai__answer-snippet">{{ item.snippet }}</div>
          <div class="ai__answer-meta">
            <span v-if="item.source">出处：{{ item.source }}</span>
            <span v-if="item.confidence">
              置信度 {{ Math.round(item.confidence * 100) }}%
            </span>
          </div>
        </li>
      </ul>
      <div v-if="history.length" class="ai__history">
        <span class="ai__empty">已追问 {{ history.length }} 轮</span>
        <el-button link size="small" @click="history = []">清空上下文</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai__block {
  margin-bottom: 14px;
}
.ai__block h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--mm-muted, #86909c);
}
.ai__summary {
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 8px;
}
.ai__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.ai__answers {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.ai__answers li {
  border-left: 2px solid var(--mm-blue, #1677ff);
  padding: 4px 0 4px 8px;
  margin-bottom: 8px;
}
.ai__answer-title {
  font-size: 12px;
  font-weight: 600;
}
.ai__answer-snippet {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  line-height: 1.5;
}
.ai__answer-meta {
  display: flex; gap: 8px;
  font-size: 11px; color: var(--mm-muted, #86909c); margin-top: 2px;
}
.ai__answer-title { cursor: pointer; }
.ai__history { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.ai__empty {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  margin: 0;
}
</style>
