import {
  cellText,
  createField,
  createRow,
  calendarBuckets,
  calendarMonthDays,
  createView,
  FILTER_OPS,
  filterRows,
  groupRows,
  sortRows,
  migrateSheet,
  type SheetData,
  type SheetField,
  type SheetFilter,
  type SheetFilterOp,
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

export const DATABASE_VIEW_TYPES = ['grid', 'kanban', 'gallery', 'calendar'] as const
export type DatabaseBlockViewType = (typeof DATABASE_VIEW_TYPES)[number]

export const DATABASE_VIEW_LABELS: Record<DatabaseBlockViewType, string> = {
  grid: '表格',
  kanban: '看板',
  gallery: '画廊',
  calendar: '日历',
}

export type DatabaseFilterJoin = 'and' | 'or'

export const DATABASE_FILTER_OPS = FILTER_OPS

export function isDatabaseViewType(value: string): value is DatabaseBlockViewType {
  return (DATABASE_VIEW_TYPES as readonly string[]).includes(value)
}

export function isFilterJoin(value: string): value is DatabaseFilterJoin {
  return value === 'and' || value === 'or'
}

export function defaultDatabaseSheet(): SheetData {
  const name = { ...createField('text', '名称'), width: 160 }
  const status = { ...createField('select', '状态'), options: ['未开始', '进行中', '已完成'] }
  const due = { ...createField('date', '截止日期'), width: 140 }
  const fields = [name, status, due]
  const grid = createView('grid', '表格')
  const board = createView('kanban', '看板')
  board.groupBy = status.id
  const gallery = createView('gallery', '画廊')
  const calendar = createView('calendar', '日历')
  calendar.groupBy = due.id
  const rowA = createRow(fields)
  rowA.cells[name.id] = '示例任务'
  rowA.cells[status.id] = '进行中'
  rowA.cells[due.id] = '2026-11-27'
  const rowB = createRow(fields)
  rowB.cells[name.id] = '另一项'
  rowB.cells[status.id] = '未开始'
  rowB.cells[due.id] = '2026-12-01'
  return { fields, rows: [rowA, rowB], views: [grid, board, gallery, calendar] }
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
  const views = ensureDatabaseViews(sheet)
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
  return { sheet: serializeDatabasePayload(payload), viewType: viewTypeOf(activeDatabaseView(payload)) }
}

export function activeDatabaseView(payload: DatabaseBlockPayload): SheetView {
  return payload.sheet.views.find((view) => view.id === payload.activeViewId) ?? payload.sheet.views[0]!
}

export function viewTypeOf(view: SheetView): DatabaseBlockViewType {
  return isDatabaseViewType(view.type) ? view.type : 'grid'
}

export function setDatabaseViewType(payload: DatabaseBlockPayload, type: DatabaseBlockViewType): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  sheet.views = ensureDatabaseViews(sheet)
  const match = sheet.views.find((view) => viewTypeOf(view) === type)
  return { sheet, activeViewId: (match ?? sheet.views[0]!).id }
}

export function normalizeFilters(filters: SheetFilter[]): SheetFilter[] {
  return filters
    .filter((item) => item.fieldId)
    .map((item) => ({
      fieldId: item.fieldId,
      op: normalizeFilterOp(item.op),
      value: item.value ?? '',
    }))
}

export function setDatabaseFilters(payload: DatabaseBlockPayload, filters: SheetFilter[]): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const view = sheet.views.find((item) => item.id === payload.activeViewId) ?? sheet.views[0]!
  view.filters = normalizeFilters(filters)
  return { sheet, activeViewId: view.id }
}

export function setDatabaseFilterJoin(payload: DatabaseBlockPayload, join: DatabaseFilterJoin): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const view = sheet.views.find((item) => item.id === payload.activeViewId) ?? sheet.views[0]!
  view.filterJoin = join
  return { sheet, activeViewId: view.id }
}

export function databaseFilterJoin(payload: DatabaseBlockPayload): DatabaseFilterJoin {
  const join = activeDatabaseView(payload).filterJoin
  return join === 'or' ? 'or' : 'and'
}

export function setDatabaseSort(
  payload: DatabaseBlockPayload,
  fieldId: string | null,
  order: 'asc' | 'desc' = 'asc',
): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const view = sheet.views.find((item) => item.id === payload.activeViewId) ?? sheet.views[0]!
  view.sortBy = fieldId
  view.sortOrder = fieldId ? order : 'asc'
  return { sheet, activeViewId: view.id }
}

export function visibleDatabaseRows(payload: DatabaseBlockPayload): SheetRow[] {
  const view = activeDatabaseView(payload)
  const filtered = filterRows(payload.sheet.rows, view.filters || [], '', databaseFilterJoin(payload))
  return sortRows(filtered, view.sortBy, view.sortOrder)
}

export function databaseGroups(payload: DatabaseBlockPayload) {
  const view = activeDatabaseView(payload)
  const field =
    payload.sheet.fields.find((item) => item.id === view.groupBy) ??
    payload.sheet.fields.find((item) => item.type === 'select') ??
    null
  return groupRows(visibleDatabaseRows(payload), field)
}

export function dateField(payload: DatabaseBlockPayload): SheetField | undefined {
  const view = activeDatabaseView(payload)
  return (
    payload.sheet.fields.find((item) => item.id === view.groupBy && item.type === 'date') ??
    payload.sheet.fields.find((item) => item.type === 'date')
  )
}

export function calendarGroups(payload: DatabaseBlockPayload) {
  const field = dateField(payload)
  const rows = visibleDatabaseRows(payload)
  const map = new Map<string, { key: string; label: string; rows: SheetRow[] }>()
  for (const row of rows) {
    const key = field ? cellText(row.cells[field.id]).trim() : ''
    const label = key || '未定日期'
    const group = map.get(key) ?? { key, label, rows: [] }
    group.rows.push(row)
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => {
    if (!a.key) return 1
    if (!b.key) return -1
    return a.key.localeCompare(b.key)
  })
}


export function parseCalendarMonth(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec((value || '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

export function formatCalendarMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function shiftCalendarMonth(yearMonth: string, delta: number): string {
  const parsed = parseCalendarMonth(yearMonth) ?? { year: 2026, month: 11 }
  const next = new Date(parsed.year, parsed.month - 1 + delta, 1)
  return formatCalendarMonth(next.getFullYear(), next.getMonth() + 1)
}

export function defaultCalendarMonth(payload: DatabaseBlockPayload): string {
  const stored = parseCalendarMonth(activeDatabaseView(payload).calendarMonth)
  if (stored) return formatCalendarMonth(stored.year, stored.month)
  const field = dateField(payload)
  if (field) {
    for (const row of visibleDatabaseRows(payload)) {
      const day = cellText(row.cells[field.id]).trim().slice(0, 10)
      const parsed = parseCalendarMonth(day.slice(0, 7))
      if (parsed) return formatCalendarMonth(parsed.year, parsed.month)
    }
  }
  const now = new Date()
  return formatCalendarMonth(now.getFullYear(), now.getMonth() + 1)
}

export function setDatabaseCalendarMonth(payload: DatabaseBlockPayload, yearMonth: string): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  const view = sheet.views.find((item) => item.id === payload.activeViewId) ?? sheet.views[0]!
  view.calendarMonth = parseCalendarMonth(yearMonth)
    ? yearMonth
    : defaultCalendarMonth({ sheet, activeViewId: view.id })
  return { sheet, activeViewId: view.id }
}

export type CalendarMonthCell = {
  date: string
  day: number | null
  inMonth: boolean
  rows: SheetRow[]
}

export function calendarMonthMatrix(payload: DatabaseBlockPayload, yearMonth?: string): {
  yearMonth: string
  label: string
  weeks: CalendarMonthCell[][]
  undated: number
} {
  const field = dateField(payload)
  const ym = parseCalendarMonth(yearMonth) ? yearMonth! : defaultCalendarMonth(payload)
  const parsed = parseCalendarMonth(ym) ?? { year: 2026, month: 11 }
  const rows = visibleDatabaseRows(payload)
  const buckets = calendarBuckets(rows, field?.id ?? null)
  let undated = 0
  if (field) {
    for (const row of rows) {
      if (!cellText(row.cells[field.id]).trim().slice(0, 10)) undated += 1
    }
  } else {
    undated = rows.length
  }
  const days = calendarMonthDays(parsed.year, parsed.month - 1)
  const cells: CalendarMonthCell[] = days.map((date) => ({
    date,
    day: date ? Number(date.slice(-2)) : null,
    inMonth: Boolean(date),
    rows: date ? (buckets.get(date) ?? []) : [],
  }))
  const weeks: CalendarMonthCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return {
    yearMonth: formatCalendarMonth(parsed.year, parsed.month),
    label: `${parsed.year} 年 ${parsed.month} 月`,
    weeks,
    undated,
  }
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

export function addDatabaseRow(payload: DatabaseBlockPayload): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  sheet.rows = [...sheet.rows, createRow(sheet.fields)]
  return { sheet, activeViewId: payload.activeViewId }
}

export function removeDatabaseRow(payload: DatabaseBlockPayload, rowId: string): DatabaseBlockPayload {
  const sheet = cloneSheet(payload.sheet)
  if (sheet.rows.length <= 1) return payload
  const next = sheet.rows.filter((row) => row.id !== rowId)
  if (next.length === sheet.rows.length) return payload
  sheet.rows = next
  return { sheet, activeViewId: payload.activeViewId }
}

export function firstFilterableField(payload: DatabaseBlockPayload): SheetField | undefined {
  return payload.sheet.fields.find((field) => field.type === 'text' || field.type === 'longtext') ?? payload.sheet.fields[0]
}

export function cellPreview(value: unknown): string {
  return cellText(value as never)
}

export function cloneSheet(sheet: SheetData): SheetData {
  return {
    fields: sheet.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
    rows: sheet.rows.map((row) => ({ id: row.id, cells: { ...row.cells } })),
    views: sheet.views.map((view) => ({
      ...view,
      filters: [...(view.filters || [])],
      filterJoin: view.filterJoin,
    })),
  }
}

/** 用树上表的字段和行覆盖内嵌快照，尽量保留当前视图、筛选和且/或。不是实时双向同步。 */

export function countViewFilters(sheet: SheetData): number {
  return (sheet.views || []).reduce((n, view) => n + (view.filters || []).length, 0)
}

export function pullSheetIntoPayload(payload: DatabaseBlockPayload, tree: SheetData): DatabaseBlockPayload {
  const incoming = migrateSheet(tree)
  const sheet = cloneSheet(payload.sheet)
  sheet.fields = incoming.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }))
  sheet.rows = incoming.rows.map((row) => ({ id: row.id, cells: { ...row.cells } }))
  const ids = new Set(sheet.fields.map((field) => field.id))
  sheet.views = ensureDatabaseViews(sheet).map((view) => ({
    ...view,
    groupBy: view.groupBy && ids.has(view.groupBy) ? view.groupBy : defaultGroupBy(sheet, view.type),
    sortBy: view.sortBy && ids.has(view.sortBy) ? view.sortBy : null,
    filters: (view.filters || []).filter((item) => ids.has(item.fieldId)),
  }))
  const active = sheet.views.find((view) => view.id === payload.activeViewId) ?? sheet.views[0]!
  return { sheet, activeViewId: active.id }
}

/** 把内嵌快照的字段和行写回树上表，保留树上已有视图。不是实时双向同步。 */
export function pushSheetFromPayload(payload: DatabaseBlockPayload, tree: SheetData): SheetData {
  const incoming = migrateSheet(tree)
  const ids = new Set(payload.sheet.fields.map((field) => field.id))
  const views = (incoming.views.length ? incoming.views : [createView('grid', '表格视图')]).map((view) => ({
    ...view,
    filters: [...(view.filters || [])].filter((item) => ids.has(item.fieldId)),
    groupBy: view.groupBy && ids.has(view.groupBy) ? view.groupBy : view.groupBy,
    filterJoin: view.filterJoin,
  }))
  return {
    fields: payload.sheet.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
    rows: payload.sheet.rows.map((row) => ({ id: row.id, cells: { ...row.cells } })),
    views,
  }
}

function ensureDatabaseViews(sheet: SheetData): SheetView[] {
  const views: SheetView[] = (sheet.views || []).map((view) => ({
    ...view,
    type: normalizeViewType(view.type),
    filters: [...(view.filters || [])],
    filterJoin: view.filterJoin === 'or' ? 'or' : 'and',
  }))
  const add = (type: DatabaseBlockViewType, name: string, groupBy?: string) => {
    if (views.some((view) => viewTypeOf(view) === type)) return
    const view = createView(type, name)
    if (groupBy) view.groupBy = groupBy
    views.push(view)
  }
  add('grid', '表格')
  add('kanban', '看板', sheet.fields.find((field) => field.type === 'select')?.id)
  add('gallery', '画廊')
  add('calendar', '日历', sheet.fields.find((field) => field.type === 'date')?.id)
  return views
}

function defaultGroupBy(sheet: SheetData, type: SheetViewType): string | null {
  if (type === 'kanban') return sheet.fields.find((field) => field.type === 'select')?.id ?? null
  if (type === 'calendar') return sheet.fields.find((field) => field.type === 'date')?.id ?? null
  return null
}

function normalizeViewType(type: string | undefined): SheetViewType {
  if (isDatabaseViewType(type || '')) return type as DatabaseBlockViewType
  return 'grid'
}

function normalizeFilterOp(op: string | undefined): SheetFilterOp {
  return FILTER_OPS.some((item) => item.op === op) ? (op as SheetFilterOp) : 'contains'
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
