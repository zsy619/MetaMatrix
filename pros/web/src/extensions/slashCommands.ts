/**
 * TipTap Slash「/」建议：基于 @tiptap/suggestion。
 * UI 由宿主 Vue 渲染（Teleport + 视口夹紧），本扩展只负责匹配与键盘事件桥接。
 */
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import {
  filterRteSlashItems,
  type RteSlashItem,
} from '../components/rteSlashItems'

export const slashPluginKey = new PluginKey('rteSlashCommands')

export type RteSlashRenderProps = SuggestionProps<RteSlashItem, RteSlashItem>

export type RteSlashUiHandlers = {
  onStart: (props: RteSlashRenderProps) => void
  onUpdate: (props: RteSlashRenderProps) => void
  onExit: () => void
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
  onCommand: (item: RteSlashItem) => void
}

export type SlashCommandsOptions = {
  ui: RteSlashUiHandlers
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'rteSlashCommands',

  addOptions() {
    return {
      ui: {
        onStart: () => {},
        onUpdate: () => {},
        onExit: () => {},
        onKeyDown: () => false,
        onCommand: () => {},
      },
    }
  },

  addProseMirrorPlugins() {
    // 注意：options.ui 在 configure 时传入的是可变对象引用，
    // 宿主可在 setup 后期替换其方法而不重建插件。
    const ui = this.options.ui
    return [
      Suggestion<RteSlashItem, RteSlashItem>({
        pluginKey: slashPluginKey,
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allowedPrefixes: [' ', '\u00A0', '(', '（', '「', '『', '【', '\n'],
        decorationClass: 'rte-slash-decoration',
        allow: ({ editor, state, range }) => {
          if (!editor.isEditable) return false
          const $from = state.doc.resolve(range.from)
          for (let d = $from.depth; d > 0; d -= 1) {
            const name = $from.node(d).type.name
            if (name === 'codeBlock' || name === 'code') return false
          }
          return true
        },
        items: ({ query }) => filterRteSlashItems(query, 80),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          ui.onCommand(props)
        },
        render: () => ({
          onStart: (props) => ui.onStart(props),
          onUpdate: (props) => ui.onUpdate(props),
          onKeyDown: (props) => ui.onKeyDown(props),
          onExit: () => ui.onExit(),
        }),
      }),
    ]
  },
})
