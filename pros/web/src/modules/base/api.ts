/**
 * Base Engine 的 HTTP 客户端。
 *
 * 统一走项目的 apiRequest（自动注入 Bearer token），不裸写 fetch。
 */
import { apiRequest } from '../../api/http'
import type {
  BaseInfo,
  FieldFormulaDefinition,
  FormulaDependency,
  TableSchema,
  BaseTable,
  BaseView,
  FieldMeta,
  FieldTypeDefinition,
  FormulaValidation,
  QueryRequest,
  QueryResult,
  RecordRow,
  RecordGrant,
  GrantSubject,
  RecordVisibility,
  ViewScope,
  ViewConfig,
  ConfigBundle,
  ComputedFieldSummary,
  SummaryRequest,
  SummaryResult,
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

/** 创建一个独立 Base（不依赖知识库节点）。 */
export function createBase(
  projectId: string,
  payload: { name?: string; description?: string; icon?: string } = {},
) {
  return apiRequest<BaseInfo>(`${baseUrl(projectId)}/bases`, {
    method: 'POST',
    body: payload,
  })
}

/** 改 Base 元信息（名称 / 描述 / 图标）。 */
export function updateBase(
  projectId: string,
  baseId: string,
  payload: { name?: string; description?: string; icon?: string },
) {
  return apiRequest<BaseInfo>(`${baseUrl(projectId)}/bases/${baseId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/** 删除 Base（软删，级联表 / 字段 / 记录 / 视图）。 */
export function deleteBase(projectId: string, baseId: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`${baseUrl(projectId)}/bases/${baseId}`, {
    method: 'DELETE',
  })
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

/** 操作记录（审计日志）条目。 */
export type BaseAuditLog = {
  id: string
  projectId: string
  baseId: string
  tableId?: string
  recordId?: string
  operatorId: string
  /** 操作者显示名（后端解析，缺失时回退短 ID）。 */
  operatorName?: string
  /** record.created / record.updated / record.deleted / field.* 等。 */
  operation: string
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  /** 被操作的数据表名（审计可能来自 base 内其它表）。 */
  tableName?: string
  /** 字段 ID → 字段名（由服务端按该条记录所属表解析）。 */
  fieldNames?: Record<string, string>
  requestId?: string
  createdAt: string
}

/** 审计查询条件（分页 + 筛选）。 */
export type AuditQuery = {
  /** 单页条数（1~200）。 */
  limit?: number
  /** 偏移量（配合「加载更多」）。 */
  offset?: number
  /** 操作类型过滤；空表示不过滤。 */
  action?: string
  /** 起始时间（RFC3339）。 */
  from?: string
  /** 结束时间（RFC3339）。 */
  to?: string
  /** 操作者过滤（用户 ID）。 */
  operator?: string
  /** 记录过滤（记录 ID）。 */
  recordId?: string
}

/** 审计分页结果。 */
export type AuditPage = {
  items: BaseAuditLog[]
  total: number
  limit: number
  offset: number
}

/** 列出操作记录（分页 + 筛选）。 */
export function listAudit(projectId: string, baseId: string, query: AuditQuery = {}) {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  if (query.action) params.set('action', query.action)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.operator) params.set('operator', query.operator)
  if (query.recordId) params.set('recordId', query.recordId)
  const qs = params.toString()
  return apiRequest<AuditPage>(`${baseUrl(projectId)}/${baseId}/audit${qs ? `?${qs}` : ''}`)
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
  visibility?: RecordVisibility,
  grants?: string[],
  grantSubjects?: GrantSubject[],
) {
  return apiRequest<RecordRow>(`${baseUrl(projectId)}/records/${recordId}`, {
    method: 'PATCH',
    body: { fields, expectedVersion, visibility, grants, grantSubjects },
  })
}

/** 列出记录的可见成员（指定成员可见时有效）。 */
export function listRecordGrants(projectId: string, recordId: string) {
  return apiRequest<RecordGrant[]>(`${baseUrl(projectId)}/records/${recordId}/grants`)
}

/** 列出空间成员出现过的部门（用于「按部门授权」）。 */
export function listSpaceDepartments(projectId: string) {
  return apiRequest<string[]>(`${baseUrl(projectId)}/departments`, { cache: 'no-store' })
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

/** 记录 → 文档的引用关系（文档内嵌了本表，或正文提到了本记录）。 */
export type RecordDocReference = {
  /** 知识库节点 ID（可直接跳转）。 */
  nodeId: string
  /** 文档 ID。 */
  documentId: string
  /** 文档标题。 */
  title: string
  /** embed = 内嵌了本表；mention = 正文提到了本记录。 */
  kind: 'embed' | 'mention'
}

/** 列出引用了本记录的文档。 */
export function listRecordDocReferences(projectId: string, recordId: string) {
  return apiRequest<RecordDocReference[]>(`${baseUrl(projectId)}/records/${recordId}/doc-references`)
}

/** 按给定顺序重排记录（手动排序位）。 */
export function reorderRecords(projectId: string, tableId: string, ids: string[]) {
  return apiRequest<{ ok: boolean; count: number }>(`${baseUrl(projectId)}/tables/${tableId}/records/reorder`, {
    method: 'POST',
    body: { ids },
  })
}

/** 记录关联关系（正向 = 我关联了谁；反向 = 谁关联了我）。 */
export type RecordRelation = {
  direction: 'outbound' | 'inbound'
  /** 关联方所在的数据表。 */
  tableId: string
  tableName: string
  /** 承载关联的字段。 */
  fieldId: string
  fieldName: string
  /** 关联到的记录。 */
  recordId: string
  recordTitle: string
  /** 被指向的表（跳转用）。 */
  targetTableId: string
}

export type RecordRelationSet = {
  recordId: string
  outbound: RecordRelation[]
  inbound: RecordRelation[]
}

/** 列出记录的正向 / 反向关联关系。 */
export function listRecordRelations(projectId: string, recordId: string) {
  return apiRequest<RecordRelationSet>(`${baseUrl(projectId)}/records/${recordId}/relations`)
}

/** 关联记录选择器的一条候选。 */
export type LinkTarget = {
  id: string
  tableId: string
  title: string
  subtitle?: string
}

/** 一页关联候选（游标分页）。 */
export type LinkTargetPage = {
  items: LinkTarget[]
  nextCursor?: string
  hasMore: boolean
}

/** 列出目标表的记录候选（关联记录选择器，支持远程搜索 + 游标翻页）。 */
export function listLinkTargetsPage(
  projectId: string,
  tableId: string,
  options: { keyword?: string; limit?: number; cursor?: string; targetTableId?: string } = {},
) {
  const query = new URLSearchParams()
  if (options.keyword) query.set('keyword', options.keyword)
  query.set('limit', String(options.limit ?? 50))
  if (options.cursor) query.set('cursor', options.cursor)
  if (options.targetTableId) query.set('targetTableId', options.targetTableId)
  return apiRequest<LinkTargetPage>(
    `${baseUrl(projectId)}/tables/${tableId}/link-targets?${query.toString()}`,
  )
}

/** 列出目标表的记录候选（兼容旧调用：只取第一页 items）。 */
export async function listLinkTargets(
  projectId: string,
  tableId: string,
  keyword?: string,
  limit = 50,
) {
  const page = await listLinkTargetsPage(projectId, tableId, { keyword, limit })
  return page.items
}

/** 统一查询：筛选、排序、分组、分页都在服务端完成。 */
export function queryRecords(projectId: string, payload: QueryRequest) {
  return apiRequest<QueryResult>(`${baseUrl(projectId)}/tables/${payload.tableId}/query`, {
    method: 'POST',
    body: payload,
  })
}

/** 跨表复制 / 移动记录（E-03）。 */
export function transferRecord(
  projectId: string,
  tableId: string,
  payload: { recordId: string; targetTableId: string; mode: "copy" | "move" },
) {
  return apiRequest<{
    sourceRecordId: string;
    targetTableId: string;
    targetRecordId: string;
    copiedFields: Record<string, string>;
    skippedFields: Record<string, string>;
  }>(`${baseUrl(projectId)}/tables/${tableId}/records/transfer`, {
    method: 'POST',
    body: payload,
  })
}

/**
 * 计算视图的汇总行 / 分组小计（E-07）。
 *
 * 口径与列表一致：服务端用同一套筛选条件算，所以「合计」和列表永远对得上。
 */
export function fetchTableSummary(projectId: string, payload: SummaryRequest) {
  return apiRequest<SummaryResult>(
    `${baseUrl(projectId)}/tables/${payload.tableId}/summary`,
    { method: 'POST', body: payload },
  )
}

/** 列出视图。 */
export function listViews(projectId: string, tableId: string) {
  return apiRequest<BaseView[]>(`${baseUrl(projectId)}/tables/${tableId}/views`)
}

/** 新建视图。 */
export function createView(
  projectId: string,
  tableId: string,
  name: string,
  type: string,
  config: ViewConfig,
  scope?: ViewScope,
) {
  return apiRequest<BaseView>(`${baseUrl(projectId)}/tables/${tableId}/views`, {
    method: 'POST',
    body: { name, type, config, scope },
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

// —— 表配置包（第十六轮）——

/** 导出一张表的配置包。 */
export function exportTableConfig(projectId: string, tableId: string) {
  return apiRequest<ConfigBundle>(`${baseUrl(projectId)}/tables/${tableId}/config-export`)
}

/** 加密后的配置包（AES-256-GCM 密文体）。 */
export type EncryptedBundle = {
  formatVersion: number
  algorithm: string
  kdf: string
  iterations: number
  salt: string
  nonce: string
  ciphertext: string
  exportedAt?: string
}

/** 导出一张表的**加密**配置包（口令保护，只有拿到口令的人能导入）。 */
export function exportTableConfigEncrypted(projectId: string, tableId: string, passphrase: string) {
  return apiRequest<EncryptedBundle>(
    `${baseUrl(projectId)}/tables/${tableId}/config-export-encrypted`,
    { method: 'POST', body: { passphrase } },
  )
}

/** 导入**加密**配置包。 */
export function importTableConfigEncrypted(
  projectId: string,
  baseId: string,
  passphrase: string,
  bundle: EncryptedBundle,
) {
  return apiRequest<{ tableId: string; table: BaseTable; warnings?: string[] }>(
    `${baseUrl(projectId)}/tables/config-import-encrypted`,
    { method: 'POST', body: { baseId, passphrase, bundle } },
  )
}

/** 从配置包导入（新建一张表，不覆盖原表）。 */
export function importTableConfig(projectId: string, baseId: string, bundle: ConfigBundle) {
  return apiRequest<{ tableId: string; table: BaseTable; warnings?: string[] }>(
    `${baseUrl(projectId)}/tables/config-import`,
    {
      method: 'POST',
      body: { baseId, bundle },
    },
  )
}

/** 把配置包合并进一张已有表（按字段名匹配，已存在的字段跳过）。 */
export function mergeTableConfig(projectId: string, tableId: string, bundle: ConfigBundle) {
  return apiRequest<{ tableId: string; table: BaseTable; warnings?: string[] }>(
    `${baseUrl(projectId)}/tables/${tableId}/config-merge`,
    {
      method: 'POST',
      body: { bundle },
    },
  )
}

/** 取表结构快照（表 + 字段 + 视图 + 公式）。 */
export function fetchTableSchema(projectId: string, tableId: string) {
  return apiRequest<TableSchema>(`${baseUrl(projectId)}/tables/${tableId}/schema`)
}

/** 取公式字段的定义（表达式 + AST + 依赖）。 */
export function fetchFieldFormula(projectId: string, fieldId: string) {
  return apiRequest<FieldFormulaDefinition>(`${baseUrl(projectId)}/fields/${fieldId}/formula`)
}

/** 取引用 / 汇总字段配置。 */
export function fetchComputedFields(projectId: string, tableId: string) {
  return apiRequest<ComputedFieldSummary[]>(`${baseUrl(projectId)}/tables/${tableId}/computed-fields`)
}

/** 手动重算引用 / 汇总字段（跨表计算默认异步，界面可手动触发）。 */
export function recalcLookupRollup(projectId: string, tableId: string) {
  return apiRequest<{ updated: number }>(`${baseUrl(projectId)}/tables/${tableId}/lookup-rollup/recalc`, {
    method: 'POST',
  })
}

/** 取公式依赖图（我依赖谁 / 谁依赖我）。 */
export function fetchFormulaDependencies(projectId: string, fieldId: string) {
  return apiRequest<FormulaDependency[]>(`${baseUrl(projectId)}/fields/${fieldId}/formula/dependencies`)
}

/* ————————————————————————————————————————————————————————————
 * 只读 GET 接口（技术文档 §10）
 * ———————————————————————————————————————————————————————————— */

/** Base 详情（Base + 表 + 视图）。 */
export function fetchBaseDetail(projectId: string, baseId: string) {
  return apiRequest<{ base: BaseInfo; tables?: BaseTable[]; views?: BaseView[] }>(
    `${baseUrl(projectId)}/bases/${baseId}`,
  )
}

/** 单条记录详情。 */
export function fetchRecord(projectId: string, recordId: string) {
  return apiRequest<RecordRow>(`${baseUrl(projectId)}/records/${recordId}`)
}

/** 视图详情。 */
export function fetchView(projectId: string, viewId: string) {
  return apiRequest<BaseView>(`${baseUrl(projectId)}/views/${viewId}`)
}

/**
 * 按视图配置查询记录。
 *
 * 请求体可覆盖视图里的筛选 / 排序 / 分组；不传时用视图自带的配置。
 */
export function queryByView(
  projectId: string,
  viewId: string,
  payload: Partial<QueryRequest> = {},
) {
  return apiRequest<QueryResult>(`${baseUrl(projectId)}/views/${viewId}/query`, {
    method: 'POST',
    body: payload,
  })
}

/* ————————————————————————————————————————————————————————————
 * 可观测性（技术文档 §15.2）
 * ———————————————————————————————————————————————————————————— */

/** Base Engine 指标快照。 */
export type BaseMetricsSnapshot = {
  operations: Record<string, number>
  errors: number
  slowQueries: number
  p50Millis: number
  p95Millis: number
  p99Millis: number
  outboxPublished: number
  outboxFailed: number
  outboxDead: number
  idempotencyConflicts: number
  activeSubscribers: number
}

/** 取指标快照。 */
export function fetchBaseMetrics(projectId: string) {
  return apiRequest<BaseMetricsSnapshot>(`${baseUrl(projectId)}/metrics`)
}

/** Prometheus 文本指标的地址（供采集器 / 运维面板直接拉）。 */
export function baseMetricsPrometheusUrl(projectId: string) {
  return `${baseUrl(projectId)}/metrics/prometheus`
}

/* ————————————————————————————————————————————————————————————
 * 异步导入任务（技术文档 §16.2）
 * ———————————————————————————————————————————————————————————— */

export type ImportJobStatus = 'pending' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled'

export type ImportJobFailure = {
  row: number
  field?: string
  reason: string
}

export type ImportJobInfo = {
  id: string
  tableId: string
  status: ImportJobStatus
  mode: 'atomic' | 'partial'
  total: number
  processed: number
  succeeded: number
  failed: number
  failures?: ImportJobFailure[]
  error?: string
}

/** 提交异步导入任务（提交即返回 jobId，不阻塞请求）。 */
export function createImportJob(
  projectId: string,
  tableId: string,
  payload: { rows: Record<string, unknown>[]; mode?: 'atomic' | 'partial' },
) {
  return apiRequest<ImportJobInfo>(`${baseUrl(projectId)}/tables/${tableId}/import-jobs`, {
    method: 'POST',
    body: payload,
  })
}

/** 查询导入任务进度。 */
export function fetchImportJob(projectId: string, jobId: string) {
  return apiRequest<ImportJobInfo>(`${baseUrl(projectId)}/import-jobs/${jobId}`)
}

/** 列出某张表的导入任务。 */
export function listImportJobs(projectId: string, tableId: string) {
  return apiRequest<ImportJobInfo[]>(`${baseUrl(projectId)}/tables/${tableId}/import-jobs`)
}

/** 取消导入任务。 */
export function cancelImportJob(projectId: string, jobId: string) {
  return apiRequest<ImportJobInfo>(`${baseUrl(projectId)}/import-jobs/${jobId}/cancel`, {
    method: 'POST',
  })
}

/* ————————————————————————————————————————————————————————————
 * 通讯录分组（人员字段可引用「一个组」）
 * ———————————————————————————————————————————————————————————— */

export type UserGroupInfo = {
  id: string
  name: string
  description: string
  members: string[]
  memberCount: number
  sortOrder: number
  createdAt: string
}

/** 列出通讯录分组。 */
export function listUserGroups(projectId: string) {
  return apiRequest<UserGroupInfo[]>(`${baseUrl(projectId)}/user-groups`)
}

/** 新建通讯录分组。 */
export function createUserGroup(
  projectId: string,
  payload: { name: string; description?: string; members?: string[]; sortOrder?: number },
) {
  return apiRequest<UserGroupInfo>(`${baseUrl(projectId)}/user-groups`, {
    method: 'POST',
    body: payload,
  })
}

/** 修改通讯录分组。 */
export function updateUserGroup(
  projectId: string,
  groupId: string,
  payload: { name?: string; description?: string; members?: string[]; sortOrder?: number },
) {
  return apiRequest<UserGroupInfo>(`${baseUrl(projectId)}/user-groups/${groupId}`, {
    method: 'PATCH',
    body: payload,
  })
}

/** 删除通讯录分组。 */
export function deleteUserGroup(projectId: string, groupId: string) {
  return apiRequest<{ ok?: boolean }>(`${baseUrl(projectId)}/user-groups/${groupId}`, {
    method: 'DELETE',
  })
}

/* ————————————————————————————————————————————————————————————
 * 事件死信治理
 * ———————————————————————————————————————————————————————————— */

export type DeadLetter = {
  id: string
  eventType: string
  retryCount: number
  status: string
  createdAt: string
}

/** 列出死信事件。 */
export function listDeadLetters(projectId: string) {
  return apiRequest<DeadLetter[]>(`${baseUrl(projectId)}/outbox/dead-letters`)
}

/** 人工重投一条死信。 */
export function retryDeadLetter(projectId: string, eventId: string) {
  return apiRequest<{ ok?: boolean }>(
    `${baseUrl(projectId)}/outbox/dead-letters/${eventId}/retry`,
    { method: 'POST' },
  )
}
