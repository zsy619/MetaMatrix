import {
  cellText,
  createField,
  createRow,
  createView,
  filterRows,
  groupRows,
  migrateSheet,
  type SheetData,
  type SheetField,
  type SheetFilter,
  type SheetRow,
  type SheetView,
  type SheetViewType,
} from '../components/knowledge/sheetModel'

export const DATABASE_BLOCK_NAME = 'databaseBlock'
export const DATABASE_BLOCK_HTML_TYPE = 'database-block'

/** 内嵌数据库块自己的表格快照。与知识库树上的独立 sheet 分开存，刷新后靠 HTML 属性还原。 */
export type DatabaseBlockPayload = {
  sheet: SheetData
  activeViewId: string
}

export const DATABASE_VIEW_TYPES = ['grid', 'kanban'] as const
export type DatabaseBlockViewType = (typeof DATABASE_VIEW_TYPES)[number]

export function isDatabaseViewType(value: string): value is DatabaseBlockViewType {
  return (DATABASE_VIEW_TYPES as readonly string[]).includes(value)
}

export function defaultDatabaseSheet(): SheetData {
  const name = { ...createField('text', '名称'), width: 160 }
  const status = { ...createField('select', '状态'), options: ['未开始', '进行中', '已完成'] }
  const fields = [name, status]
  const grid = createView('grid', '表格')
  const board = createView('kanban', '看板')
  board.groupBy = status.id
  const rowA = createRow(fields)
  rowA.cells[name.id] = '示例任务'
  rowA.cells[status.id] = '进行中'
  const rowB = createRow(fields)
  rowB.cells[name.id] = '另一项'
  rowB.cells[status.id] = '未开始'
  return { fields, rows: [rowA, rowB], views: [grid, board] }
}

export function defaultDatabasePayload(): DatabaseBlockPayload {
  const sheet = defaultDatabaseSheet()
  return { sheet, activeViewId: sheet.views[0]!.id }
}

export function parseDatabasePayload(raw: unknown): DatabaseBlockPayload {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return defaultDatabasePayload()
    try {
      parsed = JSON.parse(text)
    } catch {
      return defaultDatabasePayload()
    }
  }
  if (!parsed || typeof parsed !== 'object') return defaultDatabasePayload()
  const rec = parsed as { sheet?: unknown; activeViewId?: unknown }
  const sheet = migrateSheet(rec.sheet ?? parsed)
  const views = ensureGridAndKanban(sheet)
  sheet.views = views
  const want = typeof rec.activeViewId === 'string' ? rec.activeViewId : ''
  const active = views.find((view) => view.id === want) ?? views[0]!
  return { sheet, activeViewId: active.id }
}

export function serializeDatabasePayload(payload: DatabaseBlockPayload): string {
  return JSON.stringify(payload)
}

export function payloadFromAttrs(attrs: { sheet?: string; viewType?: string }): DatabaseBlockPayload {
  const payload = parseDatabasePayload(attrs.sheet || '')
  const typ = String(attrs.viewType || '').trim()
  if (isDatabaseViewType(typ)) return setDatabaseViewType(payload, typ)
  return payload
}

export function attrsFromPayload(payload: DatabaseBlockPayload): { sheet: string; viewType: DatabaseBlockViewType } {
  const view = activeDatabaseView(payload)
  const typ: DatabaseBlockViewType = view.type === 'kanban' ? 'kanban' : 'grid'
  return { sheet: serializeDatabasePayload(payload), viewType: typ }
}

export function activeDatabaseView(payload: DatabaseBlockPayload): SheetView {
  return payload.sheet.views.find((view) => view.id === payload.activeViewId) ?? payload.sheet.views[0]!
}

export function setDatabaseViewType(payload: DatabaseBlockPayload, type: DatabaseBlockViewType): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  sheet.views = ensureGridAndKanban(sheet)
  const match = sheet.views.find((view) => (view.type === 'kanban' ? 'kanban' : 'grid') === type)
  return { sheet, activeViewId: (match ?? sheet.views[0]!).id }
}

export function setDatabaseFilters(payload: DatabaseBlockPayload, filters: SheetFilter[]): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const view = sheet.views.find((item) => item.id === payload.activeViewId) ?? sheet.views[0]!
  view.filters = filters
    .filter((item) => item.fieldId)
    .map((item) => ({
      fieldId: item.fieldId,
      op: item.op || 'contains',
      value: item.value ?? '',
    }))
  return { sheet, activeViewId: view.id }
}

export function visibleDatabaseRows(payload: DatabaseBlockPayload): SheetRow[] {
  const view = activeDatabaseView(payload)
  return filterRows(payload.sheet.rows, view.filters || [], '')
}

export function databaseGroups(payload: DatabaseBlockPayload) {
  const view = activeDatabaseView(payload)
  const field =
    payload.sheet.fields.find((item) => item.id === view.groupBy) ??
    payload.sheet.fields.find((item) => item.type === 'select') ??
    null
  return groupRows(visibleDatabaseRows(payload), field)
}

export function updateDatabaseCell(
  payload: DatabaseBlockPayload,
  rowId: string,
  fieldId: string,
  value: string,
): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const row = sheet.rows.find((item) => item.id === rowId)
  if (!row) return payload
  const field = sheet.fields.find((item) => item.id === fieldId)
  if (!field) return payload
  row.cells[fieldId] = coerceCell(field, value)
  return { sheet, activeViewId: payload.activeViewId }
}

export function firstFilterableField(payload: DatabaseBlockPayload): SheetField | undefined {
  return payload.sheet.fields.find((field) => field.type === 'text' || field.type === 'longtext') ?? payload.sheet.fields[0]
}

export function cellPreview(value: unknown): string {
  return cellText(value as never)
}

function ensureGridAndKanban(sheet: SheetData): SheetView[] {
  const views = (sheet.views || []).map((view) => ({ ...view, filters: [...(view.filters || [])] }))
  if (!views.some((view) => view.type === 'grid' || !view.type)) {
    views.unshift(createView('grid', '表格'))
  }
  if (!views.some((view) => view.type === 'kanban')) {
    const board = createView('kanban', '看板')
    const group = sheet.fields.find((field) => field.type === 'select')
    if (group) board.groupBy = group.id
    views.push(board)
  }
  return views.map((view) => ({
    ...view,
    type: (view.type === 'kanban' ? 'kanban' : 'grid') as SheetViewType,
  }))
}

function cloneSheet(sheet: SheetData): SheetData {
  return {
    fields: sheet.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
    rows: sheet.rows.map((row) => ({ id: row.id, cells: { ...row.cells } })),
    views: sheet.views.map((view) => ({ ...view, filters: [...(view.filters || [])] })),
  }
}

function coerceCell(field: SheetField, value: string) {
  if (field.type === 'checkbox') return value === 'true' || value === '是' || value === '1'
  if (field.type === 'number' || field.type === 'progress' || field.type === 'rating') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (field.type === 'multiSelect' || field.type === 'person') {
    return value.split(/[,、]/).map((part) => part.trim()).filter(Boolean)
  }
  return value
}
