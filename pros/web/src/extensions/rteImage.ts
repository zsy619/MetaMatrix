import Image from '@tiptap/extension-image'

export type RteImageAlign = 'left' | 'center' | 'right' | null

/**
 * 图片增强：对齐（data-align）+ 题注（caption / title）。
 * 保留 TipTap 3 内置 resize NodeView。
 */
export const RteImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null as RteImageAlign,
        parseHTML: (el: HTMLElement) => {
          const a = el.getAttribute('data-align')
          if (a === 'left' || a === 'center' || a === 'right') return a
          const fl = (el.style?.float || '').toLowerCase()
          if (fl === 'left' || fl === 'right') return fl
          return null
        },
        renderHTML: (attrs: { align?: RteImageAlign }) => {
          if (!attrs.align) return {}
          return { 'data-align': attrs.align }
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const c =
            el.getAttribute('data-caption') ||
            el.getAttribute('title') ||
            ''
          return c.trim() ? c.trim() : null
        },
        renderHTML: (attrs: { caption?: string | null }) => {
          const c = (attrs.caption || '').trim()
          if (!c) return {}
          return { 'data-caption': c, title: c }
        },
      },
      displayWidth: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const w =
            el.getAttribute('data-display-width') ||
            (el.style?.width || '').trim() ||
            null
          return w || null
        },
        renderHTML: (attrs: { displayWidth?: string | null }) => {
          const w = (attrs.displayWidth || '').trim()
          if (!w) return {}
          return { 'data-display-width': w, style: `width: ${w}; height: auto; max-width: 100%` }
        },
      },
      borderRadius: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-radius') || (el.style?.borderRadius || '').trim() || null,
        renderHTML: (attrs: { borderRadius?: string | null }) => {
          const v = (attrs.borderRadius || '').trim()
          if (!v) return {}
          return { 'data-radius': v, style: `border-radius: ${v}` }
        },
      },
      boxShadow: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-shadow') || (el.style?.boxShadow || '').trim() || null,
        renderHTML: (attrs: { boxShadow?: string | null }) => {
          const v = (attrs.boxShadow || '').trim()
          if (!v) return {}
          return { 'data-shadow': v, style: `box-shadow: ${v}` }
        },
      },
      borderStyle: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-border') || null,
        renderHTML: (attrs: { borderStyle?: string | null }) => {
          const v = (attrs.borderStyle || '').trim()
          if (!v) return {}
          return { 'data-border': v, style: `border: ${v}` }
        },
      },
    }
  },
})
