import { Node, mergeAttributes } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toc: {
      insertToc: () => ReturnType
    }
  }
}
import { Plugin } from '@tiptap/pm/state'
import {
  outlineFromPmDoc,
  sameOutline,
  selectOutlineHeading,
  type OutlineHeading,
} from '../utils/rteOutline'

function parseItems(raw: unknown): OutlineHeading[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.text === 'string') as OutlineHeading[]
  } catch {
    return []
  }
}

/** 目录。标题一变，这里的条目跟着变；点击条目跳到对应标题。 */
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
    const items = parseItems(node.attrs.items)
    return [
      'nav',
      mergeAttributes({ 'data-type': 'toc', class: 'rte-toc', 'aria-label': '目录' }),
      ['div', { class: 'rte-toc-title' }, '目录'],
      ...items.map((item) => [
        'div',
        {
          class: `rte-toc-item is-h${item.level || 1}`,
          role: 'link',
          tabindex: '0',
          'data-outline-level': String(item.level || 1),
          'data-outline-text': item.text || '',
          ...(item.blockId ? { 'data-block-id': item.blockId } : {}),
        },
        item.text || '',
      ]),
    ]
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ commands, state }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: { items: JSON.stringify(outlineFromPmDoc(state.doc)) },
          }),
    } as never
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const el = (event.target as HTMLElement | null)?.closest?.('.rte-toc-item') as HTMLElement | null
              if (!el || !view.dom.contains(el)) return false
              event.preventDefault()
              const heading: OutlineHeading = {
                level: Number(el.getAttribute('data-outline-level')) || 1,
                text: el.getAttribute('data-outline-text') || el.textContent?.trim() || '',
                blockId: el.getAttribute('data-block-id') || undefined,
              }
              return selectOutlineHeading(editor, heading)
            },
          },
        },
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          if (transactions.some((tr) => tr.getMeta('tocSync'))) return null
          const items = outlineFromPmDoc(state.doc)
          let tr = state.tr
          const positions: number[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'toc') positions.push(pos)
          })
          for (let index = positions.length - 1; index >= 0; index -= 1) {
            const pos = positions[index]!
            const node = tr.doc.nodeAt(pos)
            if (!node || node.type.name !== 'toc') continue
            const current = parseItems(node.attrs.items)
            if (sameOutline(current, items)) continue
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
