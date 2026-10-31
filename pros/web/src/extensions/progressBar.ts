import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    progressBar: {
      insertProgressBar: (attrs?: { percent?: number; label?: string }) => ReturnType
    }
  }
}

function clampPercent(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export const ProgressBar = Node.create({
  name: 'progressBar',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      percent: {
        default: 50,
        parseHTML: (el: HTMLElement) => clampPercent(el.getAttribute('data-percent')),
        renderHTML: (attrs: { percent?: number }) => ({
          'data-percent': String(clampPercent(attrs.percent)),
        }),
      },
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || '',
        renderHTML: (attrs: { label?: string }) =>
          attrs.label ? { 'data-label': attrs.label } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="progress-bar"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const percent = clampPercent(node.attrs.percent)
    const label = String(node.attrs.label || '')
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'progress-bar',
        class: 'rte-progress-bar',
      }),
      [
        'div',
        { class: 'rte-progress-bar-meta' },
        label || '进度',
        ['span', { class: 'rte-progress-bar-pct' }, `${percent}%`],
      ],
      [
        'div',
        { class: 'rte-progress-bar-track' },
        ['div', { class: 'rte-progress-bar-fill', style: `width:${percent}%` }],
      ],
    ]
  },

  addCommands() {
    return {
      insertProgressBar:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              percent: clampPercent(attrs.percent ?? 50),
              label: (attrs.label || '').trim(),
            },
          }),
    }
  },
})
