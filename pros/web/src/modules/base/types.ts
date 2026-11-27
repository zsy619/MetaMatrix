/** 多维表格 Base Engine 的前端类型定义（与后端 internal/base 保持一致）。 */

/** 字段类型标识。 */
export type FieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'rating'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'single_select'
  | 'multi_select'
  | 'email'
  | 'phone'
  | 'url'
  | 'user'
  | 'attachment'
  | 'formula'
  | 'link'
  | 'doc'

/** 字段能力：决定哪些视图操作可用。 */
export type FieldCapabilities = {
  editable: boolean
  filterable: boolean
  sortable: boolean
  groupable: boolean
  indexable: boolean
  computed: boolean
}

/** 字段类型定义（后端下发的注册表）。 */
export type FieldTypeDefinition = {
  type: FieldType
  label: string
  icon: string
  version: number
  color: string
  description: string
  configSchema: Record<string, unknown>
  capabilities: FieldCapabilities
}

/** 字段元信息。 */
export type FieldMeta = {
  id: string
  name: string
  type: FieldType
  config: Record<string, unknown>
  required: boolean
  isPrimary: boolean
  sortOrder: number
  version: number
}

/** 记录（行）。 */
export type RecordRow = {
  id: string
  version: number
  fields: Record<string, unknown>
  updatedAt: string
}

/** 表。 */
export type BaseTable = {
  id: string
  baseId: string
  name: string
  description: string
  primaryFieldId?: string
  sortOrder: number
  schemaVersion: number
  settings: Record<string, unknown>
  fields: FieldMeta[]
  recordCount: number
  createdAt: string
}

/** 视图。 */
export type ViewType = 'grid' | 'kanban' | 'calendar' | 'gallery'

/** 视图配置。 */
export type ViewConfig = {
  fieldVisibility?: Record<string, boolean>
  fieldWidths?: Record<string, number>
  filters?: FilterGroup
  sorts?: SortRule[]
  groups?: GroupRule[]
  pagination?: { pageSize: number }
  layout?: Record<string, unknown>
}

export type BaseView = {
  id: string
  tableId: string
  name: string
  type: ViewType
  config: ViewConfig
  isDefault: boolean
  ownerId: string
  version: number
  createdAt: string
}

/** 筛选条件与分组。 */
export type Condition = { fieldId: string; operator: string; value: unknown }
export type FilterGroup = { logic: 'AND' | 'OR'; conditions: Condition[]; children: FilterGroup[] }
export type SortRule = { fieldId: string; order: 'asc' | 'desc' }
export type GroupRule = { fieldId: string; order: 'asc' | 'desc' }

/** 查询请求与结果。 */
export type QueryRequest = {
  tableId: string
  viewId?: string
  filters?: FilterGroup
  sorts?: SortRule[]
  groups?: GroupRule[]
  pageSize?: number
  cursor?: string
  keyword?: string
}

export type QueryResult = {
  tableId: string
  viewId?: string
  schemaVersion: number
  records: RecordRow[]
  total: number
  page: { nextCursor?: string; hasMore: boolean; pageSize: number; offset: number }
  fields: FieldMeta[]
}

/** Base 概要。 */
export type BaseInfo = {
  id: string
  projectId: string
  nodeId?: string
  name: string
  description: string
  icon: string
  ownerId: string
  schemaVersion: number
  migrated?: string
  createdAt: string
  updatedAt: string
}

/** 公式校验结果。 */
export type FormulaValidation = {
  valid: boolean
  error?: string
  errorCode?: string
  dependencies?: string[]
  value?: unknown
}
