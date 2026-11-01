import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docTitle: {
      insertDocTitle: (text: string) => ReturnType
    }
  }
}

/** 正文内的轻量标题块，不占用画布面板标题。 */
export const DocTitle = Node.create({
  name: 'docTitle',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      text: {
        default: '未命名',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-text') || el.textContent || '未命名',
        renderHTML: (attrs: { text?: string }) => ({ 'data-text': attrs.text || '未命名' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'h1[data-type="doc-title"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const text = String(node.attrs.text || '未命名')
    return [
      'h1',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'doc-title',
        class: 'rte-doc-title',
      }),
      text,
    ]
  },

  addCommands() {
    return {
      insertDocTitle:
        (text: string) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { text: text.trim() || '未命名' },
            })
            .run(),
    }
  },
})
