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

export type SheetFilterOp = 'contains' | 'is' | 'isNot' | 'empty' | 'notEmpty'

export type SheetFilter = {
  fieldId: string
  op: SheetFilterOp
  value: string
}

export type SheetViewType = 'grid' | 'kanban' | 'gallery'

export type SheetView = {
  id: string
  name: string
  type: SheetViewType
  filters: SheetFilter[]
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
    default:
      return true
  }
}

export function filterRows(
  rows: SheetRow[],
  filters: SheetFilter[],
  keyword: string,
): SheetRow[] {
  const kw = keyword.trim().toLowerCase()
  return rows.filter((row) => {
    for (const f of filters) {
      if (!f.fieldId) continue
      if (!matchesFilter(row, f)) return false
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
