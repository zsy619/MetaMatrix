package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"

	"metamatrix/api/internal/middleware"
)

// Handler 是 Base Engine 的 HTTP 层：只做参数解析与响应，事务在 Service 层。
type Handler struct {
	svc *Service
}

// NewHandler 构造 Base Engine 的 HTTP 处理器。
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		fail(c, http.StatusUnauthorized, "unauthorized", "40101", "未认证")
		return uuid.Nil, false
	}
	return uid, true
}

// idempotencyKey 读取请求头中的幂等键（共享方案 §10.9）。
//
// 客户端在批量创建 / 导入 / 重试类请求上带 `Idempotency-Key`，
// 服务端据此保证「重复提交只生效一次」。
func idempotencyKey(c *app.RequestContext) string {
	return strings.TrimSpace(string(c.GetHeader("Idempotency-Key")))
}

// fail 输出统一错误结构。
func fail(c *app.RequestContext, status int, message, code, detail string) {
	middleware.ErrorJSON(c, status, message, code, map[string]any{"detail": detail})
}

// handleErr 把领域错误映射为 HTTP 状态码。
func handleErr(c *app.RequestContext, err error) {
	switch {
	case err == nil:
		return
	case errors.Is(err, ErrBaseNotFound):
		fail(c, http.StatusNotFound, "base not found", "40401", err.Error())
	case errors.Is(err, ErrTableNotFound):
		fail(c, http.StatusNotFound, "table not found", "40401", err.Error())
	case errors.Is(err, ErrFieldNotFound):
		fail(c, http.StatusNotFound, "field not found", "40401", err.Error())
	case errors.Is(err, ErrRecordNotFound):
		fail(c, http.StatusNotFound, "record not found", "40401", err.Error())
	case errors.Is(err, ErrViewNotFound):
		fail(c, http.StatusNotFound, "view not found", "40401", err.Error())
	case errors.Is(err, ErrForbidden):
		fail(c, http.StatusForbidden, "forbidden", "40301", err.Error())
	case errors.Is(err, ErrVersionConflict):
		fail(c, http.StatusConflict, "version conflict", "40901", err.Error())
	case errors.Is(err, ErrSchemaConflict):
		fail(c, http.StatusConflict, "schema conflict", "40902", err.Error())
	case errors.Is(err, ErrIdempotencyConflict):
		fail(c, http.StatusConflict, "idempotency key conflict", "40901", err.Error())
	case errors.Is(err, ErrIdempotencyInFlight):
		fail(c, http.StatusConflict, "idempotency request in flight", "40901", err.Error())
	case errors.Is(err, ErrFormulaCycle):
		fail(c, http.StatusUnprocessableEntity, "formula cycle", "42204", err.Error())
	case errors.Is(err, ErrFieldValueInvalid):
		fail(c, http.StatusUnprocessableEntity, "invalid field value", "42201", err.Error())
	case errors.Is(err, ErrFieldTypeIncompatible):
		fail(c, http.StatusUnprocessableEntity, "field type incompatible", "42202", err.Error())
	case errors.Is(err, ErrFormulaParse):
		fail(c, http.StatusUnprocessableEntity, "formula parse error", "42203", err.Error())
	case errors.Is(err, ErrRateLimited):
		fail(c, http.StatusTooManyRequests, "too many requests", "42901", err.Error())
	case errors.Is(err, ErrQueryTooLarge):
		fail(c, http.StatusUnprocessableEntity, "query too large", "42201", err.Error())
	case errors.Is(err, ErrQueryInvalid):
		fail(c, http.StatusBadRequest, "invalid query", "40001", err.Error())
	case errors.Is(err, ErrBundleSignatureInvalid):
		fail(c, http.StatusBadRequest, "config bundle signature invalid", "40002", err.Error())
	default:
		fail(c, http.StatusInternalServerError, "internal error", "50001", err.Error())
	}
}

// projectID 从路径取项目 ID。
func projectID(c *app.RequestContext) (uuid.UUID, bool) {
	raw := c.Param("projectId")
	id, err := uuid.Parse(raw)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid project id", "40001", err.Error())
		return uuid.Nil, false
	}
	return id, true
}

func pathUUID(c *app.RequestContext, name string) (uuid.UUID, bool) {
	raw := c.Param(name)
	id, err := uuid.Parse(raw)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid "+name, "40001", err.Error())
		return uuid.Nil, false
	}
	return id, true
}

// —— Base ——

// EnsureBase 取或创建当前节点对应的 Base。
func (h *Handler) EnsureBase(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	var body struct {
		NodeID string `json:"nodeId"`
		Name   string `json:"name"`
	}
	_ = c.BindAndValidate(&body)
	nodeID, err := uuid.Parse(body.NodeID)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid nodeId", "40001", err.Error())
		return
	}
	info, err := h.svc.EnsureBase(ctx, uid, projectID, nodeID, body.Name)
	if err != nil {
		handleErr(c, err)
		return
	}
	// 旧版多维表格（整块 JSONB）自动迁移到 Base Engine，幂等。
	if err := h.svc.MigrateIfNeeded(ctx, uid, projectID, nodeID); err != nil {
		// 迁移失败不挡门：标记失败状态，前端回落到旧数据的只读模式。
		_ = h.svc.MarkMigrationFailed(ctx, info.ID, err.Error())
		info.Migrated = "failed:" + err.Error()
	}
	c.JSON(http.StatusOK, info)
}

// ListBases 列出空间内的 Base。
func (h *Handler) ListBases(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	rows, err := h.svc.ListBases(ctx, uid, projectID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// CreateBase 创建一个独立 Base（不依赖知识库节点）。
func (h *Handler) CreateBase(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	var body BaseUpdateInput
	_ = c.BindAndValidate(&body)
	info, err := h.svc.CreateBase(ctx, uid, projectID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// UpdateBase 更新 Base 元信息（名称 / 描述 / 图标）。
func (h *Handler) UpdateBase(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	var body BaseUpdateInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.UpdateBase(ctx, uid, projectID, baseID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// DeleteBase 删除 Base（软删，级联表 / 字段 / 记录 / 视图）。
func (h *Handler) DeleteBase(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	if err := h.svc.DeleteBase(ctx, uid, projectID, baseID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"id": baseID, "deleted": true})
}

// —— Table ——

// ListTables 列出 Base 下的表。
func (h *Handler) ListTables(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	rows, err := h.svc.ListTables(ctx, uid, projectID, baseID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// CreateTable 建表。
func (h *Handler) CreateTable(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.CreateTable(ctx, uid, projectID, baseID, body.Name, body.Description)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, info)
}

// UpdateTable 改表。
func (h *Handler) UpdateTable(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.UpdateTable(ctx, uid, projectID, tableID, body.Name, body.Description)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// DeleteTable 删表。
func (h *Handler) DeleteTable(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	if err := h.svc.DeleteTable(ctx, uid, projectID, tableID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// —— Field ——

// ListFields 列出表字段。
func (h *Handler) ListFields(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	rows, err := h.svc.ListFields(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// FieldTypes 返回支持的字段类型与能力。
func (h *Handler) FieldTypes(ctx context.Context, c *app.RequestContext) {
	c.JSON(http.StatusOK, h.svc.Registry().Definitions())
}

// Metrics 输出 Base Engine 的运行指标。
//
//   - Accept: application/json（默认）→ JSON 快照
//   - Accept: text/plain → Prometheus 文本
func (h *Handler) Metrics(ctx context.Context, c *app.RequestContext) {
	accept := strings.ToLower(string(c.GetHeader("Accept")))
	if strings.Contains(accept, "text/plain") {
		c.String(http.StatusOK, PrometheusBaseMetrics())
		return
	}
	c.JSON(http.StatusOK, SnapshotBaseMetrics())
}

// MetricsPrometheus 单独暴露 Prometheus 文本（路径固定，方便采集器配置）。
func (h *Handler) MetricsPrometheus(ctx context.Context, c *app.RequestContext) {
	c.String(http.StatusOK, PrometheusBaseMetrics())
}

// GetBase Base 详情（技术文档 §10：GET /bases/{baseId}）。
func (h *Handler) GetBase(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	info, err := h.svc.GetBaseDetail(ctx, uid, projectID, baseID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// GetRecord 记录详情（技术文档 §10：GET /records/{recordId}）。
func (h *Handler) GetRecord(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	row, err := h.svc.GetRecord(ctx, uid, projectID, recordID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

// GetView 视图详情（技术文档 §10：GET /views/{viewId}）。
func (h *Handler) GetView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	viewID, ok := pathUUID(c, "viewId")
	if !ok {
		return
	}
	info, err := h.svc.GetView(ctx, uid, projectID, viewID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// QueryView 按视图配置查询数据（技术文档 §10：POST /views/{viewId}/query）。
func (h *Handler) QueryView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	viewID, ok := pathUUID(c, "viewId")
	if !ok {
		return
	}
	var body QueryRequest
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	result, err := h.svc.QueryByView(ctx, uid, projectID, viewID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// CreateField 创建字段。
func (h *Handler) CreateField(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body FieldInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	meta, err := h.svc.CreateField(ctx, uid, projectID, tableID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, meta)
}

// UpdateField 修改字段。
func (h *Handler) UpdateField(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	var body FieldUpdateInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	meta, err := h.svc.UpdateField(ctx, uid, projectID, fieldID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, meta)
}

// ReorderFields 重排字段顺序：body 为该表全部字段 id 的新顺序。
func (h *Handler) ReorderFields(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		FieldIDs []string `json:"fieldIds"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	ids := make([]uuid.UUID, 0, len(body.FieldIDs))
	for _, raw := range body.FieldIDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			fail(c, http.StatusBadRequest, "invalid fieldIds", "40001", err.Error())
			return
		}
		ids = append(ids, id)
	}
	metas, err := h.svc.ReorderFields(ctx, uid, projectID, tableID, ids)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, metas)
}

// DeleteField 删除字段。
func (h *Handler) DeleteField(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	if err := h.svc.DeleteField(ctx, uid, projectID, fieldID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// MigrateField 迁移字段类型。
func (h *Handler) MigrateField(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	var body struct {
		Type string `json:"type"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	meta, err := h.svc.MigrateField(ctx, uid, projectID, fieldID, body.Type)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, meta)
}

// —— Record ——

// CreateRecord 新建记录。
func (h *Handler) CreateRecord(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body RecordInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	row, err := h.svc.CreateRecord(ctx, uid, projectID, tableID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, row)
}

// QueryRecords 统一查询：筛选、排序、分组、分页都在服务端完成。
func (h *Handler) QueryRecords(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body QueryRequest
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	if body.TableID == "" {
		body.TableID = tableID.String()
	}
	result, err := h.svc.Query(ctx, uid, projectID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// UpdateRecord 更新记录。
func (h *Handler) UpdateRecord(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	var body RecordInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	row, err := h.svc.UpdateRecord(ctx, uid, projectID, recordID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, row)
}

// DeleteRecord 删除记录。
func (h *Handler) DeleteRecord(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	if err := h.svc.DeleteRecord(ctx, uid, projectID, recordID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// BatchRecords 批量操作：动作 = create | update | delete。
func (h *Handler) BatchRecords(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Action string         `json:"action"`
		IDs    []string       `json:"ids"`
		Fields map[string]any `json:"fields"`
		Rows   []RecordInput  `json:"rows"`
		// Partial=true 时允许「部分成功」：逐条执行，失败项收集成明细返回。
		Partial bool `json:"partial"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	// 幂等键（共享方案 §10.9）：批量写入是「重试最容易重复落数据」的场景，
	// 客户端带 Idempotency-Key 时，同键重试只生效一次并回放首次响应。
	result, err := h.svc.Idempotent(ctx, uid, projectID, "base.batchRecords", idempotencyKey(c), body, http.StatusOK,
		func(ctx context.Context) (any, error) {
			return h.runBatchRecords(ctx, uid, projectID, tableID, body)
		})
	if err != nil {
		handleErr(c, err)
		return
	}
	status := result.Status
	if status == 0 {
		status = http.StatusOK
	}
	c.JSON(status, result.Body)
}

// runBatchRecords 执行批量动作本体（供幂等包装调用）。
func (h *Handler) runBatchRecords(ctx context.Context, uid, projectID, tableID uuid.UUID, body struct {
	Action  string         `json:"action"`
	IDs     []string       `json:"ids"`
	Fields  map[string]any `json:"fields"`
	Rows    []RecordInput  `json:"rows"`
	Partial bool           `json:"partial"`
}) (any, error) {
	switch body.Action {
	case "create":
		if body.Partial {
			rows, failures := h.svc.BatchCreatePartial(ctx, uid, projectID, tableID, body.Rows)
			return map[string]any{
				"rows":      rows,
				"failures":  failures,
				"succeeded": len(rows),
				"failed":    len(failures),
			}, nil
		}
		rows, err := h.svc.BatchCreate(ctx, uid, projectID, tableID, body.Rows)
		if err != nil {
			return nil, err
		}
		return rows, nil
	case "update":
		ids, err := parseRecordIDs(body.IDs)
		if err != nil {
			return nil, err
		}
		if body.Partial {
			rows, failures := h.svc.BatchUpdatePartial(ctx, uid, projectID, tableID, ids, body.Fields)
			return map[string]any{
				"rows":      rows,
				"failures":  failures,
				"succeeded": len(rows),
				"failed":    len(failures),
			}, nil
		}
		rows, err := h.svc.BatchUpdate(ctx, uid, projectID, tableID, ids, body.Fields)
		if err != nil {
			return nil, err
		}
		return rows, nil
	case "delete":
		ids, err := parseRecordIDs(body.IDs)
		if err != nil {
			return nil, err
		}
		if body.Partial {
			failures := h.svc.BatchDeletePartial(ctx, uid, projectID, tableID, ids)
			return map[string]any{
				"rows":      []RecordRow{},
				"failures":  failures,
				"succeeded": len(ids) - len(failures),
				"failed":    len(failures),
			}, nil
		}
		if err := h.svc.BatchDelete(ctx, uid, projectID, tableID, ids); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, nil
	default:
		return nil, fmt.Errorf("%w: unknown batch action %q", ErrQueryInvalid, body.Action)
	}
}

// parseRecordIDs 解析记录 ID 列表。
func parseRecordIDs(raws []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(raws))
	for _, raw := range raws {
		id, err := uuid.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid record id", ErrQueryInvalid)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// ListBaseEmbedders 列出内嵌了本 Base 的文档。
func (h *Handler) ListBaseEmbedders(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	items, err := h.svc.ListBaseEmbedders(ctx, uid, projectID, baseID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// ListRecordDocReferences 列出引用了本记录的文档。
func (h *Handler) ListRecordDocReferences(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	items, err := h.svc.ListRecordDocReferences(ctx, uid, projectID, recordID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// ReorderRecords 按给定顺序重排记录。
func (h *Handler) ReorderRecords(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	ids := make([]uuid.UUID, 0, len(body.IDs))
	for _, raw := range body.IDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			fail(c, http.StatusBadRequest, "invalid record id", "40001", err.Error())
			return
		}
		ids = append(ids, id)
	}
	if err := h.svc.ReorderRecords(ctx, uid, projectID, tableID, ids); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true, "count": len(ids)})
}

// ListRecordRelations 列出记录的正向 / 反向关联关系。
func (h *Handler) ListRecordRelations(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	result, err := h.svc.ListRecordRelations(ctx, uid, projectID, recordID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// RecalcLookupRollup 手动触发引用 / 汇总字段重算。
//
// 跨表计算默认异步；界面上的「立即重算」按钮走这个接口。
func (h *Handler) RecalcLookupRollup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	updated, err := h.svc.RecalcLookupRollup(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"updated": updated})
}

// ListComputedFields 列出本表的引用 / 汇总字段配置。
func (h *Handler) ListComputedFields(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	items, err := h.svc.ListComputedFields(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// ListLinkTargets 列出目标表记录候选（关联记录选择器数据源）。
func (h *Handler) ListLinkTargets(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	var targetTableID *uuid.UUID
	if raw := c.Query("targetTableId"); raw != "" {
		if parsed, err := uuid.Parse(raw); err == nil {
			targetTableID = &parsed
		}
	}
	items, err := h.svc.ListLinkTargetsPage(
		ctx, uid, projectID, tableID, c.Query("keyword"), limit, c.Query("cursor"), targetTableID,
	)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// —— View ——

// ListViews 列出视图。
func (h *Handler) ListViews(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	rows, err := h.svc.ListViews(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// CreateView 新建视图。
func (h *Handler) CreateView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Name   string         `json:"name"`
		Type   string         `json:"type"`
		Config map[string]any `json:"config"`
		Scope  string         `json:"scope"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.CreateView(ctx, uid, projectID, tableID, body.Name, body.Type, body.Config, body.Scope)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, info)
}

// UpdateView 更新视图。
func (h *Handler) UpdateView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	viewID, ok := pathUUID(c, "viewId")
	if !ok {
		return
	}
	var body struct {
		Name    *string        `json:"name"`
		Type    *string        `json:"type"`
		Config  map[string]any `json:"config"`
		Version int64          `json:"version"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.UpdateView(ctx, uid, projectID, viewID, body.Name, body.Type, body.Config, body.Version)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// DeleteView 删除视图。
func (h *Handler) DeleteView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	viewID, ok := pathUUID(c, "viewId")
	if !ok {
		return
	}
	if err := h.svc.DeleteView(ctx, uid, projectID, viewID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// —— Formula ——

// ValidateFormula 校验公式。
func (h *Handler) ValidateFormula(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Expression string `json:"expression"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	result, err := h.svc.ValidateFormula(ctx, uid, projectID, tableID, body.Expression)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// PreviewFormula 预览公式。
func (h *Handler) PreviewFormula(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Expression string         `json:"expression"`
		Sample     map[string]any `json:"sample"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	result, err := h.svc.PreviewFormula(ctx, uid, projectID, tableID, body.Expression, body.Sample)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// SaveFormula 保存公式。
func (h *Handler) SaveFormula(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	var body struct {
		Expression string `json:"expression"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	if err := h.svc.SaveFormula(ctx, uid, projectID, fieldID, body.Expression); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// ListRecordGrants 列出记录的可见成员（指定成员可见时）。
func (h *Handler) ListRecordGrants(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	recordID, ok := pathUUID(c, "recordId")
	if !ok {
		return
	}
	rows, err := h.svc.ListRecordGrants(ctx, uid, projectID, recordID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// ListSpaceDepartments 列出空间成员出现过的部门（用于「按部门授权」）。
func (h *Handler) ListSpaceDepartments(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	rows, err := h.svc.ListSpaceDepartments(ctx, uid, projectID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// ListAudit 列出操作审计。
func (h *Handler) ListAudit(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	baseID, ok := pathUUID(c, "baseId")
	if !ok {
		return
	}
	q := AuditQuery{Action: c.Query("action")}
	q.Limit, _ = strconv.Atoi(c.Query("limit"))
	q.Offset, _ = strconv.Atoi(c.Query("offset"))
	if from := c.Query("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			q.From = &t
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			q.To = &t
		}
	}
	if op := c.Query("operator"); op != "" {
		if id, err := uuid.Parse(op); err == nil {
			q.OperatorID = id
		}
	}
	if rec := c.Query("recordId"); rec != "" {
		if id, err := uuid.Parse(rec); err == nil {
			q.RecordID = id
		} else {
			q.RecordPrefix = rec
		}
	}
	rows, total, err := h.svc.ListAuditEntries(ctx, uid, projectID, baseID, q)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{
		"items":  rows,
		"total":  total,
		"limit":  q.Limit,
		"offset": q.Offset,
	})
}

// ListDocBackrefs 列出引用该文档的多维表格记录（文档侧反向引用）。
func (h *Handler) ListDocBackrefs(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	nodeID, ok := pathUUID(c, "nodeId")
	if !ok {
		return
	}
	rows, err := h.svc.ListDocBackrefs(ctx, uid, projectID, nodeID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// Events 是 SSE 事件流：推送已提交的业务事件。
//
// 事件 JSON 与 WebSocket 版本一致，后续换传输层不影响客户端。
func (h *Handler) Events(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	if err := h.svc.assertAccess(uid, projectID, RoleViewer); err != nil {
		handleErr(c, err)
		return
	}
	ch, cancel := h.svc.Events().Subscribe(projectID)

	c.Response.Header.Set("Content-Type", "text/event-stream")
	c.Response.Header.Set("Cache-Control", "no-cache")
	c.Response.Header.Set("Connection", "keep-alive")
	c.Response.Header.Set("X-Accel-Buffering", "no")

	pr, pw := io.Pipe()
	c.SetBodyStream(pr, -1)

	// 断线补拉：客户端带上最后一个 eventId，服务端把这段时间错过的事件补发。
	lastEventID := string(c.GetHeader("Last-Event-ID"))
	if lastEventID == "" {
		lastEventID = c.Query("lastEventId")
	}
	// 时间水位：客户端只要给「上次同步到的时刻」就能拿增量（不必记住事件 ID）。
	var since time.Time
	if raw := c.Query("since"); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			since = parsed
		}
	}

	go func() {
		defer cancel()
		defer pw.Close()
		if _, err := pw.Write([]byte(": connected\n\n")); err != nil {
			return
		}
		// 先补发断线期间错过的事件，再进入实时订阅。
		if lastEventID != "" {
			missed, err := h.svc.ReplaySince(ctx, projectID, lastEventID, 200)
			if err == nil {
				for _, event := range missed {
					payload, mErr := marshalEvent(event)
					if mErr != nil {
						continue
					}
					if _, wErr := pw.Write(payload); wErr != nil {
						return
					}
				}
			}
		}
		if !since.IsZero() {
			missed, err := h.svc.ReplaySinceTime(ctx, projectID, since, 200)
			if err == nil {
				for _, event := range missed {
					payload, mErr := marshalEvent(event)
					if mErr != nil {
						continue
					}
					if _, wErr := pw.Write(payload); wErr != nil {
						return
					}
				}
			}
		}
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				pw.CloseWithError(context.Canceled)
				return
			case event, open := <-ch:
				if !open {
					pw.Close()
					return
				}
				payload, err := marshalEvent(event)
				if err != nil {
					continue
				}
				if _, err := pw.Write(payload); err != nil {
					return
				}
			case <-ticker.C:
				if _, err := pw.Write([]byte(": ping\n\n")); err != nil {
					return
				}
			}
		}
	}()
}

// marshalEvent 把事件序列化成 SSE 帧。
func marshalEvent(event BaseEvent) ([]byte, error) {
	raw, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	return []byte(fmt.Sprintf("id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.EventType, raw)), nil
}

// —— 表配置包（第十六轮）——

// ExportTableConfig 导出一张表的配置包（字段类型 / 选项 / 公式 / 权限策略 / 视图）。
func (h *Handler) ExportTableConfig(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	bundle, err := h.svc.ExportTableConfig(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	raw, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal error", "50001", err.Error())
		return
	}
	c.Response.Header.Set("Content-Type", "application/json; charset=utf-8")
	c.Response.Header.Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=\"%s.config.json\"", sanitizeFileName(bundle.Table.Name)))
	c.Response.Header.Set("Access-Control-Expose-Headers", "Content-Disposition")
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}

// ImportTableConfig 从配置包导入（新建一张表，不覆盖原表）。
// ExportTableConfigEncrypted 导出一张表的**加密**配置包（口令由调用方提供）。
//
// 与普通导出的区别：包体是 AES-256-GCM 密文，只有知道口令的人能导入。
func (h *Handler) ExportTableConfigEncrypted(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Passphrase string `json:"passphrase"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	bundle, err := h.svc.ExportTableConfig(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	enc, err := EncryptBundle(bundle, body.Passphrase)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid passphrase", "40001", err.Error())
		return
	}
	raw, err := json.MarshalIndent(enc, "", "  ")
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal error", "50001", err.Error())
		return
	}
	c.Response.Header.Set("Content-Type", "application/json; charset=utf-8")
	c.Response.Header.Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=\"%s.config.enc.json\"", sanitizeFileName(bundle.Table.Name)))
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}

// ImportTableConfigEncrypted 导入**加密**配置包。
func (h *Handler) ImportTableConfigEncrypted(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	var body struct {
		BaseID     string           `json:"baseId"`
		Passphrase string           `json:"passphrase"`
		Bundle     *EncryptedBundle `json:"bundle"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	baseID, err := uuid.Parse(body.BaseID)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid base id", "40001", err.Error())
		return
	}
	bundle, err := DecryptBundle(body.Bundle, body.Passphrase)
	if err != nil {
		fail(c, http.StatusBadRequest, "cannot decrypt bundle", "40001", err.Error())
		return
	}
	outcome, err := h.svc.Idempotent(ctx, uid, projectID, "base.importTableConfigEncrypted", idempotencyKey(c), body, http.StatusCreated,
		func(ctx context.Context) (any, error) {
			result, err := h.svc.ImportTableConfig(ctx, uid, projectID, baseID, bundle)
			if err != nil {
				return nil, err
			}
			return map[string]any{
				"tableId":  result.Table.ID,
				"table":    result.Table,
				"warnings": result.Warnings,
			}, nil
		})
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(outcome.Status, outcome.Body)
}

func (h *Handler) ImportTableConfig(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	var body struct {
		BaseID string        `json:"baseId"`
		Bundle *ConfigBundle `json:"bundle"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	baseID, err := uuid.Parse(body.BaseID)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid base id", "40001", err.Error())
		return
	}
	// 幂等键：配置包导入是典型的「网络抖动后重试」场景，
	// 同键重试不能重复建表。
	outcome, err := h.svc.Idempotent(ctx, uid, projectID, "base.importTableConfig", idempotencyKey(c), body, http.StatusCreated,
		func(ctx context.Context) (any, error) {
			result, err := h.svc.ImportTableConfig(ctx, uid, projectID, baseID, body.Bundle)
			if err != nil {
				return nil, err
			}
			return map[string]any{
				"tableId":  result.Table.ID,
				"table":    result.Table,
				"warnings": result.Warnings,
			}, nil
		})
	if err != nil {
		handleErr(c, err)
		return
	}
	status := outcome.Status
	if status == 0 {
		status = http.StatusCreated
	}
	c.JSON(status, outcome.Body)
}

// MergeTableConfig 把配置包合并进一张已有表（按字段名匹配，已存在的字段跳过）。
func (h *Handler) MergeTableConfig(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body struct {
		Bundle *ConfigBundle `json:"bundle"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	result, err := h.svc.MergeTableConfig(ctx, uid, projectID, tableID, body.Bundle)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{
		"tableId":  result.Table.ID,
		"table":    result.Table,
		"warnings": result.Warnings,
	})
}

// sanitizeFileName 把表名转成安全的下载文件名。
func sanitizeFileName(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_', r == '.', r == ' ':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "table"
	}
	return out
}

// GetFieldFormula 读取公式定义（§10.7）。
func (h *Handler) GetFieldFormula(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	def, err := h.svc.GetFieldFormula(ctx, uid, projectID, fieldID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, def)
}

// ListFormulaDependencies 列出公式依赖图（§10.7）。
func (h *Handler) ListFormulaDependencies(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	fieldID, ok := pathUUID(c, "fieldId")
	if !ok {
		return
	}
	deps, err := h.svc.ListFormulaDependencies(ctx, uid, projectID, fieldID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, deps)
}

// TableSchema 返回表结构快照（§10.3）。
func (h *Handler) TableSchema(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	schema, err := h.svc.TableSchema(ctx, uid, projectID, tableID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, schema)
}

// TransferRecord 跨表复制 / 移动记录（E-03）。
func (h *Handler) TransferRecord(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body TransferRecordInput
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	result, err := h.svc.TransferRecord(ctx, uid, projectID, tableID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// SummaryRecords 计算视图的汇总行 / 分组小计（E-07）。
func (h *Handler) SummaryRecords(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var body SummaryRequest
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	if body.TableID == "" {
		body.TableID = tableID.String()
	}
	result, err := h.svc.Summary(ctx, uid, projectID, body)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// CreateImportJob 提交异步导入任务（技术文档 §16.2）。
func (h *Handler) CreateImportJob(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	var payload ImportJobPayload
	if err := c.BindAndValidate(&payload); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	job, err := h.svc.CreateImportJob(ctx, uid, projectID, tableID, payload)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusAccepted, job)
}

// GetImportJob 查询导入任务进度。
func (h *Handler) GetImportJob(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	jobID, ok := pathUUID(c, "jobId")
	if !ok {
		return
	}
	job, err := h.svc.GetImportJob(ctx, uid, projectID, jobID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, job)
}

// ListImportJobs 列出某张表的导入任务。
func (h *Handler) ListImportJobs(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	tableID, ok := pathUUID(c, "tableId")
	if !ok {
		return
	}
	limit := 20
	if raw := string(c.Query("limit")); raw != "" {
		if parsed, perr := strconv.Atoi(raw); perr == nil {
			limit = parsed
		}
	}
	jobs, err := h.svc.ListImportJobs(ctx, uid, projectID, tableID, limit)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, jobs)
}

// CancelImportJob 取消导入任务。
func (h *Handler) CancelImportJob(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	jobID, ok := pathUUID(c, "jobId")
	if !ok {
		return
	}
	job, err := h.svc.CancelImportJob(ctx, uid, projectID, jobID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, job)
}

// ListUserGroups 列出通讯录分组。
func (h *Handler) ListUserGroups(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	groups, err := h.svc.ListUserGroups(ctx, uid, projectID)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, groups)
}

// CreateUserGroup 新建通讯录分组。
func (h *Handler) CreateUserGroup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	var in UserGroupInput
	if err := c.BindAndValidate(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	group, err := h.svc.CreateUserGroup(ctx, uid, projectID, in)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, group)
}

// UpdateUserGroup 修改通讯录分组。
func (h *Handler) UpdateUserGroup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	groupID, ok := pathUUID(c, "groupId")
	if !ok {
		return
	}
	var in UserGroupInput
	if err := c.BindAndValidate(&in); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	group, err := h.svc.UpdateUserGroup(ctx, uid, projectID, groupID, in)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, group)
}

// DeleteUserGroup 删除通讯录分组。
func (h *Handler) DeleteUserGroup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	groupID, ok := pathUUID(c, "groupId")
	if !ok {
		return
	}
	if err := h.svc.DeleteUserGroup(ctx, uid, projectID, groupID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// ListDeadLetters 列出死信事件（运维排查）。
func (h *Handler) ListDeadLetters(ctx context.Context, c *app.RequestContext) {
	if _, ok := h.owner(c); !ok {
		return
	}
	projectID, ok := projectID(c)
	if !ok {
		return
	}
	rows, err := h.svc.ListDeadLetters(ctx, projectID, 50)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// RetryDeadLetter 人工重投一条死信。
func (h *Handler) RetryDeadLetter(ctx context.Context, c *app.RequestContext) {
	if _, ok := h.owner(c); !ok {
		return
	}
	eventID, ok := pathUUID(c, "eventId")
	if !ok {
		return
	}
	if err := h.svc.RetryDeadLetter(ctx, eventID); err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}
