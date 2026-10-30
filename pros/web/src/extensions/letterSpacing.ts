import { Extension } from '@tiptap/core'

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
