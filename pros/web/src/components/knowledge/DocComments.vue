<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as knowledgeApi from '../../api/knowledge'
import * as knowledgeApiV5 from '../../api/knowledge_v5'
import type { DocComment } from '../../api/knowledge'
import { listDirectoryUsers } from '../../api/directory'
import type { DirectoryUser } from '../../api/directory'

const props = defineProps<{
  documentId: string
  quote?: string
  /** 划线区间（正文字符偏移）：-1 表示整篇评论。 */
  anchorFrom?: number
  anchorTo?: number
}>()

const comments = ref<DocComment[]>([])
const loading = ref(false)
const draft = ref('')
const emit = defineEmits<{ quoted: [] }>()

/** 筛选：全部 / 未解决 / 未读。 */
const filter = ref<'all' | 'open' | 'unread'>('all')
/** @ 成员。 */
const users = ref<DirectoryUser[]>([])
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionPicked = ref<DirectoryUser[]>([])

const REACTIONS = ['👍', '🎉', '👀', '❤️', '😄']

const mentionCandidates = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase()
  if (!q) return users.value.slice(0, 8)
  return users.value
    .filter((u) => u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    .slice(0, 8)
})

const visible = computed(() => {
  if (filter.value === 'open') return comments.value.filter((c) => !c.resolved)
  if (filter.value === 'unread') return comments.value.filter((c) => c.unread)
  return comments.value
})

const unreadCount = computed(() => comments.value.filter((c) => c.unread).length)

async function load() {
  loading.value = true
  try {
    comments.value = await knowledgeApiV5.listCommentsFiltered(props.documentId)
  } catch {
    comments.value = []
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  try {
    users.value = await listDirectoryUsers({ limit: 50 })
  } catch {
    users.value = []
  }
}

function pickMention(user: DirectoryUser) {
  if (!mentionPicked.value.some((u) => u.id === user.id)) mentionPicked.value.push(user)
  mentionQuery.value = ''
  mentionOpen.value = false
}

function mentionLabel(userId: string) {
  const user = users.value.find((u) => u.id === userId)
  return user ? user.name : userId
}

async function submit() {
  const content = draft.value.trim()
  if (!content) return
  try {
    // 划线评论：带上区间锚点与 @ 成员。
    await knowledgeApi.addComment(props.documentId, {
      content,
      quote: props.quote ?? '',
      anchorFrom: props.anchorFrom ?? -1,
      anchorTo: props.anchorTo ?? -1,
      mentions: mentionPicked.value.map((u) => u.id),
    })
    draft.value = ''
    mentionPicked.value = []
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

async function react(comment: DocComment, emoji: string) {
  await knowledgeApiV5.toggleCommentReaction(props.documentId, comment.id, emoji)
  await load()
}

async function remove(comment: DocComment) {
  await knowledgeApi.deleteComment(props.documentId, comment.id)
  await load()
}

async function markAllRead() {
  await knowledgeApiV5.markCommentsRead(props.documentId)
  await load()
}

watch(
  () => props.documentId,
  () => {
    void load()
    void loadUsers()
  },
)
onMounted(() => {
  void load()
  void loadUsers()
})
</script>

<template>
  <section class="doc-comments">
    <div class="doc-comments__head">
      <span class="doc-comments__title">
        评论
        <el-badge v-if="unreadCount" :value="unreadCount" class="doc-comments__badge" />
      </span>
      <el-radio-group v-model="filter" size="small">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="open">未解决</el-radio-button>
        <el-radio-button label="unread">未读</el-radio-button>
      </el-radio-group>
    </div>
    <p v-if="quote" class="doc-comments__selected">引用：{{ quote }}</p>
    <div class="doc-comments__editor">
      <div class="doc-comments__mention">
        <el-tag
          v-for="user in mentionPicked"
          :key="user.id"
          size="small"
          closable
          @close="mentionPicked = mentionPicked.filter((u) => u.id !== user.id)"
        >
          @{{ user.name }}
        </el-tag>
        <el-input
          v-model="mentionQuery"
          size="small"
          placeholder="输入 @ 选择成员"
          style="width: 160px"
          @focus="mentionOpen = true"
          @input="mentionOpen = true"
        />
        <div v-if="mentionOpen && mentionCandidates.length" class="doc-comments__candidates">
          <button
            v-for="user in mentionCandidates"
            :key="user.id"
            type="button"
            class="doc-comments__candidate"
            @click="pickMention(user)"
          >
            {{ user.name }}
            <span v-if="user.department">{{ user.department }}</span>
          </button>
        </div>
      </div>
      <el-input
        v-model="draft"
        size="small"
        type="textarea"
        :rows="2"
        placeholder="写一条评论…"
        maxlength="2000"
        show-word-limit
      />
      <div class="doc-comments__actions">
        <el-button size="small" text @click="markAllRead">全部标记已读</el-button>
        <el-button size="small" type="primary" @click="submit">评论</el-button>
      </div>
    </div>
    <p v-if="loading" class="doc-comments__empty">加载中…</p>
    <p v-else-if="!visible.length" class="doc-comments__empty">还没有评论。</p>
    <ul v-else class="doc-comments__list">
      <li
        v-for="comment in visible"
        :key="comment.id"
        class="doc-comments__item"
        :class="{ 'is-unread': comment.unread }"
      >
        <p v-if="comment.quote" class="doc-comments__quote">“{{ comment.quote }}”</p>
        <p class="doc-comments__body">
          <el-tag
            v-for="id in (comment.mentions || '').split(',').filter(Boolean)"
            :key="id"
            size="small"
            type="info"
            class="doc-comments__mention-tag"
          >
            @{{ mentionLabel(id) }}
          </el-tag>
          {{ comment.content }}
        </p>
        <div class="doc-comments__reactions">
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            type="button"
            class="doc-comments__reaction"
            :class="{ 'is-active': (comment.reactions || {})[emoji]?.length }"
            @click="react(comment, emoji)"
          >
            {{ emoji }}
            <span v-if="(comment.reactions || {})[emoji]?.length">
              {{ comment.reactions[emoji].length }}
            </span>
          </button>
        </div>
        <div class="doc-comments__meta">
          <span>{{ new Date(comment.createdAt).toLocaleString() }}</span>
          <el-tag v-if="comment.unread" size="small" type="warning">未读</el-tag>
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
.doc-comments__title { font-size: 12px; font-weight: 600; color: var(--mm-muted, #86909c); display: inline-flex; align-items: center; gap: 6px; }
.doc-comments__editor { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.doc-comments__actions { display: flex; gap: 8px; align-items: center; }
.doc-comments__mention { position: relative; display: flex; gap: 4px; flex-wrap: wrap; align-items: center; width: 100%; }
.doc-comments__candidates {
  position: absolute; top: 100%; left: 0; z-index: 20; margin-top: 4px;
  background: var(--mm-bg, #fff); border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); min-width: 200px; overflow: hidden;
}
.doc-comments__candidate {
  display: flex; width: 100%; gap: 8px; padding: 6px 10px; border: 0; background: transparent;
  cursor: pointer; font-size: 12px; color: var(--mm-text, #1d2129); text-align: left;
}
.doc-comments__candidate:hover { background: var(--mm-hover, #f2f3f5); }
.doc-comments__candidate span { color: var(--mm-muted, #86909c); font-size: 11px; }
.doc-comments__list { list-style: none; margin: 0; padding: 0; }
.doc-comments__item { padding: 8px 0; border-bottom: 1px solid var(--mm-line, #f2f3f5); }
.doc-comments__item.is-unread { background: #fff8e8; border-radius: 6px; padding-left: 8px; padding-right: 8px; }
.doc-comments__quote {
  margin: 0 0 4px; padding: 4px 8px; font-size: 12px;
  background: var(--mm-hover, #f2f3f5); border-radius: 4px; color: var(--mm-muted, #86909c);
}
.doc-comments__body { margin: 0; font-size: 13px; color: var(--mm-text, #1d2129); white-space: pre-wrap; }
.doc-comments__mention-tag { margin-right: 4px; }
.doc-comments__reactions { display: flex; gap: 4px; margin-top: 4px; }
.doc-comments__reaction {
  border: 1px solid var(--mm-line, #e5e6eb); background: transparent; border-radius: 12px;
  padding: 0 6px; font-size: 12px; cursor: pointer; line-height: 20px;
}
.doc-comments__reaction.is-active { border-color: var(--mm-blue, #1677ff); background: #eaf2ff; }
.doc-comments__meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; color: var(--mm-muted, #86909c); }
.doc-comments__selected {
  margin: 0; padding: 4px 8px; font-size: 12px;
  background: #fff7e8; border-radius: 4px; color: #d25f00;
}
.doc-comments__empty { font-size: 12px; color: var(--mm-muted, #86909c); margin: 0; }
</style>
