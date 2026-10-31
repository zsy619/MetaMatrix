import { Mark, mergeAttributes } from '@tiptap/core'

export type BookmarkAttrs = {
  id: string
  label: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attrs: { id?: string; label?: string }) => ReturnType
      unsetBookmark: () => ReturnType
    }
  }
}

function slugId(label: string): string {
  const base = (label || 'bookmark')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '')
    .slice(0, 40)
  return `bm-${base || 'point'}-${Date.now().toString(36).slice(-4)}`
}

/** 书签 / 锚点：可跳转的行内标记 */
export const Bookmark = Mark.create({
  name: 'bookmark',
  inclusive: false,
  excludes: '',
  spanning: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('id') || el.getAttribute('data-bookmark-id') || null,
        renderHTML: (attrs: { id?: string | null }) => {
          if (!attrs.id) return {}
          return { id: attrs.id, 'data-bookmark-id': attrs.id }
        },
      },
      label: {
        default: '',
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-bookmark-label') || el.textContent || '',
        renderHTML: (attrs: { label?: string }) => {
          if (!attrs.label) return {}
          return { 'data-bookmark-label': attrs.label, title: `书签：${attrs.label}` }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-bookmark-id]' },
      { tag: 'a[data-bookmark-id]' },
      {
        tag: 'span.rte-bookmark',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'rte-bookmark',
        'data-type': 'bookmark',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setBookmark:
        (attrs = {}) =>
        ({ commands, state }) => {
          const selected = state.doc.textBetween(
            state.selection.from,
            state.selection.to,
            ' ',
          )
          const label = (attrs.label || selected || '书签').trim().slice(0, 40)
          const id = attrs.id || slugId(label)
          return commands.setMark(this.name, { id, label })
        },
      unsetBookmark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
