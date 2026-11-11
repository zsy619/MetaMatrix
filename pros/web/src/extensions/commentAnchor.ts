import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentAnchor: {
      setCommentAnchor: (threadId: string) => ReturnType
      unsetCommentAnchor: (threadId?: string) => ReturnType
    }
  }
}

/** 评论锚点。讨论内容在画布 JSON，这里只记住线程 id。 */
export const CommentAnchor = Mark.create({
  name: 'commentAnchor',

  inclusive: false,

  addAttributes() {
    return {
      resolved: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-resolved') === 'true',
        renderHTML: (attributes: { resolved?: boolean }) =>
          attributes.resolved ? { 'data-resolved': 'true' } : {},
      },
      threadId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-thread') || '',
        renderHTML: (attributes: { threadId?: string }) => {
          const id = attributes.threadId || ''
          if (!id) return {}
          return { 'data-comment-thread': id }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-thread]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'rte-comment-anchor',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCommentAnchor:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      unsetCommentAnchor:
        (threadId?: string) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks.commentAnchor
          if (!type) return false
          if (!threadId) {
            tr.removeMark(0, state.doc.content.size, type)
            if (dispatch) dispatch(tr)
            return true
          }
          let touched = false
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            const mark = node.marks.find(
              (item) => item.type === type && item.attrs.threadId === threadId,
            )
            if (!mark) return
            touched = true
            tr.removeMark(pos, pos + node.nodeSize, mark)
          })
          if (touched && dispatch) dispatch(tr)
          return touched
        },
    }
  },
})

export default CommentAnchor
