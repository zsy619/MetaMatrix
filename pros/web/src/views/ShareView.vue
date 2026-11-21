<script setup lang="ts">
/**
 * 分享页（公开入口）。
 *
 * 角色决定访客能做什么：view 只读、comment 可评论、edit 可编辑并保存；
 * 禁止复制时屏蔽复制事件并隐藏导出入口；水印按访客标识生成（048）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { addShareComment, fetchSharedDoc, updateShareContent } from '../api/knowledge'
import type { SharedDoc } from '../api/knowledge'

const route = useRoute()
const doc = ref<SharedDoc | null>(null)
const error = ref('')
const loading = ref(true)
const password = ref('')
const needsPassword = ref(false)
const commentText = ref('')
const comments = ref<{ id: string; content: string; createdAt: string }[]>([])
const editing = ref(false)
const editHtml = ref('')
const saving = ref(false)

const roleLabel: Record<string, string> = {
  view: '只读分享',
  comment: '可评论分享',
  edit: '可编辑分享',
}

/** 访客标识：用于水印与默认昵称。 */
const visitor = ref('访客')
const visitorId = ref('')

const role = computed(() => (doc.value ? roleLabel[doc.value.role] ?? '分享' : ''))
const canComment = computed(() => doc.value?.role === 'comment' || doc.value?.role === 'edit')
const canEdit = computed(() => doc.value?.role === 'edit')
const allowCopy = computed(() => doc.value?.allowCopy !== false)

/** 水印文案：昵称 + 时间（048）。 */
const watermark = computed(() => `${visitor.value} · ${new Date().toLocaleDateString()}`)

async function load() {
  loading.value = true
  error.value = ''
  try {
    doc.value = await fetchSharedDoc(String(route.params.token ?? ''), password.value)
    needsPassword.value = doc.value.requiresPassword
    editHtml.value = doc.value.html
  } catch (err) {
    error.value = (err as Error).message || '分享链接无效或已过期'
  } finally {
    loading.value = false
  }
}

/** 口令解锁：带上口令重新取正文。 */
async function unlock() {
  loading.value = true
  try {
    doc.value = await fetchSharedDoc(String(route.params.token ?? ''), password.value)
    if (doc.value.requiresPassword) {
      error.value = '口令不正确'
    } else {
      needsPassword.value = false
      error.value = ''
      editHtml.value = doc.value.html
    }
  } catch (err) {
    error.value = (err as Error).message || '口令不正确'
  } finally {
    loading.value = false
  }
}

/** 评论：分享页角色落地（066）。 */
async function submitComment() {
  const content = commentText.value.trim()
  if (!content) return
  try {
    const created = await addShareComment(String(route.params.token ?? ''), password.value, content)
    comments.value.unshift(created)
    commentText.value = ''
    ElMessage.success('评论已提交')
  } catch (err) {
    ElMessage.error((err as Error).message || '评论失败')
  }
}

/** 保存正文：role=edit 时可回写（067）。 */
async function saveContent() {
  saving.value = true
  try {
    await updateShareContent(String(route.params.token ?? ''), password.value, editHtml.value)
    ElMessage.success('已保存')
    editing.value = false
  } catch (err) {
    ElMessage.error((err as Error).message || '保存失败')
  } finally {
    saving.value = false
  }
}

/** 禁止复制时拦截复制事件（068）。 */
function onCopy(event: ClipboardEvent) {
  if (allowCopy.value) return
  event.preventDefault()
  ElMessage.warning('该分享已关闭复制功能')
}

onMounted(() => {
  visitorId.value = localStorage.getItem('metamatrix:visitor') ?? ''
  visitor.value = visitorId.value || `访客 ${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  localStorage.setItem('metamatrix:visitor', visitor.value)
  document.addEventListener('copy', onCopy)
  void load()
})
</script>

<template>
  <div class="share-view">
    <div v-if="loading" class="share-view__state">加载中…</div>

    <div v-else-if="needsPassword && !doc?.html" class="share-view__state">
      <p>该分享需要访问口令。</p>
      <div class="share-view__unlock">
        <el-input
          v-model="password"
          type="password"
          placeholder="请输入口令"
          style="width: 240px"
          @keyup.enter="unlock"
        />
        <el-button type="primary" @click="unlock">解锁</el-button>
      </div>
    </div>

    <div v-else-if="error" class="share-view__state share-view__state--error">{{ error }}</div>

    <article v-else class="share-view__doc">
      <header class="share-view__head">
        <h1>{{ doc?.title || '未命名文档' }}</h1>
        <el-tag size="small" type="info">{{ role }}</el-tag>
        <el-tag v-if="!allowCopy" size="small" type="warning">禁止复制</el-tag>
        <el-button v-if="canEdit" size="small" @click="editing = !editing">
          {{ editing ? '预览' : '编辑' }}
        </el-button>
        <el-button v-if="editing" size="small" type="primary" :loading="saving" @click="saveContent">
          保存
        </el-button>
      </header>

      <div v-if="editing" class="share-view__editor">
        <el-input
          v-model="editHtml"
          type="textarea"
          :rows="24"
          placeholder="直接编辑正文 HTML"
        />
      </div>
      <div v-else class="share-view__content" v-html="doc?.html"></div>

      <section v-if="canComment" class="share-view__comments">
        <h3>评论</h3>
        <div class="share-view__comment-form">
          <el-input v-model="commentText" type="textarea" :rows="3" placeholder="写下你的看法…" />
          <el-button type="primary" size="small" @click="submitComment">发表评论</el-button>
        </div>
        <ul v-if="comments.length" class="share-view__comment-list">
          <li v-for="item in comments" :key="item.id">
            <div class="share-view__comment-content">{{ item.content }}</div>
            <div class="share-view__comment-time">{{ new Date(item.createdAt).toLocaleString() }}</div>
          </li>
        </ul>
      </section>

      <div v-if="!allowCopy" class="share-view__watermark" aria-hidden="true">{{ watermark }}</div>
    </article>
  </div>
</template>

<style scoped>
.share-view {
  min-height: 100vh;
  background: var(--mm-page, #f7f7f7);
  padding: 32px 16px;
}
.share-view__state {
  text-align: center;
  color: var(--mm-muted, #86909c);
  padding-top: 80px;
}
.share-view__state--error {
  color: #f53f3f;
}
.share-view__unlock {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}
.share-view__doc {
  position: relative;
  max-width: 860px;
  margin: 0 auto;
  background: var(--mm-surface, #fff);
  border-radius: 10px;
  padding: 28px 36px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 6%);
  overflow: hidden;
}
.share-view__head {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.share-view__head h1 {
  font-size: 20px;
  margin: 0;
  flex: 1;
}
.share-view__content {
  font-size: 14px;
  line-height: 1.8;
}
.share-view__editor {
  display: block;
}
.share-view__comments {
  margin-top: 24px;
  border-top: 1px solid var(--mm-line, #e5e6eb);
  padding-top: 16px;
}
.share-view__comments h3 {
  font-size: 14px;
  margin: 0 0 8px;
}
.share-view__comment-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}
.share-view__comment-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.share-view__comment-list li {
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.share-view__comment-content {
  font-size: 13px;
}
.share-view__comment-time {
  font-size: 11px;
  color: var(--mm-muted, #86909c);
  margin-top: 4px;
}
.share-view__watermark {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  font-size: 28px;
  color: rgb(0 0 0 / 6%);
  transform: rotate(-20deg);
  white-space: nowrap;
}
</style>
