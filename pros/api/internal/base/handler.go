package base

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
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
	case errors.Is(err, ErrFormulaCycle):
		fail(c, http.StatusUnprocessableEntity, "formula cycle", "42204", err.Error())
	case errors.Is(err, ErrFieldValueInvalid):
		fail(c, http.StatusUnprocessableEntity, "invalid field value", "42201", err.Error())
	case errors.Is(err, ErrQueryTooLarge):
		fail(c, http.StatusUnprocessableEntity, "query too large", "42201", err.Error())
	case errors.Is(err, ErrQueryInvalid):
		fail(c, http.StatusBadRequest, "invalid query", "40001", err.Error())
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
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	switch body.Action {
	case "create":
		rows, err := h.svc.BatchCreate(ctx, uid, projectID, tableID, body.Rows)
		if err != nil {
			handleErr(c, err)
			return
		}
		c.JSON(http.StatusOK, rows)
	case "update":
		ids := make([]uuid.UUID, 0, len(body.IDs))
		for _, raw := range body.IDs {
			id, err := uuid.Parse(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, "invalid record id", "40001", err.Error())
				return
			}
			ids = append(ids, id)
		}
		rows, err := h.svc.BatchUpdate(ctx, uid, projectID, tableID, ids, body.Fields)
		if err != nil {
			handleErr(c, err)
			return
		}
		c.JSON(http.StatusOK, rows)
	case "delete":
		ids := make([]uuid.UUID, 0, len(body.IDs))
		for _, raw := range body.IDs {
			id, err := uuid.Parse(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, "invalid record id", "40001", err.Error())
				return
			}
			ids = append(ids, id)
		}
		if err := h.svc.BatchDelete(ctx, uid, projectID, tableID, ids); err != nil {
			handleErr(c, err)
			return
		}
		c.JSON(http.StatusOK, map[string]any{"ok": true})
	default:
		fail(c, http.StatusBadRequest, "unknown batch action", "40001", body.Action)
	}
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
	}
	if err := c.BindAndValidate(&body); err != nil {
		fail(c, http.StatusBadRequest, "invalid body", "40001", err.Error())
		return
	}
	info, err := h.svc.CreateView(ctx, uid, projectID, tableID, body.Name, body.Type, body.Config)
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
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := h.svc.ListAudit(ctx, uid, projectID, baseID, limit)
	if err != nil {
		handleErr(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
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

	go func() {
		defer cancel()
		defer pw.Close()
		if _, err := pw.Write([]byte(": connected\n\n")); err != nil {
			return
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
