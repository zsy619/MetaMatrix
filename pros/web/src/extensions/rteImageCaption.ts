import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'

/** 把图片题注画在图片正下方。题注存在属性里，不进图片节点的 DOM。 */
export function imageCaptionDecorations(doc: PmNode): DecorationSet {
  const widgets: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return
    const text = String(node.attrs.caption || '').trim()
    if (!text) return
    widgets.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          const el = document.createElement('div')
          el.className = 'rte-image-caption'
          el.setAttribute('contenteditable', 'false')
          el.textContent = text
          return el
        },
        { side: -1, ignoreSelection: true, key: `${pos}:${text}` },
      ),
    )
  })
  return DecorationSet.create(doc, widgets)
}

export function createImageCaptionPlugin(): Plugin {
  return new Plugin({
    state: {
      init(_config, state) {
        return imageCaptionDecorations(state.doc)
      },
      apply(tr, old) {
        if (!tr.docChanged) return old.map(tr.mapping, tr.doc)
        return imageCaptionDecorations(tr.doc)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}
