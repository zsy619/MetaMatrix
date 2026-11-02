import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import {
  applyHeadingFoldToggle,
  buildFoldDecorations,
  expandFoldsCovering,
  headingFoldSpans,
} from '../utils/rteHeadingFold'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingFold: {
      toggleHeadingFold: (headingPos: number) => ReturnType
    }
  }
}

function headingPosAt(doc: import('@tiptap/pm/model').Node, pos: number): number | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'heading') return $pos.before(depth)
  }
  return null
}

/** 标题左侧箭头：折起该标题下、直到下一个同级或更高级标题之前的正文。 */
export const HeadingFold = Extension.create({
  name: 'headingFold',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          collapsed: {
            default: false,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-collapsed') === 'true',
            renderHTML: (attrs: { collapsed?: boolean }) =>
              attrs.collapsed ? { 'data-collapsed': 'true' } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      toggleHeadingFold:
        (headingPos) =>
        ({ tr, dispatch }) => {
          const ok = applyHeadingFoldToggle(tr, headingPos)
          if (ok && dispatch) dispatch(tr)
          return ok
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (transactions.some((tr) => tr.getMeta('headingFold'))) return null
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null
          const { from, to } = state.selection
          const tr = state.tr
          return expandFoldsCovering(tr, from, to) ? tr : null
        },
        props: {
          decorations(state) {
            return buildFoldDecorations(state.doc)
          },
          handleKeyDown(view, event) {
            const sel = view.state.selection
            if (!sel.empty) return false
            const spans = headingFoldSpans(view.state.doc)
            if (!spans.length) return false
            const $pos = sel.$from
            if (event.key === 'ArrowDown' && $pos.parent.type.name === 'heading') {
              const headingPos = headingPosAt(view.state.doc, sel.from)
              const span = spans.find((item) => item.headingPos === headingPos)
              if (!span || $pos.parentOffset !== $pos.parent.content.size) return false
              if (span.to >= view.state.doc.content.size) return false
              const next = TextSelection.near(view.state.doc.resolve(span.to))
              view.dispatch(view.state.tr.setSelection(next).scrollIntoView())
              event.preventDefault()
              return true
            }
            if ((event.key === 'ArrowUp' || event.key === 'Backspace') && $pos.parentOffset === 0) {
              const span = spans.find((item) => sel.from === item.to || sel.from === item.to + 1)
              if (!span) return false
              if (event.key === 'ArrowUp') {
                const near = Math.min(span.headingPos + 1, view.state.doc.content.size)
                view.dispatch(
                  view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(near))).scrollIntoView(),
                )
              } else {
                const node = view.state.doc.nodeAt(span.headingPos)
                if (!node) return false
                const tr = view.state.tr.setNodeMarkup(span.headingPos, undefined, {
                  ...node.attrs,
                  collapsed: false,
                })
                tr.setMeta('headingFold', true)
                view.dispatch(tr)
              }
              event.preventDefault()
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
