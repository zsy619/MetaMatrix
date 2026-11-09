import { Extension } from '@tiptap/core'
import type { Selection } from '@tiptap/pm/state'

/**
 * 字间距作用范围。没有选中文字时，作用到当前段落里已有的文字。
 * 空段落返回 null，只留给随后输入的文字。
 */
export function letterSpacingTarget(selection: Selection): { from: number; to: number } | null {
  if (!selection.empty) return { from: selection.from, to: selection.to }
  if (!selection.$from.parent.isTextblock) return null
  const from = selection.$from.start()
  const to = selection.$from.end()
  if (to <= from) return null
  return { from, to }
}

export type LetterSpacingOptions = {
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    letterSpacing: {
      setLetterSpacing: (letterSpacing: string) => ReturnType
      unsetLetterSpacing: () => ReturnType
    }
  }
}

declare module '@tiptap/extension-text-style' {
  interface TextStyleAttributes {
    letterSpacing?: string | null
  }
}

/** 字间距：挂在 textStyle 上，与行距同模式 */
export const LetterSpacing = Extension.create<LetterSpacingOptions>({
  name: 'letterSpacing',

  addOptions() {
    return { types: ['textStyle'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const v =
                element.style.letterSpacing ||
                element.getAttribute('style')?.match(/letter-spacing:\s*([^;]+)/i)?.[1]
              return v?.trim() || null
            },
            renderHTML: (attributes: { letterSpacing?: string | null }) => {
              if (!attributes.letterSpacing) return {}
              return { style: `letter-spacing: ${attributes.letterSpacing}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLetterSpacing:
        (letterSpacing: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { letterSpacing }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { letterSpacing: null }).removeEmptyTextStyle().run(),
    }
  },
})
