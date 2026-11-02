import { Node, mergeAttributes } from '@tiptap/core'
import { syncBlockAttrs, syncBlockSummary, type SyncBlockSource } from '../utils/rteCrossDoc'

/**
 * 跨文档同步块。
 *
 * 一段引用其它文档内容的块。正文里存来源（文档 / 面板 / 块）与快照，
 * 渲染成带来源链接的引用框；点来源可以跳到原文。
 *
 * 同步是「快照 + 手动刷新」，不是后台实时同步。
 */
export const SyncBlock = Node.create({
  name: 'syncBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      documentId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-document') || '',
        renderHTML: (attrs: { documentId?: string }) =>
          attrs.documentId ? { 'data-sync-document': attrs.documentId } : {},
      },
      documentTitle: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-title') || '',
        renderHTML: (attrs: { documentTitle?: string }) =>
          attrs.documentTitle ? { 'data-sync-title': attrs.documentTitle } : {},
      },
      panelId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-panel') || '',
        renderHTML: (attrs: { panelId?: string }) =>
          attrs.panelId ? { 'data-sync-panel': attrs.panelId } : {},
      },
      blockId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-block') || '',
        renderHTML: (attrs: { blockId?: string }) =>
          attrs.blockId ? { 'data-sync-block': attrs.blockId } : {},
      },
      /** 快照正文（纯文本） */
      text: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-text') || '',
        renderHTML: (attrs: { text?: string }) =>
          attrs.text ? { 'data-sync-text': attrs.text } : {},
      },
      syncedAt: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-at') || '',
        renderHTML: (attrs: { syncedAt?: string }) =>
          attrs.syncedAt ? { 'data-sync-at': attrs.syncedAt } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-sync-document]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, string>
    const source: SyncBlockSource = {
      documentId: attrs.documentId || '',
      documentTitle: attrs.documentTitle || undefined,
      panelId: attrs.panelId || undefined,
      blockId: attrs.blockId || undefined,
      syncedAt: attrs.syncedAt || undefined,
    }
    const title = attrs.documentTitle || '来源文档'
    const snapshot = attrs.text || ''
    const href = `#/canvas/${encodeURIComponent(source.documentId)}${
      source.panelId ? `?panel=${encodeURIComponent(source.panelId)}` : ''
    }`
    const data = syncBlockAttrs(source)
    const body = snapshot || '还没有同步内容'
    return [
      'div',
      mergeAttributes({ class: 'rte-sync-block' }, data, {
        'data-sync-text': attrs.text || '',
      }),
      ['div', { class: 'rte-sync-block-head' }, ['a', { class: 'rte-sync-block-link', href }, title]],
      ['div', { class: snapshot ? 'rte-sync-block-text' : 'rte-sync-block-text is-empty' }, body],
      ...(attrs.syncedAt
        ? [['div', { class: 'rte-sync-block-time' }, `同步于 ${attrs.syncedAt}`]]
        : []),
    ] as unknown as any
  },
})

export { syncBlockSummary }
