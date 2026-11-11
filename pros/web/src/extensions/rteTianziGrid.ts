import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const tianziCharKey = new PluginKey<DecorationSet>('tianziChars')

const TEXT_PARENTS = new Set(['paragraph', 'heading'])

/** 每个字包一层，和拼音田字格的一格对齐。注音写在 data-ruby 上。 */
export function buildTianziDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (!TEXT_PARENTS.has(doc.resolve(pos).parent.type.name)) return
    const ruby = node.marks.find((mark) => mark.type.name === 'ruby')
    const annotation = String(ruby?.attrs?.annotation || '').trim()
    let offset = 0
    for (const ch of node.text) {
      const from = pos + offset
      const to = from + ch.length
      offset += ch.length
      const attrs: Record<string, string> = { class: 'rte-tianzi-char' }
      if (annotation) attrs['data-ruby'] = annotation
      decos.push(Decoration.inline(from, to, attrs))
    }
  })
  return DecorationSet.create(doc, decos)
}

export const TianziGrid = Extension.create({
  name: 'tianziGrid',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tianziCharKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, old, _prev, state) {
            const meta = tr.getMeta(tianziCharKey)
            if (meta === false) return DecorationSet.empty
            if (meta === true || (tr.docChanged && old.find().length > 0)) return buildTianziDecorations(state.doc)
            return old
          },
        },
        props: {
          decorations(state) {
            return tianziCharKey.getState(state)
          },
        },
      }),
    ]
  },
})
