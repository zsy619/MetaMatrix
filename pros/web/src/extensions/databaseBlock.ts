import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { SheetData, SheetFilter } from '../components/knowledge/sheetModel'
import { createDatabaseBlockView } from './databaseBlockView'
import {
  activeDatabaseView,
  attrsFromPayload,
  DATABASE_BLOCK_HTML_TYPE,
  DATABASE_BLOCK_NAME,
  defaultDatabasePayload,
  payloadFromAttrs,
  DATABASE_VIEW_LABELS,
  pullSheetIntoPayload,
  setDatabaseFilterJoin,
  setDatabaseFilters,
  setDatabaseViewType,
  type DatabaseBlockPayload,
  type DatabaseBlockViewType,
  updateDatabaseCell,
  viewTypeOf,
  visibleDatabaseRows,
} from './databaseBlockSheet'

/**
 * 正文内嵌多维表格块（B3）。
 *
 * 带 A1 `data-block-id`，可引用知识库树上既有的 `kind=sheet`，
 * 同时在块属性里保存一份可筛选、可切换视图、可在块内编辑的快照。
 * 不取代、不删除树上的独立表格。
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      insertDatabaseBlock: (attrs?: {
        sheetNodeId?: string
        title?: string
        payload?: DatabaseBlockPayload
      }) => ReturnType
      setDatabaseBlockView: (type: DatabaseBlockViewType) => ReturnType
      setDatabaseBlockFilters: (filters: SheetFilter[]) => ReturnType
      setDatabaseBlockFilterJoin: (join: 'and' | 'or') => ReturnType
      importDatabaseBlockSheet: (sheet: SheetData) => ReturnType
      updateDatabaseBlockCell: (rowId: string, fieldId: string, value: string) => ReturnType
    }
  }
}

export { DATABASE_BLOCK_HTML_TYPE, DATABASE_BLOCK_NAME }
export { DATABASE_BLOCK_SYNC_EVENT, type DatabaseBlockSyncDetail } from './databaseBlockEvents'
export type { DatabaseBlockPayload, DatabaseBlockViewType }

export type DatabaseBlockOpenTarget = {
  sheetNodeId: string
  title: string
}

export function readDatabaseBlockOpenTarget(
  el: Element | null | undefined,
): DatabaseBlockOpenTarget | null {
  const host = el?.closest?.(`[data-type="${DATABASE_BLOCK_HTML_TYPE}"], [data-type="${DATABASE_BLOCK_NAME}"]`)
  if (!host) return null
  const sheetNodeId = (host.getAttribute('data-sheet-node-id') || '').trim()
  if (!sheetNodeId) return null
  const title =
    (host.getAttribute('data-title') || '').trim() ||
    host.querySelector('.rte-database-block__title')?.textContent?.trim() ||
    '多维表格'
  return { sheetNodeId, title }
}

function currentDatabasePos(state: { selection: any; doc: any }): number | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === DATABASE_BLOCK_NAME) {
    return sel.from
  }
  let found: number | null = null
  const from = Math.max(0, (sel.from ?? 0) - 1)
  const to = Math.min(state.doc.content.size, (sel.to ?? sel.from ?? 0) + 1)
  state.doc.nodesBetween(from, to, (node: { type: { name: string } }, pos: number) => {
    if (node.type.name === DATABASE_BLOCK_NAME && found == null) {
      found = pos
      return false
    }
    return true
  })
  if (found != null) return found
  state.doc.descendants((node: { type: { name: string } }, pos: number) => {
    if (found == null && node.type.name === DATABASE_BLOCK_NAME) found = pos
    return found == null
  })
  return found
}

export const DatabaseBlock = Node.create({
  name: DATABASE_BLOCK_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sheetNodeId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sheet-node-id') || '',
        renderHTML: (attrs: { sheetNodeId?: string }) =>
          attrs.sheetNodeId ? { 'data-sheet-node-id': attrs.sheetNodeId } : {},
      },
      title: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
        renderHTML: (attrs: { title?: string }) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
      viewType: {
        default: 'grid',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-view-type') || 'grid',
        renderHTML: (attrs: { viewType?: string }) =>
          attrs.viewType ? { 'data-view-type': attrs.viewType } : {},
      },
      sheet: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-sheet') || '',
        renderHTML: (attrs: { sheet?: string }) => (attrs.sheet ? { 'data-sheet': attrs.sheet } : {}),
      },
    }
  },

  parseHTML() {
    return [
      { tag: `div[data-type="${DATABASE_BLOCK_HTML_TYPE}"]` },
      { tag: `div[data-type="${DATABASE_BLOCK_NAME}"]` },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const payload = payloadFromAttrs(node.attrs as { sheet?: string; viewType?: string })
    const view = activeDatabaseView(payload)
    const typ = viewTypeOf(view)
    const rows = visibleDatabaseRows(payload)
    const linked = Boolean(String(node.attrs.sheetNodeId || '').trim())
    const title = String(node.attrs.title || '').trim() || '多维表格'
    const snapshot = attrsFromPayload(payload)
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': DATABASE_BLOCK_HTML_TYPE,
        'data-view-type': typ,
        'data-sheet': snapshot.sheet,
        class: linked ? 'rte-database-block is-linked' : 'rte-database-block',
        contenteditable: 'false',
        'data-open-sheet': linked ? 'true' : 'false',
      }),
      ['span', { class: 'rte-database-block__title' }, title],
      ['span', { class: 'rte-database-block__hint' }, DATABASE_VIEW_LABELS[typ]],
      ['span', { class: 'rte-database-block__meta' }, `${rows.length} 行`],
    ]
  },

  addNodeView() {
    return (props) => createDatabaseBlockView(props)
  },

  addCommands() {
    return {
      insertDatabaseBlock:
        (attrs) =>
        ({ commands }) => {
          const payload = attrs?.payload ?? defaultDatabasePayload()
          const snap = attrsFromPayload(payload)
          return commands.insertContent({
            type: DATABASE_BLOCK_NAME,
            attrs: {
              sheetNodeId: attrs?.sheetNodeId || '',
              title: attrs?.title || '',
              sheet: snap.sheet,
              viewType: snap.viewType,
            },
          })
        },
      setDatabaseBlockView:
        (type) =>
        ({ state, tr, dispatch }) => {
          const pos = currentDatabasePos(state)
          if (pos == null) return false
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== DATABASE_BLOCK_NAME) return false
          const next = attrsFromPayload(setDatabaseViewType(payloadFromAttrs(node.attrs), type))
          if (dispatch) {
            dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }))
          }
          return true
        },
      setDatabaseBlockFilters:
        (filters) =>
        ({ state, tr, dispatch }) => {
          const pos = currentDatabasePos(state)
          if (pos == null) return false
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== DATABASE_BLOCK_NAME) return false
          const next = attrsFromPayload(setDatabaseFilters(payloadFromAttrs(node.attrs), filters))
          if (dispatch) {
            dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }))
          }
          return true
        },
      setDatabaseBlockFilterJoin:
        (join) =>
        ({ state, tr, dispatch }) => {
          const pos = currentDatabasePos(state)
          if (pos == null) return false
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== DATABASE_BLOCK_NAME) return false
          const next = attrsFromPayload(setDatabaseFilterJoin(payloadFromAttrs(node.attrs), join))
          if (dispatch) {
            dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }))
          }
          return true
        },
      importDatabaseBlockSheet:
        (sheet) =>
        ({ state, tr, dispatch }) => {
          const pos = currentDatabasePos(state)
          if (pos == null) return false
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== DATABASE_BLOCK_NAME) return false
          const next = attrsFromPayload(pullSheetIntoPayload(payloadFromAttrs(node.attrs), sheet))
          if (dispatch) {
            dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }))
          }
          return true
        },
      updateDatabaseBlockCell:
        (rowId, fieldId, value) =>
        ({ state, tr, dispatch }) => {
          const pos = currentDatabasePos(state)
          if (pos == null) return false
          const node = state.doc.nodeAt(pos)
          if (!node || node.type.name !== DATABASE_BLOCK_NAME) return false
          const next = attrsFromPayload(updateDatabaseCell(payloadFromAttrs(node.attrs), rowId, fieldId, value))
          if (dispatch) {
            dispatch(tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }))
          }
          return true
        },
    }
  },
})
