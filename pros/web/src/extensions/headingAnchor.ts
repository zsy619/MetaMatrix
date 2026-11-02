import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { missingHeadingAnchors, parseHeadingAnchorHref, findHeadingAnchor } from '../utils/rteHeadingAnchor'

const headingFlashKey = new PluginKey<string | null>('headingAnchorFlash')

export type HeadingAnchorOptions = {
  onMissing?: (id: string) => void
}

function assignMissing(tr: import('@tiptap/pm/state').Transaction) {
  const missing = missingHeadingAnchors(tr.doc)
  if (!missing.length) return false
  for (const item of missing) {
    const node = tr.doc.nodeAt(item.pos)
    if (!node || node.type.name !== 'heading') continue
    tr.setNodeMarkup(item.pos, undefined, { ...node.attrs, id: item.id })
  }
  tr.setMeta('headingAnchor', true)
  return true
}

/** 给没有 id 的标题补稳定锚点，并让文内 #锚点 链接触发跳转。 */
export const HeadingAnchor = Extension.create<HeadingAnchorOptions>({
  name: 'headingAnchor',

  addOptions() {
    return { onMissing: undefined }
  },

  onCreate() {
    const editor = this.editor
    const apply = () => {
      if (editor.isDestroyed) return
      const tr = editor.state.tr
      if (!assignMissing(tr)) return
      editor.view.dispatch(tr)
    }
    try {
      apply()
    } catch {
      queueMicrotask(() => {
        try {
          apply()
        } catch {
          /* 视图还没挂上时跳过，下次正文变更仍会补 id */
        }
      })
    }
  },

  addProseMirrorPlugins() {
    const onMissing = this.options.onMissing
    return [
      new Plugin<string | null>({
        key: headingFlashKey,
        state: {
          init(): string | null {
            return null
          },
          apply(tr, prev): string | null {
            const meta = tr.getMeta(headingFlashKey)
            if (meta === null) return null
            if (typeof meta === 'string') return meta
            return prev
          },
        },
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged && !tr.getMeta('headingAnchor'))) return null
          const tr = state.tr
          return assignMissing(tr) ? tr : null
        },
        props: {
          decorations(state) {
            const id = headingFlashKey.getState(state)
            if (!id) return null
            const pos = findHeadingAnchor(state.doc, id)
            if (pos == null) return null
            const node = state.doc.nodeAt(pos)
            if (!node) return null
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, { class: 'rte-bookmark-flash' }),
            ])
          },
          handleClick(view, _pos, event) {
            const target = event.target
            if (!(target instanceof Element)) return false
            const link = target.closest('a')
            if (!link || !view.dom.contains(link)) return false
            const hrefAttr = link.getAttribute('href') || ''
            const id = parseHeadingAnchorHref(hrefAttr, window.location.href)
            if (!id) return false
            event.preventDefault()
            const headingPos = findHeadingAnchor(view.state.doc, id)
            if (headingPos == null) {
              onMissing?.(id)
              return true
            }
            const near = Math.min(headingPos + 1, view.state.doc.content.size)
            const selection = TextSelection.near(view.state.doc.resolve(near))
            const tr = view.state.tr.setSelection(selection).scrollIntoView()
            tr.setMeta(headingFlashKey, id)
            view.dispatch(tr)
            window.setTimeout(() => {
              if (view.isDestroyed || headingFlashKey.getState(view.state) !== id) return
              const clear = view.state.tr.setMeta(headingFlashKey, null)
              clear.setMeta('addToHistory', false)
              view.dispatch(clear)
            }, 1200)
            return true
          },
        },
      }),
    ]
  },
})
