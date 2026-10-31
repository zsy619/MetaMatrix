import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    emphasisDot: {
      toggleEmphasisDot: () => ReturnType
    }
  }
}

/** 中文着重号 */
export const EmphasisDot = Mark.create({
  name: 'emphasisDot',
  excludes: '',
  parseHTML() {
    return [
      { tag: 'span[data-emphasis="dot"]' },
      {
        style: 'text-emphasis-style',
        getAttrs: (v) => (String(v).includes('dot') || String(v).includes('filled') ? {} : false),
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-emphasis': 'dot',
        class: 'rte-emphasis-dot',
      }),
      0,
    ]
  },
  addCommands() {
    return {
      toggleEmphasisDot:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    }
  },
})
