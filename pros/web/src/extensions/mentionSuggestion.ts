/**
 * TipTap @提及：基于 @tiptap/extension-mention + @tiptap/suggestion。
 * UI 由宿主 Vue 渲染（与 Slash「/」同一套定位/键盘模式）。
 *
 * 人员候选来自组织通讯录接口（见 ../api/directory.ts），由宿主通过 people 注入；
 * 本文块引用来自当前文档。接口不可用时不给写死的示例人员。
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
  /**
   * 组织通讯录里的真人。返回 Promise，宿主从通讯录接口取人并按文档权限过滤。
   * 没提供时 @ 菜单里没有真人候选（不再有写死的示例人员）。
   */
  people?: () => Promise<RteMentionItem[]>
}

/**
 * 创建已配置 UI 桥接的 Mention 扩展。
 * 注意：ui 对象引用可变，宿主可在 setup 后期替换方法而不重建扩展。
 */
export function createRteMention(options: RteMentionOptions) {
  const ui = options.ui
  const people = options.people
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
      items: async ({ query, editor }) => {
        const blocks = collectCrossRefTargets(editor).map((target) => ({
          id: target.id,
          label: target.label,
          kind: target.kind,
        }))
        // 通讯录优先；接口不可用时没有真人候选人，只留本文块引用。
        let candidates: RteMentionItem[] = []
        if (people) {
          try {
            candidates = await people()
          } catch {
            candidates = []
          }
        }
        return mergeMentionCandidates(query, blocks, 12, candidates)
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
