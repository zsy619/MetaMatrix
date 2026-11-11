import { computed, ref, type ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Editor } from '@tiptap/core'
import {
  createCommentThread,
  deleteOwnMessage,
  readCommentThreads,
  replyToThread,
  setThreadResolved,
  visibleThreads,
  type CommentAuthor,
  type CommentThread,
  type CommentThreadsByPanelId,
} from '../../../utils/rteCommentThreads'

export type CommentDraft = {
  from: number
  to: number
  quote: string
  body: string
}

/** 选区评论：线程在画布 JSON，锚点留在正文。 */
export function useCommentThreads(deps: {
  editor: () => ShallowRef<Editor | undefined>
  panelId: () => string
  getMap: () => CommentThreadsByPanelId | null | undefined
  setThreads: (panelId: string, threads: CommentThread[]) => void
  author: () => CommentAuthor
  isEditable: () => boolean
}) {
  const commentsOpen = ref(false)
  const showResolved = ref(false)
  const orphansOnly = ref(false)
  const draft = ref<CommentDraft | null>(null)
  const replyDrafts = ref<Record<string, string>>({})
  const activeThreadId = ref('')

  const threads = computed(() => readCommentThreads(deps.getMap(), deps.panelId()))
  const orphanIds = computed(() => {
    const ed = deps.editor().value
    void ed?.state.doc
    return threads.value.filter((thread) => anchorPos(thread.id) == null).map((thread) => thread.id)
  })
  const shownThreads = computed(() => {
    const list = visibleThreads(threads.value, showResolved.value)
    if (!orphansOnly.value) return list
    const lost = new Set(orphanIds.value)
    return list.filter((thread) => lost.has(thread.id))
  })
  const unresolvedCount = computed(() => threads.value.filter((thread) => !thread.resolved).length)

  function persist(next: CommentThread[]) {
    const panelId = deps.panelId()
    if (!panelId) {
      ElMessage.warning('这个编辑器没有面板 id，评论无法写入画布')
      return
    }
    deps.setThreads(panelId, next)
  }

  function anchorPos(threadId: string): number | null {
    const ed = deps.editor().value
    if (!ed) return null
    let found: number | null = null
    ed.state.doc.descendants((node, pos) => {
      if (found != null || !node.isText) return
      if (node.marks.some((mark) => mark.type.name === 'commentAnchor' && mark.attrs.threadId === threadId)) {
        found = pos
        return false
      }
    })
    return found
  }

  function removeAnchor(threadId: string) {
    deps.editor().value?.chain().focus().unsetCommentAnchor(threadId).run()
  }

  function beginComment() {
    const ed = deps.editor().value
    if (!ed || !deps.isEditable()) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) {
      ElMessage.warning('请先选中要评论的文字')
      return
    }
    const quote = ed.state.doc.textBetween(from, to, '\n', '\n').trim()
    if (!quote) {
      ElMessage.warning('请先选中要评论的文字')
      return
    }
    draft.value = { from, to, quote: quote.slice(0, 500), body: '' }
    commentsOpen.value = true
    activeThreadId.value = ''
  }

  function cancelDraft() {
    draft.value = null
  }

  function submitDraft() {
    const pending = draft.value
    const ed = deps.editor().value
    if (!pending || !ed) return
    const author = deps.author()
    const thread = createCommentThread({ quote: pending.quote, author, body: pending.body })
    if (!thread) {
      ElMessage.warning('请填写评论')
      return
    }
    const current = ed.state.doc.textBetween(pending.from, pending.to, '\n', '\n').trim()
    let anchored = false
    if (current === pending.quote) {
      anchored = ed.chain().focus().setTextSelection({ from: pending.from, to: pending.to }).setCommentAnchor(thread.id).run()
    }
    if (!anchored) {
      ElMessage.warning('选区已经变化，请重新选中文字再评论')
      return
    }
    persist([...threads.value, thread])
    draft.value = null
    activeThreadId.value = thread.id
    showResolved.value = false
  }

  function submitReply(threadId: string) {
    const body = replyDrafts.value[threadId] || ''
    const next = replyToThread(threads.value, threadId, deps.author(), body)
    if (!next) {
      ElMessage.warning('请填写回复')
      return
    }
    persist(next)
    replyDrafts.value = { ...replyDrafts.value, [threadId]: '' }
  }

  function toggleResolved(thread: CommentThread) {
    persist(setThreadResolved(threads.value, thread.id, !thread.resolved))
  }

  function removeMessage(threadId: string, messageId: string) {
    const result = deleteOwnMessage(threads.value, threadId, messageId, deps.author().id)
    if (!result) return
    persist(result.threads)
    if (result.removedThread) removeAnchor(threadId)
  }

  function reanchorThread(threadId: string) {
    const ed = deps.editor().value
    if (!ed || !deps.isEditable()) return
    const { from, to, empty } = ed.state.selection
    if (empty || from === to) {
      ElMessage.warning('请先选中要重新钉住的文字')
      return
    }
    const quote = ed.state.doc.textBetween(from, to, '\n', '\n').trim()
    if (!quote) {
      ElMessage.warning('请先选中要重新钉住的文字')
      return
    }
    const thread = threads.value.find((item) => item.id === threadId)
    if (!thread) return
    const anchored = ed.chain().focus().unsetCommentAnchor(threadId).setTextSelection({ from, to }).setCommentAnchor(threadId).run()
    if (!anchored) {
      ElMessage.warning('这段文字钉不住')
      return
    }
    persist(threads.value.map((item) => (item.id === threadId ? { ...item, quote: quote.slice(0, 500) } : item)))
    orphansOnly.value = false
    activeThreadId.value = threadId
    ElMessage.success('已重新钉住')
  }

  function jumpToThread(threadId: string) {
    const ed = deps.editor().value
    activeThreadId.value = threadId
    if (!ed) return
    const pos = anchorPos(threadId)
    if (pos == null) {
      ElMessage.info('原文已经不在，这条评论还留在列表里')
      return
    }
    const target = Math.min(pos + 1, ed.state.doc.content.size)
    ed.chain().focus().setTextSelection(target).run()
    try {
      const dom = ed.view.domAtPos(target).node
      const el = dom instanceof HTMLElement ? dom : dom.parentElement
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    } catch {
      /* 位置失效时只移动光标 */
    }
  }

  return {
    commentsOpen,
    showResolved,
    orphansOnly,
    draft,
    replyDrafts,
    activeThreadId,
    threads,
    orphanIds,
    shownThreads,
    unresolvedCount,
    beginComment,
    cancelDraft,
    submitDraft,
    submitReply,
    toggleResolved,
    removeMessage,
    reanchorThread,
    jumpToThread,
  }
}
