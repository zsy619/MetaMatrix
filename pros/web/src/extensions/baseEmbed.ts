import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import BaseEmbedView from '../components/rte/baseEmbed/BaseEmbedView.vue'

/**
 * 文档内嵌多维表格视图块（Base Embed）。
 *
 * 文档里只存引用：`{ projectId, baseId, tableId, viewId, title }`，
 * 渲染时由 NodeView 实时取数（表格 / 视图 / 记录），
 * 因此表格里的数据变化会直接反映到文档里，文档本身不复制数据。
 *
 * HTML 形态：`<div data-type="baseEmbed" data-base-id=... data-table-id=...>`
 * —— 导出 / 打印 / 只读渲染时退化为一张带标题的占位卡片。
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    baseEmbed: {
      insertBaseEmbed: (attrs: {
        projectId: string
        baseId: string
        tableId: string
        viewId?: string
        nodeId?: string
        title?: string
      }) => ReturnType
    }
  }
}

export const BaseEmbed = Node.create({
  name: 'baseEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      projectId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-project-id') || '',
        renderHTML: (attrs: { projectId?: string }) => ({ 'data-project-id': attrs.projectId || '' }),
      },
      baseId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-base-id') || '',
        renderHTML: (attrs: { baseId?: string }) => ({ 'data-base-id': attrs.baseId || '' }),
      },
      tableId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-table-id') || '',
        renderHTML: (attrs: { tableId?: string }) => ({ 'data-table-id': attrs.tableId || '' }),
      },
      viewId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-view-id') || '',
        renderHTML: (attrs: { viewId?: string }) => ({ 'data-view-id': attrs.viewId || '' }),
      },
      nodeId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-node-id') || '',
        renderHTML: (attrs: { nodeId?: string }) => ({ 'data-node-id': attrs.nodeId || '' }),
      },
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
        renderHTML: (attrs: { title?: string }) => ({ 'data-title': attrs.title || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="baseEmbed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = node.attrs.title || '多维表格'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'baseEmbed',
        class: 'rte-base-embed',
        contenteditable: 'false',
      }),
      ['span', { class: 'rte-base-embed__icon' }, '📊'],
      ['span', { class: 'rte-base-embed__title' }, title],
    ]
  },

  addNodeView() {
    // Vue 组件的 props 泛型与 TipTap 的 NodeViewProps 不完全对齐，这里做一次显式转换。
    return VueNodeViewRenderer(BaseEmbedView as unknown as Component<NodeViewProps>)
  },

  addCommands() {
    return {
      insertBaseEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: 'baseEmbed',
            attrs,
          }),
    }
  },
})
