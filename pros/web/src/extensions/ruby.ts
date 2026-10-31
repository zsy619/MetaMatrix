import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ruby: {
      setRuby: (annotation: string) => ReturnType
      unsetRuby: () => ReturnType
    }
  }
}

/** 注音 / 拼音：用 data-ruby + CSS 上标显示，避免 mark 内嵌 rt 孔位问题 */
export const Ruby = Mark.create({
  name: 'ruby',
  excludes: '',
  addAttributes() {
    return {
      annotation: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-ruby') || '',
        renderHTML: (attrs: { annotation?: string }) => {
          const a = (attrs.annotation || '').trim()
          return a ? { 'data-ruby': a } : {}
        },
      },
    }
  },
  parseHTML() {
    return [
      { tag: 'span[data-ruby]' },
      {
        tag: 'ruby',
        getAttrs: (el) => {
          const rt = (el as HTMLElement).querySelector('rt')
          const ann = rt?.textContent?.trim() || ''
          return ann ? { annotation: ann } : false
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'rte-ruby',
      }),
      0,
    ]
  },
  addCommands() {
    return {
      setRuby:
        (annotation: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { annotation: (annotation || '').trim() }),
      unsetRuby:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
