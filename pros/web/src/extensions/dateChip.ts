import { Node, mergeAttributes } from '@tiptap/core'
import { dateChipText } from '../utils/rteRound5'

export type DateChipKind = 'date' | 'remind'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dateChip: {
      insertDateChip: (attrs: {
        iso: string
        kind?: DateChipKind
        label?: string
      }) => ReturnType
    }
  }
}

function kindOf(value: unknown): DateChipKind {
  return value === 'remind' ? 'remind' : 'date'
}

/** 行内日期 / 提醒芯片。不依赖外部日历服务。 */
export const DateChip = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      iso: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-iso') || '',
        renderHTML: (attrs: { iso?: string }) => ({ 'data-iso': attrs.iso || '' }),
      },
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || '',
        renderHTML: (attrs: { label?: string }) => ({ 'data-label': attrs.label || '' }),
      },
      kind: {
        default: 'date' as DateChipKind,
        parseHTML: (el: HTMLElement) => kindOf(el.getAttribute('data-kind')),
        renderHTML: (attrs: { kind?: DateChipKind }) => ({
          'data-kind': kindOf(attrs.kind),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="date-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = kindOf(node.attrs.kind)
    const text = dateChipText(
      String(node.attrs.iso || ''),
      kind,
      String(node.attrs.label || ''),
    )
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'date-chip',
        class: `rte-date-chip rte-date-chip--${kind}`,
        contenteditable: 'false',
      }),
      text,
    ]
  },

  addCommands() {
    return {
      insertDateChip:
        (attrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                iso: attrs.iso,
                kind: kindOf(attrs.kind),
                label: attrs.label || '',
              },
            })
            .insertContent(' ')
            .run(),
    }
  },
})
