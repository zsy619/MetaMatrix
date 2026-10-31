import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const revisionHighlightKey = new PluginKey('rteRevisionHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    revisionHighlight: {
      captureRevisionBaseline: () => ReturnType
      setRevisionHighlight: (enabled: boolean) => ReturnType
    }
  }
}

function paraMap(doc: {
  descendants: (f: (node: { type: { name: string }; textContent: string }, pos: number) => void) => void
}): Map<number, string> {
  const m = new Map<number, string>()
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      m.set(pos, node.textContent)
    }
  })
  return m
}

export const RevisionHighlight = Extension.create({
  name: 'revisionHighlight',

  addStorage() {
    return {
      enabled: false as boolean,
      baseline: null as Map<number, string> | null,
      baselineTexts: [] as string[],
    }
  },

  addCommands() {
    return {
      captureRevisionBaseline:
        () =>
        ({ editor }) => {
          const texts: string[] = []
          editor.state.doc.descendants((node) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              texts.push(node.textContent)
            }
          })
          ;(this.storage as { baselineTexts: string[] }).baselineTexts = texts
          ;(this.storage as { baseline: Map<number, string> | null }).baseline = paraMap(
            editor.state.doc,
          )
          return true
        },
      setRevisionHighlight:
        (enabled: boolean) =>
        ({ editor }) => {
          const storage = this.storage as {
            enabled: boolean
            baselineTexts: string[]
          }
          storage.enabled = enabled
          if (enabled && !storage.baselineTexts.length) {
            editor.commands.captureRevisionBaseline()
          }
          editor.view.dispatch(editor.state.tr.setMeta(revisionHighlightKey, { tick: Date.now() }))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as {
      enabled: boolean
      baselineTexts: string[]
    }
    return [
      new Plugin({
        key: revisionHighlightKey,
        props: {
          decorations: (state) => {
            // 关闭时返回 null，避免跨 bundle 的 DecorationSet.empty 混入 DecorationGroup
            if (!storage.enabled) return null
            const baseline = storage.baselineTexts
            const current: Array<{ pos: number; size: number; text: string }> = []
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                current.push({ pos, size: node.nodeSize, text: node.textContent })
              }
            })
            const decos: ReturnType<typeof Decoration.node>[] = []
            // 与基线按顺序比对：多出的 / 文本变化的段落高亮
            const max = Math.max(baseline.length, current.length)
            for (let i = 0; i < max; i++) {
              const cur = current[i]
              const base = baseline[i]
              if (!cur) continue
              if (base === undefined) {
                decos.push(
                  Decoration.node(cur.pos, cur.pos + cur.size, { class: 'rte-rev-added' }),
                )
              } else if (base !== cur.text) {
                decos.push(
                  Decoration.node(cur.pos, cur.pos + cur.size, { class: 'rte-rev-changed' }),
                )
              }
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
