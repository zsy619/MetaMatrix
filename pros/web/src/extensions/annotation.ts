import { Mark, mergeAttributes } from '@tiptap/core'

export type AnnotationType = '新注释' | '重要' | '待办'

export interface AnnotationAttrs {
  type: string
  note: string
  href: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotation: {
      /** 为选区设置注释标记（含可选链接） */
      setAnnotation: (attributes?: Partial<AnnotationAttrs>) => ReturnType
      /** 取消注释标记 */
      unsetAnnotation: () => ReturnType
    }
  }
}

/**
 * 行内注释标记：序列化为
 * <span data-annotation class="rte-annotation" data-note-type="…" data-note="…" data-href="…">
 * 嵌在段落等块内，itemsHtml 同步不会剥离。
 */
export const Annotation = Mark.create({
  name: 'annotation',

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'rte-annotation',
      },
    }
  },

  addAttributes() {
    return {
      type: {
        default: '新注释',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-note-type') || '新注释',
        renderHTML: (attributes: AnnotationAttrs) => ({
          'data-note-type': attributes.type || '新注释',
        }),
      },
      note: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-note') || '',
        renderHTML: (attributes: AnnotationAttrs) => {
          if (!attributes.note) return {}
          return {
            'data-note': attributes.note,
            title: attributes.note,
          }
        },
      },
      href: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-href') || '',
        renderHTML: (attributes: AnnotationAttrs) => {
          if (!attributes.href) return {}
          return { 'data-href': attributes.href }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-annotation]' },
      {
        tag: 'span.rte-annotation',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-annotation': 'true',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setAnnotation:
        (attributes = {}) =>
        ({ commands }) =>
          commands.setMark(this.name, {
            type: attributes.type ?? '新注释',
            note: attributes.note ?? '',
            href: attributes.href ?? '',
          }),
      unsetAnnotation:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})

export default Annotation
