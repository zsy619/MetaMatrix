/**
 * Base Engine 的 HTTP 客户端。
 *
 * 统一走项目的 apiRequest（自动注入 Bearer token），不裸写 fetch。
 */
import { apiRequest } from '../../api/http'
import type {
  BaseInfo,
  BaseTable,
  BaseView,
  FieldMeta,
  FieldTypeDefinition,
  FormulaValidation,
  QueryRequest,
  QueryResult,
  RecordRow,
  ViewConfig,
} from './types'

function baseUrl(projectId: string) {
  return `/projects/${projectId}/base`
}

/** 取（或创建）当前知识库节点对应的 Base。 */
export function ensureBase(projectId: string, nodeId: string, name?: string) {
  return apiRequest<BaseInfo>(`${baseUrl(projectId)}/ensure`, {
    method: 'POST',
    body: { nodeId, name },
  })
}

/** 列出空间内的 Base。 */
export function listBases(projectId: string) {
  return apiRequest<BaseInfo[]>(`${baseUrl(projectId)}/bases`)
}

/** 列出支持的字段类型与能力。 */
export function listFieldTypes(projectId: string) {
  return apiRequest<FieldTypeDefinition[]>(`${baseUrl(projectId)}/field-types`)
}

/** 列出 Base 下的表。 */
export function listTables(projectId: string, baseId: string) {
  return apiRequest<BaseTable[]>(`${baseUrl(projectId)}/${baseId}/tables`)
}

/** 建表。 */
export function createTable(projectId: string, baseId: string, name: string) {
  return apiRequest<BaseTable>(`${baseUrl(projectId)}/${baseId}/tables`, {
    method: 'POST',
    body: { name },
  })
}

/** 改表。 */
export function updateTable(projectId: string, tableId: string, payload: { name?: string; description?: string }) {
  return apiRequest<BaseTable>(`${baseUrl(projectId)}/tables/${tableId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/** 删表。 */
export function deleteTable(projectId: string, tableId: string) {
  return apiRequest<{ ok: boolean }>(`${baseUrl(projectId)}/tables/${tableId}`, { method: 'DELETE' })
}

/** 列出表字段。 */
export function listFields(projectId: string, tableId: string) {
  return apiRequest<FieldMeta[]>(`${baseUrl(projectId)}/tables/${tableId}/fields`)
}

/** 文档反向引用：哪些多维表格记录引用了该文档节点。 */
export type DocBackref = {
  baseId: string
  nodeId: string
  tableId: string
  tableName: string
  recordId: string
  recordTitle: string
  fieldId: string
  fieldName: string
}

export function listDocBackrefs(projectId: string, nodeId: string) {
  return apiRequest<DocBackref[]>(`${baseUrl(projectId)}/doc-backrefs/${nodeId}`)
}

/** 内嵌了某个 Base 的文档（文档 ↔ 表格的反向索引）。 */
export type BaseEmbedder = {
  /** 知识库节点 ID（可直接跳转）。 */
  nodeId: string
  /** 文档 ID。 */
  documentId: string
  /** 文档标题。 */
  title: string
  /** 被内嵌的 Base ID。 */
  tableId: string
}

/** 列出所有内嵌了本 Base 的文档。 */
export function listBaseEmbedders(projectId: string, baseId: string) {
  return apiRequest<BaseEmbedder[]>(`${baseUrl(projectId)}/embedders/${baseId}`)
}

/** 建字段。 */
export function createField(
  projectId: string,
  tableId: string,
  payload: { name: string; type: string; config?: Record<string, unknown>; required?: boolean },
) {
  return apiRequest<FieldMeta>(`${baseUrl(projectId)}/tables/${tableId}/fields`, {
    method: 'POST',
    body: payload,
  })
}

/** 改字段（改名 / 改配置）。 */
export function updateField(
  projectId: string,
  fieldId: string,
  payload: {
    name?: string;
    config?: Record<string, unknown>;
    required?: boolean;
    sortOrder?: number;
  },
) {
  return apiRequest<FieldMeta>(`${baseUrl(projectId)}/fields/${fieldId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/** 重排字段：传入该表全部字段 id 的新顺序。 */
export function reorderFields(projectId: string, tableId: string, fieldIds: string[]) {
  return apiRequest<FieldMeta[]>(`${baseUrl(projectId)}/tables/${tableId}/fields/order`, {
    method: 'PATCH',
    body: { fieldIds },
  })
}

/** 删字段。 */
export function deleteField(projectId: string, fieldId: string) {
  return apiRequest<{ ok: boolean }>(`${baseUrl(projectId)}/fields/${fieldId}`, { method: 'DELETE' })
}

/** 迁移字段类型。 */
export function migrateField(projectId: string, fieldId: string, type: string) {
  return apiRequest<FieldMeta>(`${baseUrl(projectId)}/fields/${fieldId}/migrate`, {
    method: 'POST',
    body: { type },
  })
}

/** 新建记录。 */
export function createRecord(projectId: string, tableId: string, fields: Record<string, unknown>) {
  return apiRequest<RecordRow>(`${baseUrl(projectId)}/tables/${tableId}/records`, {
    method: 'POST',
    body: { fields },
  })
}

/** 更新记录（带乐观锁版本）。 */
export function updateRecord(
  projectId: string,
  recordId: string,
  fields: Record<string, unknown>,
  expectedVersion?: number,
) {
  return apiRequest<RecordRow>(`${baseUrl(projectId)}/records/${recordId}`, {
    method: 'PATCH',
    body: { fields, expectedVersion },
  })
}

/** 删除记录。 */
export function deleteRecord(projectId: string, recordId: string) {
  return apiRequest<{ ok: boolean }>(`${baseUrl(projectId)}/records/${recordId}`, { method: 'DELETE' })
}

/** 批量操作。 */
/** 批量操作里的一条失败明细。 */
export type BatchFailure = {
  /** 失败对象标识（记录 ID、导入行号等）。 */
  target: string
  /** 失败原因（可直接展示）。 */
  message: string
}

/** 批量操作「部分成功」的结果。 */
export type BatchPartialResult = {
  rows: RecordRow[]
  failures: BatchFailure[]
  succeeded: number
  failed: number
}

export function batchRecords(
  projectId: string,
  tableId: string,
  payload: { action: 'create' | 'update' | 'delete'; ids?: string[]; fields?: Record<string, unknown>; rows?: unknown[]; partial?: boolean },
) {
  return apiRequest<RecordRow[] | BatchPartialResult | { ok: boolean }>(
    `${baseUrl(projectId)}/tables/${tableId}/records/batch`,
    {
      method: 'POST',
      body: payload,
    },
  )
}

/** 统一查询：筛选、排序、分组、分页都在服务端完成。 */
export function queryRecords(projectId: string, payload: QueryRequest) {
  return apiRequest<QueryResult>(`${baseUrl(projectId)}/tables/${payload.tableId}/query`, {
    method: 'POST',
    body: payload,
  })
}

/** 列出视图。 */
export function listViews(projectId: string, tableId: string) {
  return apiRequest<BaseView[]>(`${baseUrl(projectId)}/tables/${tableId}/views`)
}

/** 新建视图。 */
export function createView(projectId: string, tableId: string, name: string, type: string, config: ViewConfig) {
  return apiRequest<BaseView>(`${baseUrl(projectId)}/tables/${tableId}/views`, {
    method: 'POST',
    body: { name, type, config },
  })
}

/** 更新视图配置。 */
export function updateView(
  projectId: string,
  viewId: string,
  payload: { name?: string; type?: string; config?: ViewConfig; version?: number },
) {
  return apiRequest<BaseView>(`${baseUrl(projectId)}/views/${viewId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/** 删除视图。 */
export function deleteView(projectId: string, viewId: string) {
  return apiRequest<{ ok: boolean }>(`${baseUrl(projectId)}/views/${viewId}`, { method: 'DELETE' })
}

/** 校验公式。 */
export function validateFormula(projectId: string, tableId: string, expression: string) {
  return apiRequest<FormulaValidation>(`${baseUrl(projectId)}/tables/${tableId}/formulas/validate`, {
    method: 'POST',
    body: { expression },
  })
}

/** 预览公式。 */
export function previewFormula(
  projectId: string,
  tableId: string,
  expression: string,
  sample: Record<string, unknown>,
) {
  return apiRequest<FormulaValidation>(`${baseUrl(projectId)}/tables/${tableId}/formulas/preview`, {
    method: 'POST',
    body: { expression, sample },
  })
}

/** 保存公式。 */
export function saveFormula(projectId: string, fieldId: string, expression: string) {
  return apiRequest<{ ok: boolean }>(`${baseUrl(projectId)}/fields/${fieldId}/formula`, {
    method: 'PUT',
    body: { expression },
  })
}

/** 事件流地址（SSE）。 */
export function eventsUrl(projectId: string) {
  return `${baseUrl(projectId)}/events`
}
