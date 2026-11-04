import { Node, mergeAttributes } from '@tiptap/core'
import { fetchDocumentTextSnapshot } from '../api/documents'
import { syncBlockAttrs, syncBlockSummary, type SyncBlockSource } from '../utils/rteCrossDoc'
import {
  normalizeSyncBlockStatus,
  refreshSyncBlock,
  renderSyncBlockInto,
  syncBlockSourceHref,
  syncBlockView,
} from '../utils/rteSyncBlock'

/**
 * 跨文档同步块。
 *
 * 一段引用其它文档内容的块。正文里存来源（文档 / 面板 / 块）与快照，
 * 渲染成带来源链接的引用框；点来源可以跳到原文。
 *
 * 同步是「快照 + 手动刷新」，不是后台实时同步：
 * - 正常态有「刷新」按钮，刷新中显示加载态；
 * - 源被删除（404）/ 无权限（403）/ 网络失败时进入失效态，
 *   明确提示原因，并可「重试」「解除同步」「移除」，不会静默空白或报错。
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
      /** 同步状态：synced / loading / missing / forbidden / error */
      status: {
        default: 'synced',
        parseHTML: (el: HTMLElement) =>
          normalizeSyncBlockStatus(el.getAttribute('data-sync-status')),
        renderHTML: (attrs: { status?: string }) =>
          attrs.status ? { 'data-sync-status': attrs.status } : {},
      },
      /** 失效原因文案（失效态展示） */
      errorMessage: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sync-error') || '',
        renderHTML: (attrs: { errorMessage?: string }) =>
          attrs.errorMessage ? { 'data-sync-error': attrs.errorMessage } : {},
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
    const status = normalizeSyncBlockStatus(attrs.status)
    const view = syncBlockView(status, attrs.errorMessage)
    const href = syncBlockSourceHref({
      documentId: source.documentId,
      panelId: source.panelId,
    })
    const data = syncBlockAttrs(source)
    const body = snapshot || '还没有同步内容'
    const children: unknown[] = [
      [
        'div',
        { class: 'rte-sync-block-head' },
        ['a', { class: 'rte-sync-block-link', href }, title],
        ['span', { class: 'rte-sync-block-state-label' }, view.title],
      ],
      ['div', { class: snapshot ? 'rte-sync-block-text' : 'rte-sync-block-text is-empty' }, body],
    ]
    if (status !== 'synced' && status !== 'loading') {
      children.push([
        'div',
        { class: `rte-sync-block-notice is-${view.tone}` },
        ['strong', { class: 'rte-sync-block-notice-title' }, view.title],
        ['span', { class: 'rte-sync-block-notice-hint' }, view.hint],
      ])
    }
    if (status === 'loading') {
      children.push([
        'div',
        { class: 'rte-sync-block-loading', role: 'status' },
        '正在刷新同步内容…',
      ])
    }
    if (attrs.syncedAt) {
      children.push(['div', { class: 'rte-sync-block-time' }, `同步于 ${attrs.syncedAt}`])
    }
    return [
      'div',
      mergeAttributes({ class: `rte-sync-block is-${status}` }, data, {
        'data-sync-text': attrs.text || '',
        'data-sync-status': status,
      }),
      ...(children as never[]),
    ] as unknown as any
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')

      const readAttrs = (): Record<string, string> => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        const live =
          typeof pos === 'number' && pos >= 0 ? editor.state.doc.nodeAt(pos) : undefined
        const source = (live || current)?.attrs || {}
        return {
          documentId: String(source.documentId || ''),
          documentTitle: String(source.documentTitle || ''),
          panelId: String(source.panelId || ''),
          text: String(source.text || ''),
          syncedAt: String(source.syncedAt || ''),
          status: String(source.status || 'synced'),
          errorMessage: String(source.errorMessage || ''),
        }
      }

      const setAttrs = (patch: Record<string, string>) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number' || pos < 0) return
        const target = editor.state.doc.nodeAt(pos)
        if (!target) return
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...target.attrs, ...patch }),
        )
      }

      const handleRefresh = async () => {
        const attrs = readAttrs()
        setAttrs({ status: 'loading', errorMessage: '' })
        const result = await refreshSyncBlock({
          documentId: attrs.documentId,
          panelId: attrs.panelId,
          fetcher: fetchDocumentTextSnapshot,
        })
        if (result.ok) {
          setAttrs({
            status: 'synced',
            text: result.text,
            panelId: result.panelId || attrs.panelId || '',
            syncedAt: result.syncedAt,
            errorMessage: '',
          })
        } else {
          setAttrs({ status: result.status, errorMessage: result.message })
        }
      }

      const handleUnlink = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number' || pos < 0) return
        const target = editor.state.doc.nodeAt(pos)
        if (!target) return
        const text = String(target.attrs.text || '').trim()
        const schema = editor.state.schema
        try {
          const paragraph = schema.nodes.paragraph.create(
            null,
            text ? schema.text(text) : undefined,
          )
          editor.view.dispatch(
            editor.state.tr.replaceWith(pos, pos + target.nodeSize, paragraph),
          )
        } catch {
          // 当前位置不允许段落（例如列表项内部），退化成直接移除
          editor.view.dispatch(editor.state.tr.delete(pos, pos + target.nodeSize))
        }
      }

      const handleRemove = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number' || pos < 0) return
        const target = editor.state.doc.nodeAt(pos)
        if (!target) return
        editor.view.dispatch(editor.state.tr.delete(pos, pos + target.nodeSize))
      }

      const paint = () => {
        const attrs = readAttrs()
        renderSyncBlockInto(dom, {
          status: normalizeSyncBlockStatus(attrs.status),
          documentId: attrs.documentId,
          documentTitle: attrs.documentTitle,
          panelId: attrs.panelId,
          text: attrs.text,
          syncedAt: attrs.syncedAt,
          message: attrs.errorMessage,
          onRefresh: () => {
            void handleRefresh()
          },
          onUnlink: handleUnlink,
          onRemove: handleRemove,
        })
      }

      paint()

      return {
        dom,
        update(next: typeof node) {
          if (next.type.name !== 'syncBlock') return false
          current = next
          paint()
          return true
        },
        stopEvent(event: Event) {
          const target = event.target as HTMLElement | null
          return !!target?.closest?.('.rte-sync-block-actions')
        },
        ignoreMutation() {
          return true
        },
      }
    }
  },
})

export { syncBlockSummary }
