import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audio: {
      setAudio: (attrs: { src: string; title?: string }) => ReturnType
    }
  }
}

export const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('src') || el.querySelector('source')?.getAttribute('src'),
        renderHTML: (attrs: { src?: string | null }) => (attrs.src ? { src: attrs.src } : {}),
      },
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || el.getAttribute('title'),
        renderHTML: (attrs: { title?: string | null }) =>
          attrs.title ? { 'data-title': attrs.title, title: attrs.title } : {},
      },
      controls: {
        default: true,
        parseHTML: (el: HTMLElement) => el.hasAttribute('controls'),
        renderHTML: () => ({ controls: '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'audio[src]' }, { tag: 'audio[data-type="audio"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'audio',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'audio',
        class: 'rte-audio',
        controls: '',
      }),
    ]
  },

  addCommands() {
    return {
      setAudio:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { src: attrs.src, title: attrs.title || null, controls: true },
          }),
    }
  },
})
