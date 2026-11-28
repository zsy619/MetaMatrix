// Package api 提供对外的接口元数据（OpenAPI 规范）。
//
// 目的（共享技术方案 §10.9）：
//   - 「OpenAPI：自动生成接口文档和前端 TypeScript 类型」；
//   - 规范由**声明式路由表**生成，并与 main.go 里真实注册的路由做一致性守卫，
//     避免「文档写了、接口没有」或「接口加了、文档没写」。
package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
)

// Operation 描述一个接口。
type Operation struct {
	Method      string
	Path        string
	Summary     string
	Tag         string
	Params      []Param
	RequestBody string // schema 名（空表示无请求体）
	Response    string // schema 名
	Errors      []string
}

// Param 是路径 / 查询参数。
type Param struct {
	Name     string
	In       string // path / query / header
	Required bool
	Schema   string
}

// RouteTable 是多维表格 Base Engine 的接口清单。
//
// 约定：Path 用 `/projects/{projectId}/base/...` 的 OpenAPI 写法，
// 与 main.go 中注册的路径一一对应（由 openapi_test.go 守卫）。
var RouteTable = []Operation{
	{Method: "POST", Path: "/projects/{projectId}/base/ensure", Summary: "取（或创建）节点对应的 Base", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, RequestBody: "EnsureBaseRequest", Response: "BaseInfo"},
	{Method: "GET", Path: "/projects/{projectId}/base/bases", Summary: "列出空间内的 Base", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "BaseInfoList"},
	{Method: "POST", Path: "/projects/{projectId}/base/bases", Summary: "创建独立 Base", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, RequestBody: "BaseUpdateRequest", Response: "BaseInfo"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/bases/{baseId}", Summary: "改 Base 元信息", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, RequestBody: "BaseUpdateRequest", Response: "BaseInfo"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/bases/{baseId}", Summary: "删除 Base", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	{Method: "GET", Path: "/projects/{projectId}/base/field-types", Summary: "字段类型与能力清单", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "FieldTypeDefinitionList"},
	{Method: "GET", Path: "/projects/{projectId}/base/events", Summary: "SSE 事件流", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "EventStream"},
	{Method: "GET", Path: "/projects/{projectId}/base/{baseId}/audit", Summary: "操作审计", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, Response: "AuditList"},
	{Method: "GET", Path: "/projects/{projectId}/base/doc-backrefs/{nodeId}", Summary: "节点被哪些 Base 引用", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "nodeId", In: "path", Required: true, Schema: "string"}}, Response: "DocBackrefList"},
	{Method: "GET", Path: "/projects/{projectId}/base/embedders/{baseId}", Summary: "哪些文档内嵌了该 Base", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, Response: "BaseEmbedderList"},
	{Method: "GET", Path: "/projects/{projectId}/base/{baseId}/tables", Summary: "列出数据表", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, Response: "BaseTableList"},
	{Method: "POST", Path: "/projects/{projectId}/base/{baseId}/tables", Summary: "建表", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, RequestBody: "CreateTableRequest", Response: "BaseTable"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}", Summary: "表详情（含字段）", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "BaseTable"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/tables/{tableId}", Summary: "改表", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "UpdateTableRequest", Response: "BaseTable"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/tables/{tableId}", Summary: "删表", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/fields", Summary: "字段列表", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "FieldMetaList"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/fields", Summary: "建字段", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "FieldInput", Response: "FieldMeta"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/schema", Summary: "表结构快照", Tag: "table", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "TableSchema"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/tables/{tableId}/fields/order", Summary: "字段排序", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "ReorderFieldsRequest", Response: "FieldMetaList"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/records", Summary: "新建记录", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "RecordInput", Response: "RecordRow"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/query", Summary: "按条件查询记录", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "QueryRequest", Response: "QueryResult"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/records/batch", Summary: "批量写入（支持幂等键）", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}, {Name: "Idempotency-Key", In: "header", Schema: "string"}}, RequestBody: "BatchRequest", Response: "BatchResult"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/records/reorder", Summary: "记录排序", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "ReorderRecordsRequest", Response: "DeleteResult"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/views", Summary: "视图列表", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "BaseViewList"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/views", Summary: "建视图", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "CreateViewRequest", Response: "BaseView"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/formulas/validate", Summary: "校验公式", Tag: "formula", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "FormulaRequest", Response: "FormulaValidation"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/formulas/preview", Summary: "预览公式", Tag: "formula", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "FormulaPreviewRequest", Response: "FormulaValidation"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/config-export", Summary: "导出表配置包", Tag: "config", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "ConfigBundle"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/config-import", Summary: "导入表配置包（支持幂等键）", Tag: "config", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "Idempotency-Key", In: "header", Schema: "string"}}, RequestBody: "ImportConfigRequest", Response: "ImportConfigResult"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/config-merge", Summary: "合并导入配置包", Tag: "config", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "ImportConfigRequest", Response: "ImportConfigResult"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/fields/{fieldId}", Summary: "改字段", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, RequestBody: "FieldUpdateInput", Response: "FieldMeta"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/fields/{fieldId}", Summary: "删字段", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	{Method: "POST", Path: "/projects/{projectId}/base/fields/{fieldId}/migrate", Summary: "字段类型迁移", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, RequestBody: "MigrateFieldRequest", Response: "FieldMeta"},
	{Method: "PUT", Path: "/projects/{projectId}/base/fields/{fieldId}/formula", Summary: "保存公式", Tag: "formula", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, RequestBody: "FormulaRequest", Response: "DeleteResult"},
	{Method: "GET", Path: "/projects/{projectId}/base/fields/{fieldId}/formula", Summary: "读取公式定义", Tag: "formula", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, Response: "FieldFormulaDefinition"},
	{Method: "GET", Path: "/projects/{projectId}/base/fields/{fieldId}/formula/dependencies", Summary: "读取公式依赖图", Tag: "formula", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "fieldId", In: "path", Required: true, Schema: "string"}}, Response: "FormulaDependencyList"},
	{Method: "GET", Path: "/projects/{projectId}/base/records/{recordId}/doc-references", Summary: "记录引用的文档", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, Response: "RecordDocReferenceList"},
	{Method: "GET", Path: "/projects/{projectId}/base/records/{recordId}/grants", Summary: "记录可见授权名单", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, Response: "RecordGrantList"},
	{Method: "GET", Path: "/projects/{projectId}/base/records/{recordId}/relations", Summary: "记录关联关系", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, Response: "RelationList"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/link-targets", Summary: "关联字段候选记录", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "LinkTargetList"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/computed-fields", Summary: "引用 / 汇总字段配置", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "ComputedFieldList"},
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/lookup-rollup/recalc", Summary: "重算引用 / 汇总字段", Tag: "field", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "RecalcResult"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/records/{recordId}", Summary: "更新记录", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, RequestBody: "RecordInput", Response: "RecordRow"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/records/{recordId}", Summary: "删记录", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/views/{viewId}", Summary: "改视图", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "viewId", In: "path", Required: true, Schema: "string"}}, RequestBody: "UpdateViewRequest", Response: "BaseView"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/views/{viewId}", Summary: "删视图", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "viewId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	// —— 只读 GET 接口（技术文档 §10）——
	{Method: "GET", Path: "/projects/{projectId}/base/bases/{baseId}", Summary: "Base 详情", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "baseId", In: "path", Required: true, Schema: "string"}}, Response: "BaseDetail"},
	{Method: "GET", Path: "/projects/{projectId}/base/records/{recordId}", Summary: "记录详情", Tag: "record", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "recordId", In: "path", Required: true, Schema: "string"}}, Response: "RecordRow"},
	{Method: "GET", Path: "/projects/{projectId}/base/views/{viewId}", Summary: "视图详情", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "viewId", In: "path", Required: true, Schema: "string"}}, Response: "BaseView"},
	{Method: "POST", Path: "/projects/{projectId}/base/views/{viewId}/query", Summary: "按视图配置查询记录", Tag: "view", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "viewId", In: "path", Required: true, Schema: "string"}}, RequestBody: "QueryRequest", Response: "QueryResult"},
	// —— 兼容与可观测性 ——
	{Method: "GET", Path: "/projects/{projectId}/base/fields/types", Summary: "字段类型与能力清单（兼容路径）", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "FieldTypeDefinitionList"},
	{Method: "GET", Path: "/projects/{projectId}/base/metrics", Summary: "Base Engine 指标快照", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "BaseMetricsSnapshot"},
	{Method: "GET", Path: "/projects/{projectId}/base/metrics/prometheus", Summary: "Base Engine Prometheus 文本指标", Tag: "base", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "EventStream"},
	// —— 异步导入任务 ——
	{Method: "POST", Path: "/projects/{projectId}/base/tables/{tableId}/import-jobs", Summary: "提交异步导入任务", Tag: "import", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, RequestBody: "ImportJobRequest", Response: "ImportJobInfo"},
	{Method: "GET", Path: "/projects/{projectId}/base/tables/{tableId}/import-jobs", Summary: "导入任务列表", Tag: "import", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "tableId", In: "path", Required: true, Schema: "string"}}, Response: "ImportJobInfoList"},
	{Method: "GET", Path: "/projects/{projectId}/base/import-jobs/{jobId}", Summary: "导入任务进度", Tag: "import", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "jobId", In: "path", Required: true, Schema: "string"}}, Response: "ImportJobInfo"},
	{Method: "POST", Path: "/projects/{projectId}/base/import-jobs/{jobId}/cancel", Summary: "取消导入任务", Tag: "import", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "jobId", In: "path", Required: true, Schema: "string"}}, Response: "ImportJobInfo"},
	// —— 通讯录分组 ——
	{Method: "GET", Path: "/projects/{projectId}/base/user-groups", Summary: "通讯录分组列表", Tag: "usergroup", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "UserGroupInfoList"},
	{Method: "POST", Path: "/projects/{projectId}/base/user-groups", Summary: "新建通讯录分组", Tag: "usergroup", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, RequestBody: "UserGroupInput", Response: "UserGroupInfo"},
	{Method: "PATCH", Path: "/projects/{projectId}/base/user-groups/{groupId}", Summary: "修改通讯录分组", Tag: "usergroup", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "groupId", In: "path", Required: true, Schema: "string"}}, RequestBody: "UserGroupInput", Response: "UserGroupInfo"},
	{Method: "DELETE", Path: "/projects/{projectId}/base/user-groups/{groupId}", Summary: "删除通讯录分组", Tag: "usergroup", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "groupId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
	// —— 事件死信治理 ——
	{Method: "GET", Path: "/projects/{projectId}/base/outbox/dead-letters", Summary: "死信事件列表", Tag: "event", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}}, Response: "DeadLetterList"},
	{Method: "POST", Path: "/projects/{projectId}/base/outbox/dead-letters/{eventId}/retry", Summary: "人工重投死信", Tag: "event", Params: []Param{{Name: "projectId", In: "path", Required: true, Schema: "string"}, {Name: "eventId", In: "path", Required: true, Schema: "string"}}, Response: "DeleteResult"},
}

// Schemas 是接口用到的数据结构（简化定义：类型 + 字段）。
var Schemas = map[string]map[string]string{
	"EnsureBaseRequest":      {"nodeId": "string", "name": "string"},
	"BaseUpdateRequest":      {"name": "string?", "description": "string?", "icon": "string?"},
	"CreateTableRequest":     {"name": "string", "description": "string?"},
	"UpdateTableRequest":     {"name": "string?", "description": "string?"},
	"FieldInput":             {"name": "string", "type": "string", "required": "boolean?", "config": "object?"},
	"FieldUpdateInput":       {"name": "string?", "type": "string?", "required": "boolean?", "config": "object?"},
	"MigrateFieldRequest":    {"type": "string"},
	"FormulaRequest":         {"expression": "string"},
	"FormulaPreviewRequest":  {"expression": "string", "sample": "object?"},
	"RecordInput":            {"fields": "object", "expectedVersion": "number?", "schemaVersion": "number?", "visibility": "string?", "grants": "string[]?"},
	"BatchRequest":           {"action": "string", "ids": "string[]?", "fields": "object?", "rows": "RecordInput[]?", "partial": "boolean?"},
	"ReorderFieldsRequest":   {"fieldIds": "string[]"},
	"ReorderRecordsRequest":  {"ids": "string[]"},
	"CreateViewRequest":      {"name": "string", "type": "string", "config": "object?", "scope": "string?"},
	"UpdateViewRequest":      {"name": "string?", "type": "string?", "config": "object?", "version": "number?"},
	"QueryRequest":           {"filters": "object?", "sorts": "object[]?", "groups": "object[]?", "pageSize": "number?", "cursor": "string?"},
	"ImportConfigRequest":    {"baseId": "string", "bundle": "object"},
	"BaseInfo":               {"id": "string", "projectId": "string", "nodeId": "string?", "name": "string", "description": "string", "icon": "string", "ownerId": "string", "schemaVersion": "number"},
	"BaseTable":              {"id": "string", "baseId": "string", "name": "string", "description": "string", "primaryFieldId": "string?", "sortOrder": "number", "schemaVersion": "number", "fields": "FieldMeta[]", "recordCount": "number"},
	"FieldMeta":              {"id": "string", "name": "string", "type": "string", "required": "boolean", "isPrimary": "boolean", "sortOrder": "number", "version": "number", "config": "object"},
	"FieldTypeDefinition":    {"type": "string", "label": "string", "icon": "string", "color": "string", "capabilities": "object", "configSchema": "object"},
	"BaseView":               {"id": "string", "tableId": "string", "name": "string", "type": "string", "scope": "string", "ownerId": "string", "version": "number", "config": "object"},
	"RecordRow":              {"id": "string", "version": "number", "fields": "object", "visibility": "string?", "conditionalHidden": "string[]?"},
	"QueryResult":            {"records": "RecordRow[]", "total": "number", "nextCursor": "string?", "fields": "FieldMeta[]?"},
	"FormulaValidation":      {"valid": "boolean", "error": "string?", "errorCode": "string?", "dependencies": "string[]?", "value": "any?"},
	"FieldFormulaDefinition": {"fieldId": "string", "fieldName": "string", "tableId": "string", "expression": "string", "version": "number", "dependencies": "FormulaDependency[]"},
	"FormulaDependency":      {"fieldId": "string", "fieldName": "string", "tableId": "string", "direction": "down|up"},
	"TableSchema":            {"table": "BaseTable", "fields": "FieldMeta[]", "views": "BaseView[]", "schemaVersion": "number", "formulas": "object[]"},
	"ConfigBundle":           {"version": "number", "table": "object", "fields": "object[]", "views": "object[]", "formulas": "object[]", "warnings": "string[]?"},
	"DeleteResult":           {"id": "string", "deleted": "boolean?"},
	"ErrorResponse":          {"code": "string", "message": "string", "data": "object?"},
	"EventStream":            {"event": "string", "data": "object?"},
	"BaseDetail":             {"base": "BaseInfo", "tables": "BaseTable[]", "views": "BaseView[]"},
	"BaseMetricsSnapshot":    {"operations": "object", "errors": "number", "slowQueries": "number", "p50Millis": "number", "p95Millis": "number", "p99Millis": "number", "outboxPublished": "number", "outboxFailed": "number", "outboxDead": "number", "idempotencyConflicts": "number", "activeSubscribers": "number"},
	"ImportJobRequest":       {"rows": "object[]", "mode": "string?"},
	"ImportJobInfo":          {"id": "string", "tableId": "string", "status": "string", "mode": "string", "total": "number", "processed": "number", "succeeded": "number", "failed": "number", "failures": "object[]?", "error": "string?"},
	"UserGroupInput":         {"name": "string", "description": "string?", "members": "string[]?", "sortOrder": "number?"},
	"UserGroupInfo":          {"id": "string", "name": "string", "description": "string", "members": "string[]", "memberCount": "number", "sortOrder": "number", "createdAt": "string"},
	"DeadLetter":             {"id": "string", "eventType": "string", "retryCount": "number", "status": "string", "createdAt": "string"},
}

// ListSchemas 把 `XxxList` 映射到元素类型。
var ListSchemas = map[string]string{
	"BaseInfoList":            "BaseInfo",
	"BaseTableList":           "BaseTable",
	"FieldMetaList":           "FieldMeta",
	"FieldTypeDefinitionList": "FieldTypeDefinition",
	"BaseViewList":            "BaseView",
	"RecordDocReferenceList":  "object",
	"RecordGrantList":         "object",
	"RelationList":            "object",
	"ComputedFieldList":       "object",
	"RecalcResult":            "object",
	"LinkTargetList":          "object",
	"FormulaDependencyList":   "FormulaDependency",
	"AuditList":               "object",
	"DocBackrefList":          "object",
	"BaseEmbedderList":        "object",
	"BatchResult":             "object",
	"ImportConfigResult":      "object",
	"ImportJobInfoList":       "ImportJobInfo",
	"UserGroupInfoList":       "UserGroupInfo",
	"DeadLetterList":          "DeadLetter",
}

// BuildOpenAPI 生成 OpenAPI 3.0 文档（map 形式）。
func BuildOpenAPI() map[string]any {
	paths := map[string]any{}
	for _, op := range RouteTable {
		item := map[string]any{}
		params := []any{}
		for _, prm := range op.Params {
			required := prm.Required
			params = append(params, map[string]any{
				"name": prm.Name, "in": prm.In, "required": required,
				"schema": map[string]any{"type": prm.Schema},
			})
		}
		entry := map[string]any{
			"summary":    op.Summary,
			"tags":       []string{op.Tag},
			"parameters": params,
			"responses": map[string]any{
				"200": map[string]any{
					"description": "成功",
					"content": map[string]any{
						"application/json": map[string]any{
							"schema": map[string]any{"$ref": "#/components/schemas/" + op.Response},
						},
					},
				},
				"400": errorResponse("40001 参数校验失败"),
				"401": errorResponse("40101 未认证"),
				"403": errorResponse("40301 无权限"),
				"404": errorResponse("40401 资源不存在或不可见"),
				"409": errorResponse("40901 版本冲突 / 40902 结构版本冲突"),
				"422": errorResponse("42201 字段值非法 / 42202 类型不兼容 / 42203 公式解析失败 / 42204 公式循环依赖"),
				"429": errorResponse("42901 请求过于频繁"),
				"500": errorResponse("50001 内部错误"),
			},
		}
		if op.RequestBody != "" {
			entry["requestBody"] = map[string]any{
				"required": true,
				"content": map[string]any{
					"application/json": map[string]any{
						"schema": map[string]any{"$ref": "#/components/schemas/" + op.RequestBody},
					},
				},
			}
		}
		item[strings.ToLower(op.Method)] = entry
		paths[op.Path] = item
	}
	schemas := map[string]any{}
	for name, fields := range Schemas {
		props := map[string]any{}
		for fname, ftype := range fields {
			props[fname] = map[string]any{"type": ftype}
		}
		schemas[name] = map[string]any{"type": "object", "properties": props}
	}
	for listName, itemName := range ListSchemas {
		schemas[listName] = map[string]any{
			"type":  "array",
			"items": map[string]any{"$ref": "#/components/schemas/" + itemName},
		}
	}
	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "MetaMatrix Base Engine API",
			"version":     "1.0.0",
			"description": "多维表格 Base Engine 接口（共享方案 §10）。错误码：40001/40101/40301/40401/40901/40902/42201/42202/42203/42204/42901/50001。",
		},
		"paths":      paths,
		"components": map[string]any{"schemas": schemas},
	}
}

func errorResponse(desc string) map[string]any {
	return map[string]any{
		"description": desc,
		"content": map[string]any{
			"application/json": map[string]any{
				"schema": map[string]any{"$ref": "#/components/schemas/ErrorResponse"},
			},
		},
	}
}

// OpenAPIHandler 输出 OpenAPI 文档。
func OpenAPIHandler(ctx context.Context, c *app.RequestContext) {
	c.JSON(http.StatusOK, BuildOpenAPI())
}
