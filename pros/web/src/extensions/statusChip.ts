import { Node, mergeAttributes } from '@tiptap/core'

export type StatusChipTone = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    statusChip: {
      insertStatusChip: (attrs: { label: string; tone?: StatusChipTone }) => ReturnType
    }
  }
}

export const StatusChip = Node.create({
  name: 'statusChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: '状态',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || el.textContent || '状态',
        renderHTML: (attrs: { label?: string }) => ({ 'data-label': attrs.label || '状态' }),
      },
      tone: {
        default: 'blue' as StatusChipTone,
        parseHTML: (el: HTMLElement) => (el.getAttribute('data-tone') as StatusChipTone) || 'blue',
        renderHTML: (attrs: { tone?: StatusChipTone }) => ({ 'data-tone': attrs.tone || 'blue' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="status-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.label || '状态'
    const tone = node.attrs.tone || 'blue'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'status-chip',
        class: `rte-status-chip rte-status-chip--${tone}`,
        contenteditable: 'false',
      }),
      label,
    ]
  },

  addCommands() {
    return {
      insertStatusChip:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              label: (attrs.label || '状态').trim() || '状态',
              tone: attrs.tone || 'blue',
            },
          }),
    }
  },
})
