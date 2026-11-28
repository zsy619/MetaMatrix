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
  type SheetCellValue,
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

function sortedCellMap(cells: Record<string, unknown> | undefined): Record<string, unknown> {
  const src = cells || {}
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src).sort()) out[key] = src[key]
  return out
}

function fingerprintFromParts(sheet: SheetData, stableCells: boolean): string {
  const fields = (sheet.fields || []).map((field) => ({
    id: field.id,
    type: field.type,
    name: field.name,
    options: field.options ? [...field.options] : undefined,
  }))
  const rows = (sheet.rows || []).map((row) => ({
    id: row.id,
    cells: stableCells ? sortedCellMap(row.cells) : (row.cells || {}),
  }))
  return JSON.stringify({ fields, rows })
}

/** 旧指纹：单元格键顺序随插入顺序，相同内容可能得到不同字符串。仅用于识别历史 syncedFp。 */
export function legacySheetContentFingerprint(sheet: SheetData): string {
  return fingerprintFromParts(sheet, false)
}

/** 只比较字段和行，不含视图。单元格键按名字排序，避免键顺序把相同内容判成已改。 */
export function sheetContentFingerprint(sheet: SheetData): string {
  return fingerprintFromParts(sheet, true)
}

function canonicalizeStoredFingerprint(storedFp: string): string | null {
  try {
    const parsed = JSON.parse(storedFp) as { fields?: unknown; rows?: Array<{ id?: string; cells?: Record<string, unknown> }> }
    if (!parsed || !Array.isArray(parsed.fields) || !Array.isArray(parsed.rows)) return null
    const rows = parsed.rows.map((row) => ({
      id: row.id,
      cells: sortedCellMap(row.cells),
    }))
    return JSON.stringify({ fields: parsed.fields, rows })
  } catch {
    return null
  }
}

/** 当前指纹、历史指纹，或把历史指纹的单元格键排序后，与现表一致即视为未改。 */
export function sheetFingerprintMatches(sheet: SheetData, storedFp?: string | null): boolean {
  const fp = (storedFp || '').trim()
  if (!fp) return false
  const current = sheetContentFingerprint(sheet)
  if (fp === current || fp === legacySheetContentFingerprint(sheet)) return true
  return canonicalizeStoredFingerprint(fp) === current
}

/** 对照上次成功同步的指纹，判断内嵌快照和树上表各自有没有改动。没有指纹时无法判断单边改动。 */
export type SheetDrift = 'unknown' | 'in-sync' | 'local-only' | 'remote-only' | 'both'

export function classifySheetDrift(local: SheetData, remote: SheetData, syncedFp?: string | null): SheetDrift {
  if (sheetContentFingerprint(local) === sheetContentFingerprint(remote)) return 'in-sync'
  const fp = (syncedFp || '').trim()
  if (!fp) return 'unknown'
  const localChanged = !sheetFingerprintMatches(local, fp)
  const remoteChanged = !sheetFingerprintMatches(remote, fp)
  if (localChanged && remoteChanged) return 'both'
  if (localChanged) return 'local-only'
  if (remoteChanged) return 'remote-only'
  return 'in-sync'
}

export type SheetThreeWaySummary = {
  localOnlyFields: number
  remoteOnlyFields: number
  conflictFields: number
  localOnlyRows: number
  remoteOnlyRows: number
  conflictRows: number
  localOnlyCells: number
  remoteOnlyCells: number
  conflictCells: number
  autoMergeable: boolean
}

export type SheetContentConflictSummary = {
  localOnlyFields: number
  remoteOnlyFields: number
  changedFields: number
  localOnlyRows: number
  remoteOnlyRows: number
  changedRows: number
  changedCells: number
  /** 有上次同步基线时，按单元格/字段做三方对照；不相交时才可自动合并。 */
  threeWay?: SheetThreeWaySummary
}

function fieldSignature(field: { id: string; type: string; name: string; options?: string[] }): string {
  return JSON.stringify({
    type: field.type,
    name: field.name,
    options: field.options ? [...field.options] : undefined,
  })
}

function cellSignature(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** 按字段/行 ID 统计双边各改了什么。只是对照摘要，不是自动合并。 */
export function summarizeSheetContentConflict(local: SheetData, remote: SheetData): SheetContentConflictSummary {
  const localFields = new Map((local.fields || []).map((field) => [field.id, field]))
  const remoteFields = new Map((remote.fields || []).map((field) => [field.id, field]))
  let localOnlyFields = 0
  let remoteOnlyFields = 0
  let changedFields = 0
  for (const [id, field] of localFields) {
    const other = remoteFields.get(id)
    if (!other) localOnlyFields += 1
    else if (fieldSignature(field) !== fieldSignature(other)) changedFields += 1
  }
  for (const id of remoteFields.keys()) {
    if (!localFields.has(id)) remoteOnlyFields += 1
  }
  const localRows = new Map((local.rows || []).map((row) => [row.id, row]))
  const remoteRows = new Map((remote.rows || []).map((row) => [row.id, row]))
  let localOnlyRows = 0
  let remoteOnlyRows = 0
  let changedRows = 0
  let changedCells = 0
  for (const [id, row] of localRows) {
    const other = remoteRows.get(id)
    if (!other) {
      localOnlyRows += 1
      continue
    }
    const keys = new Set([...Object.keys(row.cells || {}), ...Object.keys(other.cells || {})])
    let cells = 0
    for (const key of keys) {
      if (cellSignature((row.cells || {})[key]) !== cellSignature((other.cells || {})[key])) cells += 1
    }
    if (cells) {
      changedRows += 1
      changedCells += cells
    }
  }
  for (const id of remoteRows.keys()) {
    if (!localRows.has(id)) remoteOnlyRows += 1
  }
  return {
    localOnlyFields,
    remoteOnlyFields,
    changedFields,
    localOnlyRows,
    remoteOnlyRows,
    changedRows,
    changedCells,
  }
}

export function describeSheetContentConflict(summary: SheetContentConflictSummary): string {
  if (summary.threeWay) return describeSheetThreeWay(summary.threeWay)
  const parts: string[] = []
  if (summary.localOnlyFields) parts.push(`仅内嵌多 ${summary.localOnlyFields} 个字段`)
  if (summary.remoteOnlyFields) parts.push(`树上多 ${summary.remoteOnlyFields} 个字段`)
  if (summary.changedFields) parts.push(`${summary.changedFields} 个字段定义不同`)
  if (summary.localOnlyRows) parts.push(`仅内嵌多 ${summary.localOnlyRows} 行`)
  if (summary.remoteOnlyRows) parts.push(`树上多 ${summary.remoteOnlyRows} 行`)
  if (summary.changedRows) parts.push(`${summary.changedRows} 行内容不同（${summary.changedCells} 个单元格）`)
  if (!parts.length) return '两边字段与行已不一致，需确认后才会覆盖，不会自动合并。'
  return `两边都改过：${parts.join('，')}。需确认后才会覆盖，不会自动合并。`
}

/** 从上次成功同步的指纹还原字段和行，作为三方对照的基线。解析不了则无法判断相交改动。 */
export function sheetContentFromFingerprint(storedFp?: string | null): { fields: SheetField[]; rows: SheetRow[] } | null {
  const fp = (storedFp || '').trim()
  if (!fp) return null
  try {
    const parsed = JSON.parse(fp) as { fields?: unknown; rows?: unknown }
    if (!parsed || !Array.isArray(parsed.fields) || !Array.isArray(parsed.rows)) return null
    const fields: SheetField[] = []
    for (const raw of parsed.fields) {
      if (!raw || typeof raw !== 'object') return null
      const field = raw as Partial<SheetField>
      if (!field.id || !field.type || !field.name) return null
      fields.push({
        id: String(field.id),
        type: field.type,
        name: String(field.name),
        options: field.options ? [...field.options] : undefined,
      })
    }
    const rows: SheetRow[] = []
    for (const raw of parsed.rows) {
      if (!raw || typeof raw !== 'object') return null
      const row = raw as { id?: string; cells?: Record<string, unknown> }
      if (!row.id) return null
      const cells: Record<string, SheetCellValue> = {}
      for (const [key, value] of Object.entries(row.cells || {})) {
        cells[key] = value as SheetCellValue
      }
      rows.push({ id: String(row.id), cells })
    }
    return { fields, rows }
  } catch {
    return null
  }
}

function cloneField(field: SheetField): SheetField {
  return { ...field, options: field.options ? [...field.options] : undefined }
}

function cloneRow(row: SheetRow): SheetRow {
  return { id: row.id, cells: { ...row.cells } }
}

function emptySummary(): SheetThreeWaySummary {
  return {
    localOnlyFields: 0,
    remoteOnlyFields: 0,
    conflictFields: 0,
    localOnlyRows: 0,
    remoteOnlyRows: 0,
    conflictRows: 0,
    localOnlyCells: 0,
    remoteOnlyCells: 0,
    conflictCells: 0,
    autoMergeable: true,
  }
}

type ThreeWayMerge = {
  summary: SheetThreeWaySummary
  fields: SheetField[]
  rows: SheetRow[]
}

function classifyAndMergeAgainstBase(
  local: SheetData,
  remote: SheetData,
  base: { fields: SheetField[]; rows: SheetRow[] },
): ThreeWayMerge {
  const summary = emptySummary()
  const baseFields = new Map(base.fields.map((field) => [field.id, field]))
  const localFields = new Map((local.fields || []).map((field) => [field.id, field]))
  const remoteFields = new Map((remote.fields || []).map((field) => [field.id, field]))
  const fieldIds: string[] = []
  const seenFields = new Set<string>()
  for (const field of [...(remote.fields || []), ...(local.fields || []), ...base.fields]) {
    if (seenFields.has(field.id)) continue
    seenFields.add(field.id)
    fieldIds.push(field.id)
  }
  const mergedFields: SheetField[] = []
  for (const id of fieldIds) {
    const baseField = baseFields.get(id)
    const localField = localFields.get(id)
    const remoteField = remoteFields.get(id)
    if (baseField) {
      const localChanged = !!localField && fieldSignature(localField) !== fieldSignature(baseField)
      const remoteChanged = !!remoteField && fieldSignature(remoteField) !== fieldSignature(baseField)
      const localDeleted = !localField
      const remoteDeleted = !remoteField
      if (localDeleted && remoteDeleted) continue
      if (localDeleted && remoteChanged) {
        summary.conflictFields += 1
        continue
      }
      if (remoteDeleted && localChanged) {
        summary.conflictFields += 1
        continue
      }
      if (localDeleted) continue
      if (remoteDeleted) continue
      if (localChanged && remoteChanged && fieldSignature(localField!) !== fieldSignature(remoteField!)) {
        summary.conflictFields += 1
        continue
      }
      if (localChanged && !remoteChanged) summary.localOnlyFields += 1
      else if (remoteChanged && !localChanged) summary.remoteOnlyFields += 1
      mergedFields.push(cloneField(remoteChanged ? remoteField! : localField!))
      continue
    }
    if (localField && remoteField) {
      if (fieldSignature(localField) !== fieldSignature(remoteField)) {
        summary.conflictFields += 1
        continue
      }
      summary.localOnlyFields += 1
      summary.remoteOnlyFields += 1
      mergedFields.push(cloneField(remoteField))
      continue
    }
    if (localField) {
      summary.localOnlyFields += 1
      mergedFields.push(cloneField(localField))
      continue
    }
    if (remoteField) {
      summary.remoteOnlyFields += 1
      mergedFields.push(cloneField(remoteField))
    }
  }

  const baseRows = new Map(base.rows.map((row) => [row.id, row]))
  const localRows = new Map((local.rows || []).map((row) => [row.id, row]))
  const remoteRows = new Map((remote.rows || []).map((row) => [row.id, row]))
  const rowIds: string[] = []
  const seenRows = new Set<string>()
  for (const row of [...(remote.rows || []), ...(local.rows || []), ...base.rows]) {
    if (seenRows.has(row.id)) continue
    seenRows.add(row.id)
    rowIds.push(row.id)
  }
  const mergedRows: SheetRow[] = []
  for (const id of rowIds) {
    const baseRow = baseRows.get(id)
    const localRow = localRows.get(id)
    const remoteRow = remoteRows.get(id)
    if (baseRow) {
      const localDeleted = !localRow
      const remoteDeleted = !remoteRow
      if (localDeleted && remoteDeleted) continue
      const localRowChanged = !!localRow && rowSignature(localRow) !== rowSignature(baseRow)
      const remoteRowChanged = !!remoteRow && rowSignature(remoteRow) !== rowSignature(baseRow)
      if (localDeleted && remoteRowChanged) {
        summary.conflictRows += 1
        continue
      }
      if (remoteDeleted && localRowChanged) {
        summary.conflictRows += 1
        continue
      }
      if (localDeleted || remoteDeleted) {
        if (localDeleted) summary.localOnlyRows += 1
        if (remoteDeleted) summary.remoteOnlyRows += 1
        continue
      }
      const mergedCells: Record<string, SheetCellValue> = {}
      const keys = new Set([
        ...Object.keys(baseRow.cells || {}),
        ...Object.keys(localRow!.cells || {}),
        ...Object.keys(remoteRow!.cells || {}),
      ])
      let rowConflict = false
      for (const key of keys) {
        const baseVal = (baseRow.cells || {})[key]
        const localVal = (localRow!.cells || {})[key]
        const remoteVal = (remoteRow!.cells || {})[key]
        const localChanged = cellSignature(localVal) !== cellSignature(baseVal)
        const remoteChanged = cellSignature(remoteVal) !== cellSignature(baseVal)
        if (localChanged && remoteChanged && cellSignature(localVal) !== cellSignature(remoteVal)) {
          summary.conflictCells += 1
          rowConflict = true
          mergedCells[key] = remoteVal
          continue
        }
        if (localChanged && !remoteChanged) summary.localOnlyCells += 1
        else if (remoteChanged && !localChanged) summary.remoteOnlyCells += 1
        mergedCells[key] = remoteChanged ? remoteVal : localVal
      }
      if (rowConflict) continue
      mergedRows.push({ id, cells: mergedCells })
      continue
    }
    if (localRow && remoteRow) {
      if (rowSignature(localRow) !== rowSignature(remoteRow)) {
        summary.conflictRows += 1
        continue
      }
      summary.localOnlyRows += 1
      summary.remoteOnlyRows += 1
      mergedRows.push(cloneRow(remoteRow))
      continue
    }
    if (localRow) {
      summary.localOnlyRows += 1
      mergedRows.push(cloneRow(localRow))
      continue
    }
    if (remoteRow) {
      summary.remoteOnlyRows += 1
      mergedRows.push(cloneRow(remoteRow))
    }
  }

  summary.autoMergeable = summary.conflictFields === 0 && summary.conflictRows === 0 && summary.conflictCells === 0
  return { summary, fields: mergedFields, rows: mergedRows }
}

function rowSignature(row: SheetRow): string {
  return JSON.stringify({ id: row.id, cells: sortedCellMap(row.cells) })
}

/** 相对上次同步基线，统计不相交改动与相交冲突。没有基线时返回 null。 */
export function classifySheetThreeWay(local: SheetData, remote: SheetData, syncedFp?: string | null): SheetThreeWaySummary | null {
  const base = sheetContentFromFingerprint(syncedFp)
  if (!base) return null
  return classifyAndMergeAgainstBase(local, remote, base).summary
}

/** 不相交的字段/行/单元格改动合成一份快照；有相交冲突或没有基线时返回 null。树上视图保留在结果里，内嵌视图由拉取逻辑自行保留。不是实时双向同步。 */
export function mergeSheetNonOverlapping(local: SheetData, remote: SheetData, syncedFp?: string | null): SheetData | null {
  const base = sheetContentFromFingerprint(syncedFp)
  if (!base) return null
  const result = classifyAndMergeAgainstBase(local, remote, base)
  if (!result.summary.autoMergeable) return null
  return {
    fields: result.fields,
    rows: result.rows,
    views: (remote.views || []).map((view) => ({
      ...view,
      filters: [...(view.filters || [])],
    })),
  }
}

export function describeSheetThreeWay(summary: SheetThreeWaySummary): string {
  const parts: string[] = []
  if (summary.localOnlyFields) parts.push(`仅内嵌多或改 ${summary.localOnlyFields} 个字段`)
  if (summary.remoteOnlyFields) parts.push(`树上多或改 ${summary.remoteOnlyFields} 个字段`)
  if (summary.conflictFields) parts.push(`${summary.conflictFields} 个字段两边都改且不一致`)
  if (summary.localOnlyRows) parts.push(`仅内嵌增删 ${summary.localOnlyRows} 行`)
  if (summary.remoteOnlyRows) parts.push(`树上增删 ${summary.remoteOnlyRows} 行`)
  if (summary.conflictRows) parts.push(`${summary.conflictRows} 行删除与改动冲突`)
  if (summary.localOnlyCells) parts.push(`仅内嵌改 ${summary.localOnlyCells} 个单元格`)
  if (summary.remoteOnlyCells) parts.push(`树上改 ${summary.remoteOnlyCells} 个单元格`)
  if (summary.conflictCells) parts.push(`${summary.conflictCells} 个单元格两边都改且不一致`)
  const head = parts.length ? `两边都改过：${parts.join('，')}。` : '两边都改过。'
  if (summary.autoMergeable) return `${head}不相交的改动会自动合并到两边。不是实时双向同步。`
  return `${head}有相交改动，需确认后才会覆盖，不会自动合并。`
}

export function sheetsDiverged(local: SheetData, remote: SheetData, syncedFp?: string | null): boolean {
  return classifySheetDrift(local, remote, syncedFp) === 'both'
}

export function unsafeSyncDirection(direction: 'pull' | 'push', drift: SheetDrift): boolean {
  if (drift === 'both') return true
  if (direction === 'pull' && drift === 'local-only') return true
  if (direction === 'push' && drift === 'remote-only') return true
  return false
}

export function currentCalendarMonth(now = new Date()): string {
  return formatCalendarMonth(now.getFullYear(), now.getMonth() + 1)
}

export function currentCalendarDay(now = new Date()): string {
  return `${currentCalendarMonth(now)}-${String(now.getDate()).padStart(2, '0')}`
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
