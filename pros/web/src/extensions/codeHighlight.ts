/**
 * TipTap CodeBlockLowlight + lowlight 公共语言包。
 * 与 StarterKit 共用时须关闭 StarterKit.codeBlock，避免重复注册。
 */
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

export const rteLowlight = createLowlight(common)

export const RteCodeBlockLowlight = CodeBlockLowlight.configure({
  lowlight: rteLowlight,
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'rte-code-block',
  },
})

export const RTE_CODE_LANGUAGES = rteLowlight.listLanguages()
