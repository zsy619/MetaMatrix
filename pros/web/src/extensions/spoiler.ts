import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { spoilerRangeAt } from '../utils/rteTextPlay'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoiler: {
      toggleSpoiler: () => ReturnType
    }
  }
}

/** 揭晓文字：默认藏住，悬停可偷看，点击后保持打开。 */
export const Spoiler = Mark.create({
  name: 'spoiler',
  excludes: '',

  addAttributes() {
    return {
      revealed: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-revealed') === '1',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-revealed]' }, { tag: 'span.rte-spoiler' }]
  },

  renderHTML({ HTMLAttributes, mark }) {
    const revealed = !!mark.attrs.revealed
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-revealed': revealed ? '1' : '0',
        class: revealed ? 'rte-spoiler is-revealed' : 'rte-spoiler',
        title: revealed ? '再次点击藏起' : '点击揭晓',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target
              if (!(target instanceof Element) || !target.closest('.rte-spoiler')) return false
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!coords) return false
              const range = spoilerRangeAt(view.state.doc, coords.pos)
              const type = view.state.schema.marks.spoiler
              if (!range || !type) return false
              const tr = view.state.tr
              tr.removeMark(range.from, range.to, type)
              tr.addMark(range.from, range.to, type.create({ revealed: !range.revealed }))
              view.dispatch(tr)
              event.preventDefault()
              return true
            },
          },
        },
      }),
    ]
  },
})
