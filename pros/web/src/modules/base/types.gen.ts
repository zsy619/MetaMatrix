/* eslint-disable */
/**
 * 自动生成，请勿手改。
 *
 * 来源：http://localhost:3000/openapi.json
 * 生成命令：npm run gen:api
 */

export type AuditList = object[]

export interface BaseDetail {
  base: BaseInfo
  tables: BaseTable[]
  views: BaseView[]
}

export type BaseEmbedderList = object[]

export interface BaseInfo {
  description: string
  icon: string
  id: string
  name: string
  nodeId?: string | null
  ownerId: string
  projectId: string
  schemaVersion: number
}

export type BaseInfoList = BaseInfo[]

export interface BaseMetricsSnapshot {
  activeSubscribers: number
  errors: number
  idempotencyConflicts: number
  operations: Record<string, unknown>
  outboxDead: number
  outboxFailed: number
  outboxPublished: number
  p50Millis: number
  p95Millis: number
  p99Millis: number
  slowQueries: number
}

export interface BaseTable {
  baseId: string
  description: string
  fields: FieldMeta[]
  id: string
  name: string
  primaryFieldId?: string | null
  recordCount: number
  schemaVersion: number
  sortOrder: number
}

export type BaseTableList = BaseTable[]

export interface BaseUpdateRequest {
  description?: string | null
  icon?: string | null
  name?: string | null
}

export interface BaseView {
  config: Record<string, unknown>
  id: string
  name: string
  ownerId: string
  scope: string
  tableId: string
  type: string
  version: number
}

export type BaseViewList = BaseView[]

export interface BatchRequest {
  action: string
  fields?: Record<string, unknown> | null
  ids?: string[] | null
  partial?: boolean | null
  rows?: RecordInput[] | null
}

export type BatchResult = object[]

export type ComputedFieldList = object[]

export interface ConfigBundle {
  fields: object[]
  formulas: object[]
  table: Record<string, unknown>
  version: number
  views: object[]
  warnings?: string[] | null
}

export interface CreateTableRequest {
  description?: string | null
  name: string
}

export interface CreateViewRequest {
  config?: Record<string, unknown> | null
  name: string
  scope?: string | null
  type: string
}

export interface DeadLetter {
  createdAt: string
  eventType: string
  id: string
  retryCount: number
  status: string
}

export type DeadLetterList = DeadLetter[]

export interface DeleteResult {
  deleted?: boolean | null
  id: string
}

export type DocBackrefList = object[]

export interface EnsureBaseRequest {
  name: string
  nodeId: string
}

export interface ErrorResponse {
  code: string
  data?: Record<string, unknown> | null
  message: string
}

export interface EventStream {
  data?: Record<string, unknown> | null
  event: string
}

export interface FieldFormulaDefinition {
  dependencies: FormulaDependency[]
  expression: string
  fieldId: string
  fieldName: string
  tableId: string
  version: number
}

export interface FieldInput {
  config?: Record<string, unknown> | null
  name: string
  required?: boolean | null
  type: string
}

export interface FieldMeta {
  config: Record<string, unknown>
  id: string
  isPrimary: boolean
  name: string
  required: boolean
  sortOrder: number
  type: string
  version: number
}

export type FieldMetaList = FieldMeta[]

export interface FieldTypeDefinition {
  capabilities: Record<string, unknown>
  color: string
  configSchema: Record<string, unknown>
  icon: string
  label: string
  type: string
}

export type FieldTypeDefinitionList = FieldTypeDefinition[]

export interface FieldUpdateInput {
  config?: Record<string, unknown> | null
  name?: string | null
  required?: boolean | null
  type?: string | null
}

export interface FormulaDependency {
  direction: unknown
  fieldId: string
  fieldName: string
  tableId: string
}

export type FormulaDependencyList = FormulaDependency[]

export interface FormulaPreviewRequest {
  expression: string
  sample?: Record<string, unknown> | null
}

export interface FormulaRequest {
  expression: string
}

export interface FormulaValidation {
  dependencies?: string[] | null
  error?: string | null
  errorCode?: string | null
  valid: boolean
  value?: unknown | null
}

export interface ImportConfigRequest {
  baseId: string
  bundle: Record<string, unknown>
}

export type ImportConfigResult = object[]

export interface ImportJobInfo {
  error?: string | null
  failed: number
  failures?: object[] | null
  id: string
  mode: string
  processed: number
  status: string
  succeeded: number
  tableId: string
  total: number
}

export type ImportJobInfoList = ImportJobInfo[]

export interface ImportJobRequest {
  mode?: string | null
  rows: object[]
}

export type LinkTargetList = object[]

export interface MigrateFieldRequest {
  type: string
}

export interface QueryRequest {
  cursor?: string | null
  filters?: Record<string, unknown> | null
  groups?: object[] | null
  pageSize?: number | null
  sorts?: object[] | null
}

export interface QueryResult {
  fields?: FieldMeta[] | null
  nextCursor?: string | null
  records: RecordRow[]
  total: number
}

export type RecalcResult = object[]

export type RecordDocReferenceList = object[]

export type RecordGrantList = object[]

export interface RecordInput {
  expectedVersion?: number | null
  fields: Record<string, unknown>
  grants?: string[] | null
  schemaVersion?: number | null
  visibility?: string | null
}

export interface RecordRow {
  conditionalHidden?: string[] | null
  fields: Record<string, unknown>
  id: string
  version: number
  visibility?: string | null
}

export type RelationList = object[]

export interface ReorderFieldsRequest {
  fieldIds: string[]
}

export interface ReorderRecordsRequest {
  ids: string[]
}

export interface TableSchema {
  fields: FieldMeta[]
  formulas: object[]
  schemaVersion: number
  table: BaseTable
  views: BaseView[]
}

export interface UpdateTableRequest {
  description?: string | null
  name?: string | null
}

export interface UpdateViewRequest {
  config?: Record<string, unknown> | null
  name?: string | null
  type?: string | null
  version?: number | null
}

export interface UserGroupInfo {
  createdAt: string
  description: string
  id: string
  memberCount: number
  members: string[]
  name: string
  sortOrder: number
}

export type UserGroupInfoList = UserGroupInfo[]

export interface UserGroupInput {
  description?: string | null
  members?: string[] | null
  name: string
  sortOrder?: number | null
}
