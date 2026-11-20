import { Node, mergeAttributes } from '@tiptap/core'

/**
 * 画布嵌入块：在文档里引用另一篇画布/文档。
 *
 * 渲染为只读卡片（标题 + 类型 + 点击跳转），不渲染完整画布快照——
 * 快照渲染需要复用整个画布渲染栈，成本过高；引用卡片已满足
 * 「文档引用文档」的语义与反向引用索引（后端扫 data-doc-id）。
 *
 * 后端 page_references 用 data-type="canvasEmbed" data-doc-id 匹配。
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    canvasEmbed: {
      insertCanvasEmbed: (attrs: { docId: string; title?: string; canvasType?: string }) => ReturnType
    }
  }
}

export const CanvasEmbed = Node.create({
  name: 'canvasEmbed',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      docId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-doc-id') || '',
        renderHTML: (attrs: { docId?: string }) => ({ 'data-doc-id': attrs.docId || '' }),
      },
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
        renderHTML: (attrs: { title?: string }) => ({ 'data-title': attrs.title || '' }),
      },
      canvasType: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-canvas-type') || '',
        renderHTML: (attrs: { canvasType?: string }) => ({ 'data-canvas-type': attrs.canvasType || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="canvasEmbed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const icon = node.attrs.canvasType === 'doc' ? '📄' : '🎨'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'canvasEmbed',
        class: 'rte-canvas-embed',
        contenteditable: 'false',
      }),
      ['span', { class: 'rte-canvas-embed__icon' }, icon],
      ['span', { class: 'rte-canvas-embed__title' }, node.attrs.title || '画布引用'],
    ]
  },

  addCommands() {
    return {
      insertCanvasEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: 'canvasEmbed',
            attrs,
          }),
    }
  },
})
