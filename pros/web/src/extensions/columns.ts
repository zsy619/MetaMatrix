import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      setColumns: (cols: 2 | 3) => ReturnType
    }
  }
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'rte-column',
      }),
      0,
    ]
  },
})

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: (el: HTMLElement) => {
          const n = parseInt(el.getAttribute('data-cols') || '2', 10)
          return n === 3 ? 3 : 2
        },
        renderHTML: (attrs: { cols?: number }) => ({
          'data-cols': String(attrs.cols === 3 ? 3 : 2),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const cols = node.attrs.cols === 3 ? 3 : 2
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        'data-cols': String(cols),
        class: `rte-columns rte-columns-${cols}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setColumns:
        (cols: 2 | 3) =>
        ({ commands }) => {
          const emptyPara = { type: 'paragraph' }
          const columnNodes = Array.from({ length: cols }, () => ({
            type: 'column',
            content: [emptyPara],
          }))
          return commands.insertContent({
            type: this.name,
            attrs: { cols },
            content: columnNodes,
          })
        },
    }
  },
})
