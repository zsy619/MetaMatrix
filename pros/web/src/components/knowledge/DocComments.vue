<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import type { DocComment } from '../../api/knowledge'

const props = defineProps<{ documentId: string; quote?: string }>()

const comments = ref<DocComment[]>([])
const loading = ref(false)
const draft = ref('')
const showResolved = ref(false)

const emit = defineEmits<{ quoted: [] }>()

const visible = () => comments.value.filter((c) => showResolved.value || !c.resolved)

async function load() {
  loading.value = true
  try {
    comments.value = await knowledgeApi.listComments(props.documentId)
  } catch {
    comments.value = []
  } finally {
    loading.value = false
  }
}

async function submit() {
  const content = draft.value.trim()
  if (!content) return
  try {
    // 划线评论：带上编辑器里选中的原文片段。
    await knowledgeApi.addComment(props.documentId, { content, quote: props.quote ?? '' })
    draft.value = ''
    emit('quoted')
    await load()
  } catch {
    ElMessage.error('评论失败')
  }
}

async function toggleResolved(comment: DocComment) {
  await knowledgeApi.updateComment(props.documentId, comment.id, { resolved: !comment.resolved })
  await load()
}

async function remove(comment: DocComment) {
  await knowledgeApi.deleteComment(props.documentId, comment.id)
  await load()
}

watch(() => props.documentId, () => void load())
onMounted(load)
</script>

<template>
  <section class="doc-comments">
    <div class="doc-comments__head">
      <span class="doc-comments__title">评论</span>
      <el-checkbox v-model="showResolved" size="small">显示已解决</el-checkbox>
    </div>
    <p v-if="quote" class="doc-comments__selected">引用：{{ quote }}</p>
    <div class="doc-comments__editor">
      <el-input
        v-model="draft"
        size="small"
        type="textarea"
        :rows="2"
        placeholder="写一条评论…"
        maxlength="2000"
        show-word-limit
      />
      <el-button size="small" type="primary" @click="submit">评论</el-button>
    </div>
    <p v-if="loading" class="doc-comments__empty">加载中…</p>
    <p v-else-if="!visible().length" class="doc-comments__empty">还没有评论。</p>
    <ul v-else class="doc-comments__list">
      <li v-for="comment in visible()" :key="comment.id" class="doc-comments__item">
        <p v-if="comment.quote" class="doc-comments__quote">“{{ comment.quote }}”</p>
        <p class="doc-comments__body">{{ comment.content }}</p>
        <div class="doc-comments__meta">
          <span>{{ new Date(comment.createdAt).toLocaleString() }}</span>
          <el-button size="small" text @click="toggleResolved(comment)">
            {{ comment.resolved ? '重新打开' : '标记已解决' }}
          </el-button>
          <el-button size="small" text type="danger" @click="remove(comment)">删除</el-button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.doc-comments { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.doc-comments__head { display: flex; align-items: center; justify-content: space-between; }
.doc-comments__title { font-size: 12px; font-weight: 600; color: var(--mm-muted, #86909c); }
.doc-comments__editor { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.doc-comments__list { list-style: none; margin: 0; padding: 0; }
.doc-comments__item { padding: 8px 0; border-bottom: 1px solid var(--mm-line, #f2f3f5); }
.doc-comments__quote {
  margin: 0 0 4px; padding: 4px 8px; font-size: 12px;
  background: var(--mm-hover, #f2f3f5); border-radius: 4px; color: var(--mm-muted, #86909c);
}
.doc-comments__body { margin: 0; font-size: 13px; color: var(--mm-text, #1d2129); white-space: pre-wrap; }
.doc-comments__meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--mm-muted, #86909c); }
.doc-comments__selected {
  margin: 0; padding: 4px 8px; font-size: 12px;
  background: #fff7e8; border-radius: 4px; color: #d25f00;
}
.doc-comments__empty { font-size: 12px; color: var(--mm-muted, #86909c); margin: 0; }
</style>
