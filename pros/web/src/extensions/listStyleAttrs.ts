import { Extension } from '@tiptap/core'

export type OrderedListStyle =
  | 'decimal'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | 'cjk-ideographic'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyleAttrs: {
      setOrderedListStyle: (listStyleType: OrderedListStyle) => ReturnType
      setOrderedListStart: (start: number) => ReturnType
    }
  }
}

/** 有序列表编号样式 / 起始序号 */
export const ListStyleAttrs = Extension.create({
  name: 'listStyleAttrs',

  addGlobalAttributes() {
    return [
      {
        types: ['orderedList'],
        attributes: {
          listStyleType: {
            default: 'decimal',
            parseHTML: (el: HTMLElement) =>
              el.getAttribute('data-list-style') ||
              el.style.listStyleType ||
              'decimal',
            renderHTML: (attrs: { listStyleType?: string }) => {
              const t = attrs.listStyleType || 'decimal'
              if (t === 'decimal') return {}
              return {
                'data-list-style': t,
                style: `list-style-type: ${t}`,
              }
            },
          },
          start: {
            default: 1,
            parseHTML: (el: HTMLElement) => {
              const n = parseInt(el.getAttribute('start') || '1', 10)
              return Number.isFinite(n) && n > 0 ? n : 1
            },
            renderHTML: (attrs: { start?: number }) => {
              const s = attrs.start ?? 1
              return s !== 1 ? { start: s } : {}
            },
          },
        },
      },
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('id') || null,
            renderHTML: (attrs: { id?: string | null }) =>
              attrs.id ? { id: attrs.id } : {},
          },
        },
      },
      {
        types: ['image', 'table'],
        attributes: {
          xrefId: {
            default: null,
            parseHTML: (el: HTMLElement) =>
              el.getAttribute('data-xref-id') || el.getAttribute('id') || null,
            renderHTML: (attrs: { xrefId?: string | null }) =>
              attrs.xrefId ? { 'data-xref-id': attrs.xrefId } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setOrderedListStyle:
        (listStyleType) =>
        ({ commands, editor }) => {
          if (!editor.isActive('orderedList')) {
            commands.toggleOrderedList()
          }
          return commands.updateAttributes('orderedList', { listStyleType })
        },
      setOrderedListStart:
        (start) =>
        ({ commands, editor }) => {
          if (!editor.isActive('orderedList')) return false
          const n = Math.max(1, Math.floor(start) || 1)
          return commands.updateAttributes('orderedList', { start: n })
        },
    }
  },
})
