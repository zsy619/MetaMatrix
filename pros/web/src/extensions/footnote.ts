import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      setFootnote: (attrs: { text: string; id?: string }) => ReturnType
      unsetFootnote: () => ReturnType
    }
  }
}

function fnId(): string {
  return `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 轻量脚注：上标标记，文末面板汇总 */
export const Footnote = Mark.create({
  name: 'footnote',
  excludes: '',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fn-id'),
        renderHTML: (attrs: { id?: string | null }) =>
          attrs.id ? { 'data-fn-id': attrs.id, id: `ref-${attrs.id}` } : {},
      },
      text: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fn-text') || el.getAttribute('title') || '',
        renderHTML: (attrs: { text?: string }) =>
          attrs.text
            ? { 'data-fn-text': attrs.text, title: attrs.text }
            : {},
      },
      n: {
        default: 1,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-fn-n') || 1) || 1,
        renderHTML: (attrs: { n?: number }) => ({ 'data-fn-n': String(attrs.n || 1) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-fn-id]' }, { tag: 'span[data-fn-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'rte-footnote', 'data-type': 'footnote' }),
      0,
    ]
  },

  addCommands() {
    return {
      setFootnote:
        (attrs) =>
        ({ commands, state }) => {
          const text = (attrs.text || '').trim()
          if (!text) return false
          const id = attrs.id || fnId()
          // n 由宿主重编号；此处先写 1
          if (state.selection.empty) {
            return commands.insertContent({
              type: 'text',
              text: ' ',
              marks: [{ type: this.name, attrs: { id, text, n: 1 } }],
            })
          }
          return commands.setMark(this.name, { id, text, n: 1 })
        },
      unsetFootnote:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
