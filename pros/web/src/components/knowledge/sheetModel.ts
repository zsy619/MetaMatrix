/** 多维表格（飞书 Bitable）数据模型：字段、记录、视图。节点数据整块存在 knowledge_node_data.data。 */

export type SheetFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'date'
  | 'select'
  | 'multiSelect'
  | 'checkbox'
  | 'link'
  | 'progress'
  | 'rating'
  | 'person'

export type SheetCellValue = string | number | boolean | string[] | null

export type SheetField = {
  id: string
  name: string
  type: SheetFieldType
  /** 单选 / 多选的候选项 */
  options?: string[]
  /** 列宽（px） */
  width?: number
}

export type SheetRow = {
  id: string
  cells: Record<string, SheetCellValue>
}

export type SheetFilterOp = 'contains' | 'is' | 'isNot' | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte'

export type SheetFilter = {
  fieldId: string
  op: SheetFilterOp
  value: string
}

export type SheetViewType = 'grid' | 'kanban' | 'gallery' | 'calendar'

export type SheetFilterJoin = 'and' | 'or'

export type SheetView = {
  id: string
  name: string
  type: SheetViewType
  filters: SheetFilter[]
  /** 多条件组合方式；缺省为且。 */
  filterJoin?: SheetFilterJoin
  /** 排序字段 id */
  sortBy: string | null
  sortOrder: 'asc' | 'desc'
  /** 分组字段 id（看板按它分列，表格按它分组） */
  groupBy: string | null
}

export type SheetData = {
  fields: SheetField[]
  rows: SheetRow[]
  views: SheetView[]
}

export type FieldTypeMeta = {
  type: SheetFieldType
  label: string
  icon: string
  /** 该类型是否带候选项 */
  options?: boolean
  /** 该类型是否支持多值 */
  multiple?: boolean
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'text', label: '文本', icon: '📝' },
  { type: 'longtext', label: '多行文本', icon: '🗒️' },
  { type: 'number', label: '数字', icon: '#️⃣' },
  { type: 'date', label: '日期', icon: '📅' },
  { type: 'select', label: '单选', icon: '🔵', options: true },
  { type: 'multiSelect', label: '多选', icon: '🏷️', options: true, multiple: true },
  { type: 'checkbox', label: '复选框', icon: '☑️' },
  { type: 'link', label: '链接', icon: '🔗' },
  { type: 'progress', label: '进度', icon: '📊' },
  { type: 'rating', label: '星级', icon: '⭐' },
  { type: 'person', label: '人员', icon: '👤', multiple: true },
]

export const FILTER_OPS: Array<{ op: SheetFilterOp; label: string }> = [
  { op: 'contains', label: '包含' },
  { op: 'is', label: '等于' },
  { op: 'isNot', label: '不等于' },
  { op: 'empty', label: '为空' },
  { op: 'notEmpty', label: '不为空' },
  { op: 'gt', label: '大于' },
  { op: 'gte', label: '大于等于' },
  { op: 'lt', label: '小于' },
  { op: 'lte', label: '小于等于' },
]

export function fieldMeta(type: SheetFieldType): FieldTypeMeta {
  return FIELD_TYPES.find((m) => m.type === type) ?? FIELD_TYPES[0]
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

export function defaultValue(type: SheetFieldType): SheetCellValue {
  switch (type) {
    case 'checkbox':
      return false
    case 'number':
    case 'progress':
    case 'rating':
      return 0
    case 'multiSelect':
    case 'person':
      return []
    default:
      return ''
  }
}

export function createField(type: SheetFieldType, name?: string): SheetField {
  const meta = fieldMeta(type)
  return {
    id: uid('f'),
    name: name ?? meta.label,
    type,
    options: meta.options ? ['选项 1', '选项 2'] : undefined,
    width: type === 'longtext' ? 220 : 140,
  }
}

export function createRow(fields: SheetField[]): SheetRow {
  const cells: Record<string, SheetCellValue> = {}
  for (const f of fields) cells[f.id] = defaultValue(f.type)
  return { id: uid('r'), cells }
}

export function createView(type: SheetViewType, name: string): SheetView {
  return { id: uid('v'), name, type, filters: [], sortBy: null, sortOrder: 'asc', groupBy: null }
}

export function emptySheet(): SheetData {
  return {
    fields: [
      { ...createField('text', '名称'), width: 180 },
      { ...createField('select', '状态'), options: ['未开始', '进行中', '已完成'] },
      { ...createField('person', '负责人'), width: 160 },
      { ...createField('date', '截止日期'), width: 140 },
    ],
    rows: [createRow([])],
    views: [createView('grid', '表格视图')],
  }
}

/** 兼容旧版 { columns: string[], rows: string[][] } 结构。 */
export function migrateSheet(raw: unknown): SheetData {
  const data = raw as Partial<SheetData> & { columns?: string[]; legacyRows?: string[][] }
  if (!data || !Array.isArray(data.fields)) {
    const columns = Array.isArray(data?.columns) ? data.columns : []
    const fields: SheetField[] = columns.map((name, i) => ({
      ...createField('text', name || `列 ${i + 1}`),
      id: `f_legacy_${i}`,
    }))
    const legacy = (raw as { rows?: string[][] })?.rows
    const rows: SheetRow[] = (Array.isArray(legacy) ? legacy : []).map((cells) => {
      const row = createRow(fields)
      cells.forEach((v, i) => {
        const f = fields[i]
        if (f) row.cells[f.id] = v ?? ''
      })
      return row
    })
    const view = createView('grid', '表格视图')
    if (!rows.length) rows.push(createRow(fields))
    return { fields, rows, views: [view] }
  }
  const fields = data.fields
  const rows = (Array.isArray(data.rows) ? data.rows : []).map((row) => ({
    id: row.id || uid('r'),
    cells: row.cells || {},
  }))
  const views = Array.isArray(data.views) && data.views.length ? data.views : [createView('grid', '表格视图')]
  if (!rows.length) rows.push(createRow(fields))
  return { fields, rows, views }
}

/** 单元格转成可读文本（筛选、搜索、看板卡片用）。 */
export function cellText(value: SheetCellValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '是' : ''
  return String(value)
}

export function matchesFilter(row: SheetRow, filter: SheetFilter): boolean {
  const text = cellText(row.cells[filter.fieldId])
  const needle = (filter.value || '').trim()
  switch (filter.op) {
    case 'contains':
      return text.toLowerCase().includes(needle.toLowerCase())
    case 'is':
      return text === needle
    case 'isNot':
      return text !== needle
    case 'empty':
      return text === ''
    case 'notEmpty':
      return text !== ''
    case 'gt':
      return compareCell(text, needle) > 0
    case 'gte':
      return compareCell(text, needle) >= 0
    case 'lt':
      return compareCell(text, needle) < 0
    case 'lte':
      return compareCell(text, needle) <= 0
    default:
      return true
  }
}

function compareCell(text: string, needle: string): number {
  if (text === '' || needle === '') return text === needle ? 0 : text === '' ? -1 : 1
  const left = Number(text)
  const right = Number(needle)
  if (text.trim() !== '' && needle.trim() !== '' && Number.isFinite(left) && Number.isFinite(right)) return left - right
  return text.localeCompare(needle, 'zh-CN')
}

export function filterRows(
  rows: SheetRow[],
  filters: SheetFilter[],
  keyword: string,
  join: SheetFilterJoin = 'and',
): SheetRow[] {
  const kw = keyword.trim().toLowerCase()
  const active = filters.filter((f) => f.fieldId)
  return rows.filter((row) => {
    if (active.length) {
      const matched = active.map((f) => matchesFilter(row, f))
      const pass = join === 'or' ? matched.some(Boolean) : matched.every(Boolean)
      if (!pass) return false
    }
    if (!kw) return true
    return Object.values(row.cells).some((v) => cellText(v).toLowerCase().includes(kw))
  })
}

export function sortRows(rows: SheetRow[], fieldId: string | null, order: 'asc' | 'desc'): SheetRow[] {
  if (!fieldId) return rows
  const dir = order === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = cellText(a.cells[fieldId])
    const bv = cellText(b.cells[fieldId])
    const an = Number(av)
    const bn = Number(bv)
    if (av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir
    return av.localeCompare(bv, 'zh-CN') * dir
  })
}

export type SheetGroup = {
  key: string
  label: string
  rows: SheetRow[]
}

/** 按字段分组：单选/多选取首个值，其余按字段文本分组。 */
export function groupRows(rows: SheetRow[], field: SheetField | null): SheetGroup[] {
  if (!field) return [{ key: '', label: '', rows }]
  const map = new Map<string, SheetGroup>()
  for (const row of rows) {
    const raw = row.cells[field.id]
    const key = Array.isArray(raw) ? raw[0] ?? '' : cellText(raw)
    const group = map.get(key)
    if (group) group.rows.push(row)
    else map.set(key, { key, label: key || '（空）', rows: [row] })
  }
  return [...map.values()]
}

// —— 推荐模板（飞书多维表格模板中心）——

export type SheetPreset = {
  key: string
  name: string
  icon: string
  description: string
  build: () => SheetData
}

function buildPreset(
  defs: Array<{ name: string; type: SheetFieldType; options?: string[] }>,
  samples: Array<Record<string, string>> = [],
): SheetData {
  const fields: SheetField[] = defs.map((d) => {
    const f = createField(d.type, d.name)
    if (d.options) f.options = d.options
    return f
  })
  const rows: SheetRow[] = samples.map((s) => {
    const row = createRow(fields)
    for (const f of fields) {
      const v = s[f.name]
      if (v === undefined) continue
      if (f.type === 'checkbox') row.cells[f.id] = v === 'true'
      else if (f.type === 'number' || f.type === 'progress' || f.type === 'rating') row.cells[f.id] = Number(v)
      else if (f.type === 'multiSelect' || f.type === 'person') row.cells[f.id] = v.split('、').filter(Boolean)
      else row.cells[f.id] = v
    }
    return row
  })
  return {
    fields,
    rows: rows.length ? rows : [createRow(fields)],
    views: [createView('grid', '表格视图')],
  }
}

export const SHEET_PRESETS: SheetPreset[] = [
  {
    key: 'crm',
    name: '客户管理',
    icon: '🤝',
    description: '客户、阶段与跟进',
    build: () =>
      buildPreset(
        [
          { name: '客户名称', type: 'text' },
          { name: '对接人', type: 'person' },
          { name: '阶段', type: 'select', options: ['初步接洽', '需求确认', '方案报价', '已签约'] },
          { name: '预算', type: 'number' },
          { name: '签约日期', type: 'date' },
          { name: '跟进事项', type: 'longtext' },
        ],
        [
          { 客户名称: '示例科技', 对接人: '张三', 阶段: '需求确认', 预算: '200000', 签约日期: '2026-12-01' },
          { 客户名称: '示例制造', 对接人: '李四', 阶段: '初步接洽', 预算: '80000' },
        ],
      ),
  },
  {
    key: 'task',
    name: '任务跟踪',
    icon: '✅',
    description: '任务、负责人与进度',
    build: () =>
      buildPreset(
        [
          { name: '任务', type: 'text' },
          { name: '负责人', type: 'person' },
          { name: '优先级', type: 'select', options: ['高', '中', '低'] },
          { name: '状态', type: 'select', options: ['未开始', '进行中', '已完成'] },
          { name: '截止日期', type: 'date' },
          { name: '进度', type: 'progress' },
        ],
        [
          { 任务: '整理需求文档', 负责人: '张三', 优先级: '高', 状态: '进行中', 截止日期: '2026-11-30', 进度: '60' },
          { 任务: '客户回访', 负责人: '李四', 优先级: '中', 状态: '未开始', 进度: '0' },
        ],
      ),
  },
  {
    key: 'project',
    name: '项目进度',
    icon: '📅',
    description: '里程碑与交付节奏',
    build: () =>
      buildPreset(
        [
          { name: '项目', type: 'text' },
          { name: '里程碑', type: 'select', options: ['规划', '开发', '上线', '复盘'] },
          { name: '负责人', type: 'person' },
          { name: '开始日期', type: 'date' },
          { name: '结束日期', type: 'date' },
          { name: '完成度', type: 'progress' },
        ],
        [
          { 项目: '智能体项目一期', 里程碑: '开发', 负责人: '张三', 开始日期: '2026-11-01', 结束日期: '2026-12-20', 完成度: '35' },
        ],
      ),
  },
  {
    key: 'content',
    name: '内容排期',
    icon: '📢',
    description: '选题、渠道与发布',
    build: () =>
      buildPreset(
        [
          { name: '选题', type: 'text' },
          { name: '渠道', type: 'select', options: ['公众号', '小红书', '知乎', '视频号'] },
          { name: '类型', type: 'select', options: ['干货', '案例', '观点'] },
          { name: '负责人', type: 'person' },
          { name: '发布日期', type: 'date' },
          { name: '状态', type: 'select', options: ['草稿', '待审', '已发布'] },
          { name: '链接', type: 'link' },
        ],
        [
          { 选题: 'FDE 靠谱画像', 渠道: '公众号', 类型: '干货', 负责人: '张三', 发布日期: '2026-11-25', 状态: '草稿' },
        ],
      ),
  },
]

// ---------------------------------------------------------------- 公式与汇总（038）

/** 汇总方式。 */
export type SheetAggregate = 'sum' | 'avg' | 'count' | 'max' | 'min'

/** 单元格公式：引用同行的其它列，如 `={单价}*{数量}`。 */
export const FORMULA_PREFIX = '='

/**
 * 计算公式列的值。
 *
 * 只支持四则运算与括号，列引用用 {列名} 写死，够用且不会引入表达式解析器。
 * 引用不存在或算式非法时返回空串，不抛错：表格里一个坏公式不该拖垮整张表。
 */
export function evaluateFormula(
  formula: string,
  row: SheetRow,
  fields: SheetField[],
): number | string {
  const expr = (formula ?? '').trim()
  if (!expr.startsWith(FORMULA_PREFIX)) return ''
  const body = expr.slice(FORMULA_PREFIX.length).trim()
  if (!body) return ''
  let substituted = body
  for (const field of fields) {
    const raw = row.cells[field.id]
    const value = typeof raw === 'number' ? raw : Number(raw ?? 0)
    const safe = Number.isFinite(value) ? String(value) : '0'
    substituted = substituted.split(`{${field.name}}`).join(safe)
  }
  // 未解析的 {列名} 说明引用了不存在的列。
  if (/[{}]/.test(substituted)) return ''
  const result = evalArithmetic(substituted)
  return result === null ? '' : result
}

/** 极简四则运算求值：只支持数字与 + - * / ( )。 */
function evalArithmetic(expr: string): number | null {
  const tokens = expr.match(/\d+(\.\d+)?|[()+\-*/]/g)
  if (!tokens) return null
  let pos = 0
  const peek = () => tokens[pos]
  const eat = () => tokens[pos++]

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left === null) return null
    while (peek() === '+' || peek() === '-') {
      const op = eat()
      const right = parseTerm()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number | null {
    let left = parseFactor()
    if (left === null) return null
    while (peek() === '*' || peek() === '/') {
      const op = eat()
      const right = parseFactor()
      if (right === null) return null
      if (op === '*') left *= right
      else {
        if (right === 0) return null
        left /= right
      }
    }
    return left
  }

  function parseFactor(): number | null {
    const token = peek()
    if (token === undefined) return null
    if (token === '(') {
      eat()
      const value = parseExpr()
      if (value === null || eat() !== ')') return null
      return value
    }
    if (token === '-') {
      eat()
      const value = parseFactor()
      return value === null ? null : -value
    }
    if (/^\d/.test(token)) {
      eat()
      return Number(token)
    }
    return null
  }

  const value = parseExpr()
  if (value === null || pos !== tokens.length) return null
  return Number.isFinite(value) ? value : null
}

/** 汇总行：按视图配置计算每列的聚合值。 */
export function summaryValues(
  rows: SheetRow[],
  fields: SheetField[],
  aggregates: Record<string, SheetAggregate>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of fields) {
    const mode = aggregates[field.id]
    if (!mode) continue
    const values = rows
      .map((row) => row.cells[field.id])
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value))
    if (mode === 'count') {
      out[field.id] = String(rows.length)
      continue
    }
    if (!values.length) {
      out[field.id] = ''
      continue
    }
    const sum = values.reduce((acc, value) => acc + value, 0)
    if (mode === 'sum') out[field.id] = formatNumber(sum)
    else if (mode === 'avg') out[field.id] = formatNumber(sum / values.length)
    else if (mode === 'max') out[field.id] = formatNumber(Math.max(...values))
    else out[field.id] = formatNumber(Math.min(...values))
  }
  return out
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

// ---------------------------------------------------------------- 日历视图（035）

/** 日历视图：按日期字段把行分到每天。 */
export function calendarBuckets(
  rows: SheetRow[],
  dateFieldId: string | null,
): Map<string, SheetRow[]> {
  const buckets = new Map<string, SheetRow[]>()
  if (!dateFieldId) return buckets
  for (const row of rows) {
    const raw = row.cells[dateFieldId]
    const day = typeof raw === 'string' ? raw.slice(0, 10) : ''
    if (!day) continue
    const list = buckets.get(day) ?? []
    list.push(row)
    buckets.set(day, list)
  }
  return buckets
}

/** 日历视图的月份列表（含前后补齐的空白周）。 */
export function calendarMonthDays(year: number, month: number): string[] {
  const days: string[] = []
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // 周一为一周起点
  for (let i = 0; i < offset; i++) days.push('')
  const last = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= last; day++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  return days
}

// ---------------------------------------------------------------- CSV 导入导出（039 / 040）

/**
 * 解析 CSV：第一行是列名，其余是行。
 *
 * 支持引号包裹、引号内逗号与换行；不做类型推断，导入后全部按文本，
 * 用户可以在表格里改列类型。
 */
export function parseCSV(text: string): { fields: SheetField[]; rows: SheetRow[] } {
  const records = parseCSVRecords(text ?? '')
  if (!records.length) return { fields: [], rows: [] }
  const names = records[0].map((name, i) => name.trim() || `列 ${i + 1}`)
  const fields: SheetField[] = names.map((name, i) => ({
    ...createField('text', name),
    id: `f_csv_${i}`,
  }))
  const rows: SheetRow[] = records.slice(1).map((record) => {
    const cells: Record<string, SheetCellValue> = {}
    fields.forEach((field, i) => {
      cells[field.id] = record[i] ?? ''
    })
    return { id: uid('r'), cells }
  })
  return { fields, rows }
}

function parseCSVRecords(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      record.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      field = ''
      if (record.some((value) => value !== '')) records.push(record)
      record = []
      continue
    }
    field += char
  }
  if (field !== '' || record.length) {
    record.push(field)
    if (record.some((value) => value !== '')) records.push(record)
  }
  return records
}

/** 导出 CSV：当前视图的筛选与排序结果。 */
export function toCSV(data: SheetData, view?: SheetView): string {
  const fields = data.fields
  const rows = view ? viewRows(data, view) : data.rows
  const lines: string[] = [fields.map((field) => csvCell(field.name)).join(',')]
  for (const row of rows) {
    lines.push(fields.map((field) => csvCell(cellText(row.cells[field.id]))).join(','))
  }
  return lines.join('\n')
}

function csvCell(value: string): string {
  const text = value ?? ''
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** 按视图的筛选与排序得到行集合。 */
export function viewRows(data: SheetData, view: SheetView): SheetRow[] {
  const filtered = filterRows(data.rows, view.filters, '', view.filterJoin === 'or' ? 'or' : 'and')
  return sortRows(filtered, view.sortBy, view.sortOrder)
}
