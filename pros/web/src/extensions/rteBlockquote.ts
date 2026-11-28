import Blockquote from '@tiptap/extension-blockquote'
import { mergeAttributes } from '@tiptap/core'

export type QuoteStyle = 'default' | 'emphasis' | 'verse'

export const QUOTE_STYLE_OPTIONS: Array<{ value: QuoteStyle; label: string; hint: string }> = [
  { value: 'default', label: '标准引用', hint: '左侧竖线' },
  { value: 'emphasis', label: '强调引用', hint: '浅底强调' },
  { value: 'verse', label: '诗文引用', hint: '居中斜体感' },
]

function normalizeStyle(v: unknown): QuoteStyle {
  if (v === 'emphasis' || v === 'verse' || v === 'default') return v
  return 'default'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rteBlockquote: {
      setQuoteStyle: (style: QuoteStyle) => ReturnType
    }
  }
}

/** 引用样式：标准 / 强调 / 诗文 */
export const RteBlockquote = Blockquote.extend({
  name: 'blockquote',

  addAttributes() {
    return {
      ...this.parent?.(),
      quoteStyle: {
        default: 'default' as QuoteStyle,
        parseHTML: (el: HTMLElement) =>
          normalizeStyle(
            el.getAttribute('data-quote-style') || el.getAttribute('data-style'),
          ),
        renderHTML: (attrs: { quoteStyle?: QuoteStyle }) => {
          const style = normalizeStyle(attrs.quoteStyle)
          return {
            'data-quote-style': style,
            class: `rte-quote rte-quote--${style}`,
          }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setQuoteStyle:
        (style: QuoteStyle) =>
        ({ chain, editor }) => {
          const s = normalizeStyle(style)
          const next = editor.isActive(this.name) ? chain() : chain().toggleBlockquote()
          return next.updateAttributes(this.name, { quoteStyle: s }).run()
        },
    }
  },
})
