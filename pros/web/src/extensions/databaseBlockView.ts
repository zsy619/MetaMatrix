import type { NodeViewRendererProps } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { FILTER_OPS, type SheetFilter, type SheetFilterOp } from '../components/knowledge/sheetModel'
import { BLOCK_IDENTITY_ATTR, readBlockId } from './blockIdentity'
import { canEditStoredBlock, guardStorageFrom } from './blockPermissionGuard'
import { DATABASE_BLOCK_SYNC_EVENT } from './databaseBlockEvents'
import { DATABASE_BLOCK_HTML_TYPE } from './databaseBlockSheet'
import {
  DATABASE_VIEW_LABELS,
  DATABASE_VIEW_TYPES,
  activeDatabaseView,
  attrsFromPayload,
  calendarGroups,
  cellPreview,
  databaseFilterJoin,
  databaseGroups,
  dateField,
  payloadFromAttrs,
  addDatabaseRow,
  removeDatabaseRow,
  setDatabaseFilterJoin,
  setDatabaseFilters,
  setDatabaseSort,
  setDatabaseViewType,
  type DatabaseBlockPayload,
  type DatabaseBlockViewType,
  type DatabaseFilterJoin,
  updateDatabaseCell,
  viewTypeOf,
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
    const currentId = readBlockId((typeof getPos === 'function' ? editor.state.doc.nodeAt(getPos() as number) : current) || current)
    if (currentId && !canEditStoredBlock(guardStorageFrom(editor), currentId)) return
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

  const emitSync = (direction: 'pull' | 'push') => {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    const sheetNodeId = String((typeof pos === 'number' && pos >= 0 ? editor.state.doc.nodeAt(pos) : current)?.attrs.sheetNodeId || current.attrs.sheetNodeId || '').trim()
    if (typeof pos !== 'number' || pos < 0 || !sheetNodeId) return
    dom.dispatchEvent(
      new CustomEvent(DATABASE_BLOCK_SYNC_EVENT, {
        bubbles: true,
        detail: { direction, sheetNodeId, pos },
      }),
    )
  }

  const render = () => {
    const payload = readPayload()
    const view = activeDatabaseView(payload)
    const typ = viewTypeOf(view)
    const title = String(current.attrs.title || '').trim() || '多维表格'
    const linked = Boolean(String(current.attrs.sheetNodeId || '').trim())
    const rows = visibleDatabaseRows(payload)
    const blockId = readBlockId(current)
    const editable = editor.isEditable && (!blockId || canEditStoredBlock(guardStorageFrom(editor), blockId))
    const join = databaseFilterJoin(payload)
    const filters = [...(view.filters || [])]

    dom.className = linked ? 'rte-database-block is-live is-linked' : 'rte-database-block is-live'
    dom.setAttribute('data-type', DATABASE_BLOCK_HTML_TYPE)
    dom.setAttribute('data-view-type', typ)
    if (current.attrs.sheet) dom.setAttribute('data-sheet', String(current.attrs.sheet))
    if (current.attrs.sheetNodeId) dom.setAttribute('data-sheet-node-id', String(current.attrs.sheetNodeId))
    if (current.attrs.title) dom.setAttribute('data-title', String(current.attrs.title))
    if (linked) dom.setAttribute('data-open-sheet', 'true')

    dom.replaceChildren()
    const head = el('div', 'rte-database-block__bar')
    head.append(el('span', 'rte-database-block__title', title))
    const views = el('div', 'rte-database-block__views')
    for (const item of DATABASE_VIEW_TYPES) {
      views.append(
        viewBtn(item, DATABASE_VIEW_LABELS[item], typ === item, editable, () =>
          writePayload(setDatabaseViewType(payload, item)),
        ),
      )
    }
    head.append(views)
    if (linked) {
      const open = el('span', 'rte-database-block__hint', '打开知识库表格')
      open.setAttribute('data-open-sheet-label', 'true')
      head.append(open)
      const sync = el('div', 'rte-database-block__sync')
      sync.append(
        syncBtn('从知识库拉取', 'pull', editable, () => emitSync('pull')),
        syncBtn('写回知识库', 'push', editable, () => emitSync('push')),
      )
      const note = el('span', 'rte-database-block__hint', '手动同步快照，不是实时双向')
      head.append(sync, note)
    }
    dom.append(head)
    dom.append(renderFilterBuilder(payload, filters, join, editable, writePayload))

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
    } else if (typ === 'gallery') {
      const gallery = el('div', 'rte-database-block__gallery')
      const titleField = payload.sheet.fields[0]
      for (const row of rows) {
        const card = el('div', 'rte-database-block__gallery-card')
        card.append(
          el(
            'div',
            'rte-database-block__gallery-title',
            titleField ? cellPreview(row.cells[titleField.id]) || '（空）' : row.id,
          ),
        )
        for (const col of payload.sheet.fields.slice(1)) {
          const line = el('div', 'rte-database-block__gallery-field')
          line.append(el('span', 'rte-database-block__gallery-label', col.name))
          line.append(document.createTextNode(cellPreview(row.cells[col.id]) || '—'))
          card.append(line)
        }
        gallery.append(card)
      }
      dom.append(gallery)
    } else if (typ === 'calendar') {
      const cal = el('div', 'rte-database-block__calendar')
      if (!dateField(payload)) {
        cal.append(el('div', 'rte-database-block__hint', '没有日期字段，无法按日历排列'))
      } else {
        for (const group of calendarGroups(payload)) {
          const day = el('div', 'rte-database-block__day')
          day.append(el('div', 'rte-database-block__day-title', group.label))
          for (const row of group.rows) {
            const card = el('div', 'rte-database-block__card')
            const main = payload.sheet.fields[0]
            card.textContent = main ? cellPreview(row.cells[main.id]) || '（空）' : row.id
            day.append(card)
          }
          cal.append(day)
        }
      }
      dom.append(cal)
    } else {
      const table = document.createElement('table')
      table.className = 'rte-database-block__grid'
      const thead = document.createElement('thead')
      const hr = document.createElement('tr')
      const view = activeDatabaseView(payload)
      for (const col of payload.sheet.fields) {
        const th = document.createElement('th')
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'rte-database-block__sort'
        const mark = view.sortBy === col.id ? (view.sortOrder === 'desc' ? ' ↓' : ' ↑') : ''
        btn.textContent = `${col.name}${mark}`
        btn.disabled = !editable
        if (view.sortBy === col.id) btn.setAttribute('aria-sort', view.sortOrder === 'desc' ? 'descending' : 'ascending')
        btn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (view.sortBy !== col.id) writePayload(setDatabaseSort(payload, col.id, 'asc'))
          else if (view.sortOrder === 'asc') writePayload(setDatabaseSort(payload, col.id, 'desc'))
          else writePayload(setDatabaseSort(payload, null))
        })
        th.append(btn)
        hr.append(th)
      }
      hr.append(el('th', '', ''))
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
        const delCell = document.createElement('td')
        const del = document.createElement('button')
        del.type = 'button'
        del.className = 'rte-database-block__filter-remove'
        del.textContent = '删除'
        del.disabled = !editable || payload.sheet.rows.length <= 1
        del.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          writePayload(removeDatabaseRow(payload, row.id))
        })
        delCell.append(del)
        tr.append(delCell)
        tbody.append(tr)
      }
      table.append(thead, tbody)
      dom.append(table)
    }
    const foot = el('div', 'rte-database-block__foot')
    foot.append(el('div', 'rte-database-block__meta', `${rows.length} 行`))
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'rte-database-block__add-row'
    add.textContent = '+ 添加记录'
    add.disabled = !editable
    add.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      writePayload(addDatabaseRow(payload))
    })
    foot.append(add)
    dom.append(foot)
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

function renderFilterBuilder(
  payload: DatabaseBlockPayload,
  filters: SheetFilter[],
  join: DatabaseFilterJoin,
  editable: boolean,
  writePayload: (payload: DatabaseBlockPayload) => void,
) {
  const box = el('div', 'rte-database-block__filters')
  const head = el('div', 'rte-database-block__filters-head')
  head.append(el('span', '', '筛选'))
  const joinBox = el('div', 'rte-database-block__join')
  joinBox.append(
    joinBtn('and', '且', join === 'and', editable, () => writePayload(setDatabaseFilterJoin(payload, 'and'))),
    joinBtn('or', '或', join === 'or', editable, () => writePayload(setDatabaseFilterJoin(payload, 'or'))),
  )
  head.append(joinBox)
  box.append(head)

  const list = filters.length ? filters : []
  for (let i = 0; i < list.length; i += 1) {
    box.append(renderFilterRow(payload, list, i, editable, writePayload))
  }
  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'rte-database-block__filter-add'
  add.textContent = '+ 添加条件'
  add.disabled = !editable || payload.sheet.fields.length === 0
  add.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const field = payload.sheet.fields[0]
    if (!field) return
    writePayload(setDatabaseFilters(payload, [...list, { fieldId: field.id, op: 'contains', value: '' }]))
  })
  box.append(add)
  return box
}

function renderFilterRow(
  payload: DatabaseBlockPayload,
  filters: SheetFilter[],
  index: number,
  editable: boolean,
  writePayload: (payload: DatabaseBlockPayload) => void,
) {
  const filter = filters[index]!
  const row = el('div', 'rte-database-block__filter-row')
  const fieldSel = document.createElement('select')
  fieldSel.className = 'rte-database-block__filter-field'
  fieldSel.disabled = !editable
  for (const field of payload.sheet.fields) {
    const opt = document.createElement('option')
    opt.value = field.id
    opt.textContent = field.name
    if (field.id === filter.fieldId) opt.selected = true
    fieldSel.append(opt)
  }
  const opSel = document.createElement('select')
  opSel.className = 'rte-database-block__filter-op'
  opSel.disabled = !editable
  for (const item of FILTER_OPS) {
    const opt = document.createElement('option')
    opt.value = item.op
    opt.textContent = item.label
    if (item.op === filter.op) opt.selected = true
    opSel.append(opt)
  }
  const value = document.createElement('input')
  value.type = 'text'
  value.className = 'rte-database-block__filter-input'
  value.value = filter.value || ''
  value.placeholder = '值'
  value.disabled = !editable || filter.op === 'empty' || filter.op === 'notEmpty'
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'rte-database-block__filter-remove'
  remove.textContent = '删除'
  remove.disabled = !editable

  const commit = () => {
    const next = filters.map((item, i) =>
      i === index
        ? {
            fieldId: fieldSel.value,
            op: opSel.value as SheetFilterOp,
            value: value.value,
          }
        : item,
    )
    writePayload(setDatabaseFilters(payload, next))
  }
  fieldSel.addEventListener('change', commit)
  opSel.addEventListener('change', commit)
  value.addEventListener('keydown', (event) => event.stopPropagation())
  value.addEventListener('change', commit)
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    writePayload(setDatabaseFilters(payload, filters.filter((_, i) => i !== index)))
  })
  row.append(fieldSel, opSel, value, remove)
  return row
}

function joinBtn(
  typ: DatabaseFilterJoin,
  label: string,
  active: boolean,
  enabled: boolean,
  onClick: () => void,
) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = active ? 'rte-database-block__join-btn is-active' : 'rte-database-block__join-btn'
  btn.textContent = label
  btn.dataset.join = typ
  btn.disabled = !enabled
  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return btn
}

function syncBtn(label: string, direction: 'pull' | 'push', enabled: boolean, onClick: () => void) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'rte-database-block__sync-btn'
  btn.textContent = label
  btn.dataset.sync = direction
  btn.disabled = !enabled
  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return btn
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
