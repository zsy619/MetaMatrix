import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { collectSensitiveHits, RTE_SENSITIVE_WORDS } from '../utils/rteSensitiveWords'

export const sensitiveHighlightKey = new PluginKey('rteSensitiveHighlight')

export type SensitiveHighlightOptions = {
  /** 由宿主通过 storage / 命令开关 */
  enabled: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sensitiveHighlight: {
      setSensitiveHighlight: (enabled: boolean) => ReturnType
    }
  }
}

export const SensitiveHighlight = Extension.create<SensitiveHighlightOptions>({
  name: 'sensitiveHighlight',

  addOptions() {
    return { enabled: false }
  },

  addStorage() {
    return { enabled: false as boolean }
  },

  addCommands() {
    return {
      setSensitiveHighlight:
        (enabled: boolean) =>
        ({ editor }) => {
          ;(this.storage as { enabled: boolean }).enabled = enabled
          editor.view.dispatch(editor.state.tr.setMeta(sensitiveHighlightKey, { enabled }))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { enabled: boolean }
    return [
      new Plugin({
        key: sensitiveHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, _oldState, newState) => {
            const meta = tr.getMeta(sensitiveHighlightKey) as { enabled?: boolean } | undefined
            if (meta && typeof meta.enabled === 'boolean') storage.enabled = meta.enabled
            if (!storage.enabled) return DecorationSet.empty
            if (!tr.docChanged && !meta) return old
            const hits = collectSensitiveHits(newState.doc, RTE_SENSITIVE_WORDS)
            return DecorationSet.create(
              newState.doc,
              hits.map((h) =>
                Decoration.inline(h.from, h.to, {
                  class: 'rte-sensitive-hit',
                  title: h.hint,
                }),
              ),
            )
          },
        },
        props: {
          decorations(state) {
            // 必须返回 DecorationSet 或 null/空；undefined 会让 DecorationGroup.localsInner 崩。
            // 关闭时返回 null，避免与 EditorView 另一份 prosemirror-view 的 empty 常量混装。
            if (!storage.enabled) return null
            return this.getState(state) || null
          },
        },
      }),
    ]
  },
})
