import type { NodeViewRendererProps } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { SheetFilter } from '../components/knowledge/sheetModel'
import { BLOCK_IDENTITY_ATTR } from './blockIdentity'
import { DATABASE_BLOCK_HTML_TYPE } from './databaseBlockSheet'
import {
  activeDatabaseView,
  attrsFromPayload,
  cellPreview,
  databaseGroups,
  firstFilterableField,
  payloadFromAttrs,
  setDatabaseFilters,
  setDatabaseViewType,
  type DatabaseBlockPayload,
  type DatabaseBlockViewType,
  updateDatabaseCell,
  visibleDatabaseRows,
} from './databaseBlockSheet'

export function createDatabaseBlockView({ node, getPos, editor }: NodeViewRendererProps) {
  let current = node
  const dom = document.createElement('div')
  dom.className = 'rte-database-block is-live'
  dom.setAttribute('data-type', DATABASE_BLOCK_HTML_TYPE)
  dom.contentEditable = 'false'

  const signature = (target: PMNode) =>
    `${target.attrs.sheet || ''}|${target.attrs.viewType || ''}|${target.attrs.title || ''}|${target.attrs.sheetNodeId || ''}`
  let last = signature(node)

  const readPayload = (): DatabaseBlockPayload => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    const live = typeof pos === 'number' && pos >= 0 ? editor.state.doc.nodeAt(pos) : undefined
    return payloadFromAttrs((live || current).attrs as { sheet?: string; viewType?: string })
  }

  const writePayload = (payload: DatabaseBlockPayload) => {
    if (!editor.isEditable) return
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos !== 'number' || pos < 0) return
    const target = editor.state.doc.nodeAt(pos)
    if (!target) return
    const next = attrsFromPayload(payload)
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...target.attrs,
        [BLOCK_IDENTITY_ATTR]: target.attrs[BLOCK_IDENTITY_ATTR],
        sheet: next.sheet,
        viewType: next.viewType,
      }),
    )
  }

  const render = () => {
    const payload = readPayload()
    const view = activeDatabaseView(payload)
    const typ: DatabaseBlockViewType = view.type === 'kanban' ? 'kanban' : 'grid'
    const title = String(current.attrs.title || '').trim() || '多维表格'
    const linked = Boolean(String(current.attrs.sheetNodeId || '').trim())
    const field = firstFilterableField(payload)
    const currentFilter = (view.filters || []).find((item) => item.fieldId === field?.id)
    const rows = visibleDatabaseRows(payload)
    const editable = editor.isEditable

    dom.className = linked ? 'rte-database-block is-live is-linked' : 'rte-database-block is-live'
    dom.setAttribute('data-type', DATABASE_BLOCK_HTML_TYPE)
    dom.setAttribute('data-view-type', typ)
    if (current.attrs.sheet) dom.setAttribute('data-sheet', String(current.attrs.sheet))
    if (current.attrs.sheetNodeId) dom.setAttribute('data-sheet-node-id', String(current.attrs.sheetNodeId))
    if (current.attrs.title) dom.setAttribute('data-title', String(current.attrs.title))
    if (linked) dom.setAttribute('data-open-sheet', 'true')

    dom.replaceChildren()
    const head = el('div', 'rte-database-block__bar')
    const titleEl = el('span', 'rte-database-block__title', title)
    const views = el('div', 'rte-database-block__views')
    views.append(
      viewBtn('grid', '表格', typ === 'grid', editable, () => writePayload(setDatabaseViewType(payload, 'grid'))),
      viewBtn('kanban', '看板', typ === 'kanban', editable, () => writePayload(setDatabaseViewType(payload, 'kanban'))),
    )
    const filterBox = el('label', 'rte-database-block__filter')
    filterBox.append(el('span', '', '筛选'))
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'rte-database-block__filter-input'
    input.placeholder = field ? `${field.name}包含…` : '筛选'
    input.value = currentFilter?.op === 'contains' ? currentFilter.value || '' : ''
    input.disabled = !editable || !field
    input.addEventListener('keydown', (event) => event.stopPropagation())
    input.addEventListener('change', () => {
      if (!field) return
      const filters: SheetFilter[] = input.value.trim()
        ? [{ fieldId: field.id, op: 'contains', value: input.value.trim() }]
        : []
      writePayload(setDatabaseFilters(payload, filters))
    })
    filterBox.append(input)
    head.append(titleEl, views, filterBox)
    if (linked) {
      const open = el('span', 'rte-database-block__hint', '打开知识库表格')
      open.setAttribute('data-open-sheet-label', 'true')
      head.append(open)
    }
    dom.append(head)

    if (typ === 'kanban') {
      const board = el('div', 'rte-database-block__board')
      for (const group of databaseGroups(payload)) {
        const col = el('div', 'rte-database-block__column')
        col.append(el('div', 'rte-database-block__column-title', group.label || '未分组'))
        for (const row of group.rows) {
          const card = el('div', 'rte-database-block__card')
          const main = payload.sheet.fields[0]
          card.textContent = main ? cellPreview(row.cells[main.id]) || '（空）' : row.id
          col.append(card)
        }
        board.append(col)
      }
      dom.append(board)
    } else {
      const table = document.createElement('table')
      table.className = 'rte-database-block__grid'
      const thead = document.createElement('thead')
      const hr = document.createElement('tr')
      for (const col of payload.sheet.fields) {
        hr.append(el('th', '', col.name))
      }
      thead.append(hr)
      const tbody = document.createElement('tbody')
      for (const row of rows) {
        const tr = document.createElement('tr')
        for (const col of payload.sheet.fields) {
          const td = document.createElement('td')
          const cell = document.createElement('input')
          cell.className = 'rte-database-block__cell'
          cell.value = cellPreview(row.cells[col.id])
          cell.disabled = !editable
          cell.addEventListener('keydown', (event) => event.stopPropagation())
          cell.addEventListener('change', () => {
            writePayload(updateDatabaseCell(payload, row.id, col.id, cell.value))
          })
          td.append(cell)
          tr.append(td)
        }
        tbody.append(tr)
      }
      table.append(thead, tbody)
      dom.append(table)
    }
    dom.append(el('div', 'rte-database-block__meta', `${rows.length} 行`))
  }

  render()

  return {
    dom,
    update(updated: PMNode) {
      current = updated
      const next = signature(updated)
      if (next === last) return true
      last = next
      render()
      return true
    },
    ignoreMutation: () => true,
    stopEvent: (event: Event) => {
      const target = event.target as HTMLElement | null
      return Boolean(target?.closest('input, button, select, textarea, label'))
    },
  }
}

function viewBtn(
  typ: DatabaseBlockViewType,
  label: string,
  active: boolean,
  enabled: boolean,
  onClick: () => void,
) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = active ? 'rte-database-block__view is-active' : 'rte-database-block__view'
  btn.textContent = label
  btn.dataset.view = typ
  btn.disabled = !enabled
  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return btn
}

function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

