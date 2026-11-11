import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

type TocItem = { level: number; text: string }

function headingItems(doc: { descendants: (fn: (node: { type: { name: string }; attrs: { level?: number }; textContent: string }) => void) => void }): TocItem[] {
  const items: TocItem[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (!text) return
    items.push({ level: Number(node.attrs.level) || 1, text: text.slice(0, 80) })
  })
  return items
}

function sameItems(a: TocItem[], b: TocItem[]): boolean {
  return a.length === b.length && a.every((item, index) => item.level === b[index]?.level && item.text === b[index]?.text)
}

/** 目录。标题一变，这里的条目跟着变。 */
export const TocBlock = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      items: {
        default: '[]',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-items') || '[]',
        renderHTML: (attrs: { items?: string }) => ({ 'data-items': attrs.items || '[]' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'nav[data-type="toc"]' }]
  },

  renderHTML({ node }) {
    let items: TocItem[] = []
    try {
      const parsed = JSON.parse(String(node.attrs.items || '[]'))
      if (Array.isArray(parsed)) items = parsed
    } catch {
      items = []
    }
    return [
      'nav',
      mergeAttributes({ 'data-type': 'toc', class: 'rte-toc', 'aria-label': '目录' }),
      ['div', { class: 'rte-toc-title' }, '目录'],
      ...items.map((item) => ['div', { class: `rte-toc-item is-h${item.level || 1}` }, item.text || '']),
    ]
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ commands, state }) =>
          commands.insertContent({
            type: this.name,
            attrs: { items: JSON.stringify(headingItems(state.doc as never)) },
          }),
    } as never
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some((tr) => tr.getMeta('tocSync'))) return null
          const items = headingItems(state.doc as never)
          let tr = state.tr
          const positions: number[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'toc') positions.push(pos)
          })
          for (let index = positions.length - 1; index >= 0; index -= 1) {
            const pos = positions[index]!
            const node = tr.doc.nodeAt(pos)
            if (!node || node.type.name !== 'toc') continue
            let current: TocItem[] = []
            try {
              const parsed = JSON.parse(String(node.attrs.items || '[]'))
              if (Array.isArray(parsed)) current = parsed
            } catch {
              current = []
            }
            if (sameItems(current, items)) continue
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, items: JSON.stringify(items) })
          }
          if (!tr.docChanged) return null
          tr.setMeta('tocSync', true)
          tr.setMeta('addToHistory', false)
          return tr
        },
      }),
    ]
  },
})

export default TocBlock
