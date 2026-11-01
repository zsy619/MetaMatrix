/**
 * TipTap @提及：基于 @tiptap/extension-mention + @tiptap/suggestion。
 * UI 由宿主 Vue 渲染（与 Slash「/」同一套定位/键盘模式）。
 *
 * 候选来源见 ../components/rteMentionItems.ts（本地占位列表，可换 API）。
 */
import Mention from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion'
import {
  mergeMentionCandidates,
  type RteMentionItem,
} from '../components/rteMentionItems'
import { collectCrossRefTargets } from './crossRef'

export const mentionPluginKey = new PluginKey('rteMentionSuggestion')

export type RteMentionRenderProps = SuggestionProps<RteMentionItem, RteMentionItem>

export type RteMentionUiHandlers = {
  onStart: (props: RteMentionRenderProps) => void
  onUpdate: (props: RteMentionRenderProps) => void
  onExit: () => void
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

export type RteMentionOptions = {
  ui: RteMentionUiHandlers
}

/**
 * 创建已配置 UI 桥接的 Mention 扩展。
 * 注意：ui 对象引用可变，宿主可在 setup 后期替换方法而不重建扩展。
 */
export function createRteMention(options: RteMentionOptions) {
  const ui = options.ui
  return Mention.configure({
    HTMLAttributes: {
      class: 'rte-mention',
      'data-type': 'mention',
    },
    deleteTriggerWithBackspace: true,
    renderText({ node, options: opts }) {
      const char = opts.suggestion?.char ?? '@'
      return `${char}${node.attrs.label ?? node.attrs.id}`
    },
    suggestion: {
      pluginKey: mentionPluginKey,
      char: '@',
      allowSpaces: false,
      allowedPrefixes: [' ', '\u00A0', '(', '（', '「', '『', '【', '\n', '、', '，', ',', '：', ':'],
      decorationClass: 'rte-mention-decoration',
      allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from)
        for (let d = $from.depth; d > 0; d -= 1) {
          const name = $from.node(d).type.name
          if (name === 'codeBlock' || name === 'code') return false
        }
        return true
      },
      items: ({ query, editor }) => {
        const blocks = collectCrossRefTargets(editor).map((target) => ({
          id: target.id,
          label: target.label,
          kind: target.kind,
        }))
        return mergeMentionCandidates(query, blocks, 12)
      },
      command: ({ editor, range, props }) => {
        const item = props as RteMentionItem
        if (item.kind === 'block' && item.blockKind && item.targetId) {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'crossRef',
                attrs: {
                  kind: item.blockKind,
                  targetId: item.targetId,
                  label: item.blockKind === 'heading' ? `§ ${item.label}` : item.label,
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
          return
        }
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'mention',
              attrs: {
                id: item.id,
                label: item.label,
              },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: () => ({
        onStart: (props) => ui.onStart(props as RteMentionRenderProps),
        onUpdate: (props) => ui.onUpdate(props as RteMentionRenderProps),
        onKeyDown: (props) => ui.onKeyDown(props),
        onExit: () => ui.onExit(),
      }),
    },
  })
}
