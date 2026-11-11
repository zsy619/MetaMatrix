import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** 标题文字自己已经带了「1.」或「1.2」时，不再叠一层自动编号。 */
export function headingHasManualNumber(text: string): boolean {
  return /^(\d+(?:\.\d+)*)(?:[.、]\s*|\s+)/.test(text.trim())
}

export const HeadingManualNum = Extension.create({
  name: 'headingManualNum',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const marks: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return
              if (!headingHasManualNumber(node.textContent)) return
              marks.push(Decoration.node(pos, pos + node.nodeSize, { 'data-manual-num': '1' }))
            })
            return DecorationSet.create(state.doc, marks)
          },
        },
      }),
    ]
  },
})
