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
      padListItem: (delta: number) => ReturnType
      toggleTableZebra: () => ReturnType
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
        types: ['table'],
        attributes: {
          caption: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-table-caption') || null,
            renderHTML: (attrs: { caption?: string | null }) =>
              attrs.caption ? { 'data-table-caption': attrs.caption } : {},
          },
          zebra: {
            default: false,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-zebra') === '1',
            renderHTML: (attrs: { zebra?: boolean }) => (attrs.zebra ? { 'data-zebra': '1' } : {}),
          },
        },
      },
      {
        types: ['listItem', 'taskItem'],
        attributes: {
          pad: {
            default: 0,
            parseHTML: (el: HTMLElement) => {
              const n = Number(el.getAttribute('data-pad') || 0)
              return Number.isFinite(n) ? Math.max(0, Math.min(6, Math.round(n))) : 0
            },
            renderHTML: (attrs: { pad?: number }) => {
              const pad = Number(attrs.pad) || 0
              if (!pad) return {}
              return { 'data-pad': String(pad), style: `padding-left: ${pad}em` }
            },
          },
        },
      },
      {
        types: ['image', 'table'],
        attributes: {
          rowFilter: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-row-filter') || null,
            renderHTML: (attrs: { rowFilter?: string | null }) =>
              attrs.rowFilter ? { 'data-row-filter': attrs.rowFilter } : {},
          },
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
      padListItem:
        (delta) =>
        ({ editor, commands }) => {
          const type = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : ''
          if (!type) return false
          const cur = Number(editor.getAttributes(type).pad || 0)
          const next = Math.max(0, Math.min(6, cur + (delta > 0 ? 1 : -1)))
          return commands.updateAttributes(type, { pad: next })
        },
      toggleTableZebra:
        () =>
        ({ editor, commands }) => {
          if (!editor.isActive('table')) return false
          const on = editor.getAttributes('table').zebra === true
          return commands.updateAttributes('table', { zebra: !on })
        },
    }
  },
})
