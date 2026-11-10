<script setup lang="ts">
import {
  authorColor,
  formatThreadTime,
  type CommentAuthor,
  type CommentThread,
} from '../../utils/rteCommentThreads'
import type { CommentDraft } from './composables/useCommentThreads'

defineProps<{
  threads: CommentThread[]
  orphanIds?: string[]
  unresolvedCount: number
  showResolved: boolean
  draft: CommentDraft | null
  replyDrafts: Record<string, string>
  activeThreadId: string
  author: CommentAuthor
  editable: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:showResolved': [value: boolean]
  'update:draftBody': [value: string]
  'update:reply': [threadId: string, value: string]
  cancelDraft: []
  submitDraft: []
  submitReply: [threadId: string]
  toggleResolved: [thread: CommentThread]
  removeMessage: [threadId: string, messageId: string]
  jump: [threadId: string]
}>()
</script>

<template>
  <aside class="rte-outline-panel rte-comment-panel" aria-label="评论">
    <div class="rte-outline-head">
      <span class="rte-outline-title">评论</span>
      <span class="rte-comment-count">{{ unresolvedCount }} 条未解决</span>
      <button type="button" class="rte-outline-close" aria-label="关闭评论" @click="emit('close')">×</button>
    </div>
    <label class="rte-comment-resolved-toggle">
      <input
        type="checkbox"
        :checked="showResolved"
        @change="emit('update:showResolved', ($event.target as HTMLInputElement).checked)"
      />
      显示已解决
    </label>
    <div v-if="draft" class="rte-comment-draft">
      <p class="rte-comment-quote">{{ draft.quote }}</p>
      <textarea
        :value="draft.body"
        class="rte-comment-input"
        maxlength="2000"
        rows="3"
        placeholder="写下评论"
        aria-label="评论内容"
        @input="emit('update:draftBody', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="rte-comment-actions">
        <button type="button" class="rte-comment-btn" @click="emit('cancelDraft')">取消</button>
        <button type="button" class="rte-comment-btn is-primary" @click="emit('submitDraft')">发送</button>
      </div>
    </div>
    <p v-if="!threads.length" class="rte-outline-empty">还没有评论。选中文字后点「评论」，讨论会留在这条画布里。</p>
    <div v-else class="rte-outline-list rte-comment-list">
      <article
        v-for="thread in threads"
        :key="thread.id"
        class="rte-comment-card"
        :class="{ 'is-active': thread.id === activeThreadId, 'is-resolved': thread.resolved }"
      >
        <button type="button" class="rte-comment-quote is-jump" @click="emit('jump', thread.id)">
          <span v-if="orphanIds?.includes(thread.id)">失锚 · </span>{{ thread.quote || '原文已不在' }}
        </button>
        <ul class="rte-comment-messages">
          <li v-for="message in thread.messages" :key="message.id">
            <div class="rte-comment-meta">
              <span class="rte-comment-dot" :style="{ background: authorColor(message.authorId) }" />
              <span class="rte-comment-name">{{ message.authorName }}</span>
              <time>{{ formatThreadTime(message.createdAt) }}</time>
              <button
                v-if="editable && message.authorId === author.id"
                type="button"
                class="rte-comment-link"
                @click="emit('removeMessage', thread.id, message.id)"
              >
                删除
              </button>
            </div>
            <p class="rte-comment-body">{{ message.body }}</p>
          </li>
        </ul>
        <div v-if="editable" class="rte-comment-actions">
          <button type="button" class="rte-comment-btn" @click="emit('toggleResolved', thread)">
            {{ thread.resolved ? '重新打开' : '解决' }}
          </button>
        </div>
        <div v-if="editable && !thread.resolved" class="rte-comment-reply">
          <textarea
            :value="replyDrafts[thread.id] || ''"
            class="rte-comment-input"
            maxlength="2000"
            rows="2"
            placeholder="回复"
            :aria-label="'回复 ' + (thread.quote || '评论')"
            @input="emit('update:reply', thread.id, ($event.target as HTMLTextAreaElement).value)"
          />
          <button type="button" class="rte-comment-btn is-primary" @click="emit('submitReply', thread.id)">回复</button>
        </div>
      </article>
    </div>
  </aside>
</template>

<style scoped>
.rte-comment-panel {
  flex: 0 0 280px;
  width: 280px;
  min-width: 220px;
  max-width: 320px;
  border-left: 1px solid #eef0f3;
  background: #fafbfc;
  display: flex;
  flex-direction: column;
  min-height: 0;
  z-index: 15;
}
.rte-outline-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #eef0f3;
}
.rte-outline-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
}
.rte-outline-close {
  border: none;
  background: transparent;
  color: #86909c;
  font-size: 16px;
  cursor: pointer;
}
.rte-outline-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.5;
}
.rte-outline-list {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}
.rte-comment-count {
  margin-left: auto;
  margin-right: 6px;
  font-size: 11px;
  color: #86909c;
}
.rte-comment-resolved-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 0;
  font-size: 12px;
  color: #4e5969;
}
.rte-comment-draft,
.rte-comment-card {
  margin: 8px 10px;
  padding: 8px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
}
.rte-comment-card.is-active {
  border-color: #94bfff;
}
.rte-comment-card.is-resolved {
  opacity: 0.72;
}
.rte-comment-quote {
  margin: 0 0 8px;
  padding: 4px 8px;
  border-left: 3px solid #165dff;
  background: #f7f8fa;
  color: #4e5969;
  font-size: 12px;
  line-height: 1.45;
}
button.rte-comment-quote {
  display: block;
  width: 100%;
  border: none;
  text-align: left;
  cursor: pointer;
}
.rte-comment-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  resize: vertical;
}
.rte-comment-actions,
.rte-comment-reply {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}
.rte-comment-btn {
  border: 1px solid #e5e6eb;
  background: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.rte-comment-btn.is-primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}
.rte-comment-messages {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rte-comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #86909c;
}
.rte-comment-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.rte-comment-name {
  color: #1d2129;
  font-weight: 600;
}
.rte-comment-link {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #86909c;
  cursor: pointer;
  font-size: 11px;
}
.rte-comment-body {
  margin: 2px 0 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #1d2129;
  white-space: pre-wrap;
}
.rte-comment-list {
  padding-bottom: 12px;
}
</style>
