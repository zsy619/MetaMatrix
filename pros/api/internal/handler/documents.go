package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

type DocumentsHandler struct {
	svc *service.DocumentsService
}

func NewDocumentsHandler(svc *service.DocumentsService) *DocumentsHandler {
	return &DocumentsHandler{svc: svc}
}

type createDocBody struct {
	Title      *string `json:"title"`
	Notes      *string `json:"notes"`
	CanvasType *string `json:"canvasType"`
	TemplateID *string `json:"templateId"`
	// ProjectID 画布归属的项目。空字符串或缺省表示不属于任何项目。
	ProjectID *string         `json:"projectId"`
	Data      json.RawMessage `json:"data"`
}

type updateDocBody struct {
	Title                  *string         `json:"title"`
	Notes                  *string         `json:"notes"`
	CurrentData            json.RawMessage `json:"currentData"`
	ExpectedHeadRevisionID *string         `json:"expectedHeadRevisionId"`
	// ExpectedSaveVersion 是内容版本乐观锁。客户端从 GET 响应里拿到
	// saveVersion 后原样带回；省略表示旧客户端，不做版本比较。
	ExpectedSaveVersion *int64 `json:"expectedSaveVersion"`
	Checkpoint          bool   `json:"checkpoint"`
	OperationID         string `json:"operationId"`
}

type createRevBody struct {
	ExpectedHeadRevisionID *string `json:"expectedHeadRevisionId"`
	ExpectedSaveVersion    *int64  `json:"expectedSaveVersion"`
	Label                  *string `json:"label"`
}

type restoreBody struct {
	RevisionID             string  `json:"revisionId"`
	ExpectedHeadRevisionID *string `json:"expectedHeadRevisionId"`
	ExpectedSaveVersion    *int64  `json:"expectedSaveVersion"`
	Label                  *string `json:"label"`
}

func (h *DocumentsHandler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
	}
	return uid, ok
}

func parseID(c *app.RequestContext, name string) (uuid.UUID, bool) {
	raw := c.Param(name)
	id, err := uuid.Parse(raw)
	if err != nil {
		BadRequest(c, "invalid "+name)
		return uuid.Nil, false
	}
	return id, true
}

func handleDocErr(c *app.RequestContext, err error, doc interface{}) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, service.ErrDocumentNotFound):
		NotFound(c, "document not found")
	case errors.Is(err, service.ErrRevisionNotFound):
		NotFound(c, "revision not found")
	case errors.Is(err, service.ErrHeadConflict), errors.Is(err, service.ErrSaveConflict):
		// 两种冲突都返回 409，但把最新 saveVersion 一起带回。
		// 客户端据此可以只覆盖自己真正落后的部分，而不是盲目重试。
		middleware.ErrorJSON(c, http.StatusConflict, "document was updated elsewhere", "head_conflict", map[string]interface{}{
			"headRevisionId": extractDocField(doc, "headRevisionId"),
			"saveVersion":    extractDocField(doc, "saveVersion"),
		})
	case errors.Is(err, service.ErrNotSnapshot):
		Conflict(c, err.Error(), nil)
	case errors.Is(err, service.ErrOperationConflict):
		Fail(c, http.StatusConflict, "operationId was reused with a different payload", "operation_conflict")
	case errors.Is(err, service.ErrBackupImportConflict):
		// 批次号唯一标识一次导入意图；相同号码对应另一份文件时绝不能继续写入，
		// 否则客户端拿错批次号重试会把两份备份混在同一幂等结果里。
		Fail(c, http.StatusConflict, "importBatchId was reused with a different backup", "backup_import_conflict")
	case errors.Is(err, service.ErrValidation), errors.Is(err, service.ErrInvalidHead):
		Fail(c, http.StatusBadRequest, "validation failed", "validation_error")
	case errors.Is(err, service.ErrPayloadTooLarge):
		Fail(c, http.StatusRequestEntityTooLarge, "payload too large", "payload_too_large")
	default:
		log.Printf("document error: %v", err)
		Internal(c, "request failed")
	}
	return true
}

// extractDocField 从任意文档响应体里取出一个 JSON 字段。
// 冲突响应需要同时带 headRevisionId 和 saveVersion，所以做成通用取值。
func extractDocField(doc interface{}, field string) interface{} {
	if doc == nil {
		return nil
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return nil
	}
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	return m[field]
}

func (h *DocumentsHandler) Create(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body createDocBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	projectID, err := parseOptionalUUID(body.ProjectID)
	if err != nil {
		BadRequest(c, "invalid projectId")
		return
	}
	doc, err := h.svc.Create(uid, service.CreateDocumentInput{
		Title:      body.Title,
		Notes:      body.Notes,
		CanvasType: body.CanvasType,
		TemplateID: body.TemplateID,
		ProjectID:  projectID,
		Data:       body.Data,
	})
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusCreated, doc)
}

type cloneDocBody struct {
	Title *string `json:"title"`
	Notes *string `json:"notes"`
}

// Clone creates a new document that is a deep copy of the source document.
func (h *DocumentsHandler) Clone(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body cloneDocBody
	_ = c.BindAndValidate(&body)
	doc, err := h.svc.Clone(uid, id, service.CloneDocumentInput{
		Title: body.Title,
		Notes: body.Notes,
	})
	if handleDocErr(c, err, nil) {
		return
	}
	middleware.Audit(c, "clone", uid.String(), "source="+id.String()+" id="+doc.ID.String())
	c.JSON(http.StatusCreated, doc)
}

func (h *DocumentsHandler) List(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	templateID := string(c.Query("templateId"))
	canvasType := string(c.Query("canvasType"))
	// excludeDoc=1：项目详情页要的是画布，知识库富文本不算。
	excludeDoc := string(c.Query("excludeDoc")) == "1"
	// category=canvas|node-graph|doc：按内容分类取集合，
	// 避免把知识库文档或节点绑定的模板副本混进「项目画布」列表。
	category := string(c.Query("category"))
	if category != "" && !service.IsCategory(category) {
		Fail(c, http.StatusBadRequest, "invalid category", "validation_error")
		return
	}
	projectIDRaw := string(c.Query("projectId"))
	projectID, err := parseOptionalUUID(&projectIDRaw)
	if err != nil {
		Fail(c, http.StatusBadRequest, "invalid projectId", "validation_error")
		return
	}
	cursor := string(c.Query("cursor"))
	archived := string(c.Query("archived")) == "1"
	if string(c.Query("keyset")) == "1" || cursor != "" {
		// keyset 是显式新契约；旧调用即使带 limit/offset 也仍走下方数组响应。
		if string(c.Query("offset")) != "" {
			Fail(c, http.StatusBadRequest, "cursor and offset are mutually exclusive", "validation_error")
			return
		}
		limit, _, _, err := service.NormalizeListPage(string(c.Query("limit")), "")
		if err != nil {
			Fail(c, http.StatusBadRequest, "invalid limit", "validation_error")
			return
		}
		page, err := h.svc.ListKeyset(uid, service.ListCursorFilter{
			TemplateID: templateID,
			CanvasType: canvasType,
			ProjectID:  projectID,
			Limit:      limit,
			Cursor:     cursor,
			Archived:   archived,
			ExcludeDoc: excludeDoc,
			Category:   category,
		})
		if handleDocErr(c, err, nil) {
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.Header("X-Total-Count", strconv.FormatInt(page.Total, 10))
		c.Header("X-Has-More", strconv.FormatBool(page.HasMore))
		c.Header("X-Limit", strconv.Itoa(page.Limit))
		c.JSON(http.StatusOK, page)
		return
	}
	limit, offset, paged, err := service.NormalizeListPage(string(c.Query("limit")), string(c.Query("offset")))
	if err != nil {
		Fail(c, http.StatusBadRequest, "invalid limit or offset", "validation_error")
		return
	}
	rows, total, err := h.svc.List(uid, service.ListFilter{
		TemplateID: templateID,
		CanvasType: canvasType,
		ProjectID:  projectID,
		Limit:      limit,
		Offset:     offset,
		Paged:      paged,
		Archived:   archived,
		ExcludeDoc: excludeDoc,
		Category:   category,
	})
	if handleDocErr(c, err, nil) {
		return
	}
	hasMore := paged && int64(offset+len(rows)) < total
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	c.Header("X-Has-More", strconv.FormatBool(hasMore))
	if paged {
		c.Header("X-Limit", strconv.Itoa(limit))
		c.Header("X-Offset", strconv.Itoa(offset))
	}
	c.JSON(http.StatusOK, rows)
}

func (h *DocumentsHandler) Get(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	doc, err := h.svc.GetOwned(uid, id)
	if handleDocErr(c, err, nil) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, doc)
}

// backupStreamHeader 是流式响应中 documents 数组之前的元数据。
// 单独定义它是为了先编码对象前缀，再逐文档追加数组元素；不能把完整 BackupBundle
// Marshal 后再裁剪字符串，否则仍然会在内存里构造完整备份。
type backupStreamHeader struct {
	Version    int       `json:"version"`
	ExportedAt time.Time `json:"exportedAt"`
	Count      int       `json:"count"`
	Truncated  bool      `json:"truncated"`
}

// writeBackupExport 把服务层分批结果编码成一份连续、合法的 JSON。
// iterate 由调用方注入，既让生产代码复用真实数据库遍历，也让测试能覆盖中途失败，
// 而不需要为了测试编码器再复制一套数据库模型。
func writeBackupExport(
	w io.Writer,
	iterate func(func(service.BackupExportBatch) error) error,
) error {
	out := bufio.NewWriter(w)
	started := false
	written := 0
	header := backupStreamHeader{}

	err := iterate(func(batch service.BackupExportBatch) error {
		if !started {
			header = backupStreamHeader{
				Version:    batch.Version,
				ExportedAt: batch.ExportedAt,
				Count:      batch.Count,
				Truncated:  batch.Truncated,
			}
			if header.Count < 0 {
				return fmt.Errorf("invalid backup document count %d", header.Count)
			}
			encoded, err := json.Marshal(header)
			if err != nil {
				return fmt.Errorf("encode backup metadata: %w", err)
			}
			// json.Marshal 对固定结构必定返回以 } 结尾的对象。去掉最后一个括号后
			// 追加 documents 数组起点，后续每篇文档只需一次独立 Marshal。
			if _, err := out.Write(encoded[:len(encoded)-1]); err != nil {
				return err
			}
			if _, err := out.WriteString(`,"documents":[`); err != nil {
				return err
			}
			started = true
		} else if batch.Version != header.Version ||
			!batch.ExportedAt.Equal(header.ExportedAt) ||
			batch.Count != header.Count ||
			batch.Truncated != header.Truncated {
			// 所有批次必须属于同一个导出快照；元数据漂移时继续写会生成自相矛盾的备份。
			return errors.New("backup metadata changed between batches")
		}

		for i := range batch.Documents {
			if written >= header.Count {
				return fmt.Errorf("backup emitted more than %d documents", header.Count)
			}
			encoded, err := json.Marshal(batch.Documents[i])
			if err != nil {
				return fmt.Errorf("encode backup document %d: %w", written, err)
			}
			if written > 0 {
				if err := out.WriteByte(','); err != nil {
					return err
				}
			}
			if _, err := out.Write(encoded); err != nil {
				return err
			}
			written++
		}
		// 每批刷新一次，而不是等 200 篇全部编码完才写出；调用方断连时，
		// 后续数据库遍历会随写入失败尽快停止。
		return out.Flush()
	})
	if err != nil {
		return err
	}
	if !started {
		return errors.New("backup export returned no metadata")
	}
	if written != header.Count {
		// 数据在分批读取间发生变化时，绝不悄悄补一个合法结尾伪装完整成功。
		return fmt.Errorf("backup export count mismatch: declared %d, wrote %d", header.Count, written)
	}
	if _, err := out.WriteString("]}"); err != nil {
		return err
	}
	return out.Flush()
}

func (h *DocumentsHandler) Backup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}

	reader, writer := io.Pipe()
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Type", "application/json; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="metamatrix-backup.json"`)
	// bodySize=-1 让 Hertz 使用流式响应；pipe 的背压保证编码速度不会脱离客户端消费速度。
	c.SetBodyStream(reader, -1)
	go func() {
		err := writeBackupExport(writer, func(yield func(service.BackupExportBatch) error) error {
			return h.svc.IterateBackupExport(uid, service.DefaultBackupExportBatchSize, yield)
		})
		if err != nil {
			// 响应头一旦发出就不能再改状态码。以错误关闭流可让 fetch/blob 读取失败，
			// 客户端不会把网络截断的 JSON 当作完整备份保存。
			log.Printf("backup export stream failed for user %s: %v", uid, err)
			_ = writer.CloseWithError(err)
			return
		}
		if err := writer.Close(); err != nil {
			log.Printf("backup export stream close failed for user %s: %v", uid, err)
		}
	}()
}

func (h *DocumentsHandler) RestoreBackup(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body struct {
		service.BackupBundle
		ImportBatchID string `json:"importBatchId"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		Fail(c, http.StatusBadRequest, "invalid body", "validation_error")
		return
	}
	// 空字符串保留旧客户端的非幂等兼容路径；新客户端每次导入意图都生成稳定批次号，
	// 网络自动重试仍发送同一号码和同一 bundle，由数据库唯一约束防止重复新建画布。
	result, err := h.svc.RestoreBackup(uid, body.BackupBundle, body.ImportBatchID)
	if handleDocErr(c, err, nil) {
		return
	}
	middleware.Audit(c, "restore-backup", uid.String(), "imported="+strconv.Itoa(result.Imported))
	c.JSON(http.StatusOK, result)
}

func (h *DocumentsHandler) Update(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body updateDocBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	hasExpected := false
	raw := c.Request.Body()
	var probe map[string]json.RawMessage
	_ = json.Unmarshal(raw, &probe)
	if _, exists := probe["expectedHeadRevisionId"]; exists {
		hasExpected = true
	}
	doc, err := h.svc.Update(uid, id, service.UpdateDocumentInput{
		Title:                  body.Title,
		Notes:                  body.Notes,
		CurrentData:            body.CurrentData,
		ExpectedHeadRevisionID: body.ExpectedHeadRevisionID,
		HasExpected:            hasExpected,
		ExpectedSaveVersion:    body.ExpectedSaveVersion,
		Checkpoint:             body.Checkpoint,
		OperationID:            body.OperationID,
	})
	if handleDocErr(c, err, doc) {
		return
	}
	c.JSON(http.StatusOK, doc)
}

type batchBody struct {
	IDs    []string `json:"ids"`
	Action string   `json:"action"`
}

func (h *DocumentsHandler) Batch(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body batchBody
	if err := c.BindAndValidate(&body); err != nil {
		Fail(c, http.StatusBadRequest, "invalid body", "validation_error")
		return
	}
	ids, err := service.NormalizeBatchIDs(body.IDs)
	if err != nil {
		Fail(c, http.StatusBadRequest, "invalid ids", "validation_error")
		return
	}
	var n int64
	switch body.Action {
	case "archive":
		n, err = h.svc.Archive(uid, ids)
	case "restore":
		n, err = h.svc.RestoreArchived(uid, ids)
	default:
		Fail(c, http.StatusBadRequest, "action must be archive or restore", "validation_error")
		return
	}
	if handleDocErr(c, err, nil) {
		return
	}
	middleware.Audit(c, body.Action, uid.String(), "affected="+strconv.FormatInt(n, 10))
	c.JSON(http.StatusOK, map[string]interface{}{"affected": n})
}

func (h *DocumentsHandler) Export(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	doc, err := h.svc.GetOwned(uid, id)
	if handleDocErr(c, err, nil) {
		return
	}
	format := string(c.Query("format"))
	name := doc.Title
	if name == "" {
		name = "canvas"
	}
	if format == "markdown" || format == "md" {
		md, err := service.CanvasMarkdown(doc.Title, doc.CurrentData)
		if handleDocErr(c, err, nil) {
			return
		}
		c.JSON(http.StatusOK, map[string]string{
			"filename": name + ".md",
			"format":   "markdown",
			"content":  md,
		})
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{
		"filename": name + ".json",
		"format":   "json",
		"content":  json.RawMessage(doc.CurrentData),
	})
}

type renameBody struct {
	Title               string `json:"title"`
	ExpectedSaveVersion *int64 `json:"expectedSaveVersion"`
}

func (h *DocumentsHandler) Rename(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body renameBody
	if err := c.BindAndValidate(&body); err != nil {
		Fail(c, http.StatusBadRequest, "invalid body", "validation_error")
		return
	}
	doc, err := h.svc.Rename(uid, id, body.Title, body.ExpectedSaveVersion)
	if handleDocErr(c, err, doc) {
		return
	}
	middleware.Audit(c, "rename", uid.String(), "id="+id.String())
	// 旧客户端仍读取 title；新增 saveVersion/headRevisionId 等摘要字段向后兼容。
	c.JSON(http.StatusOK, doc)
}

func (h *DocumentsHandler) Delete(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if handleDocErr(c, h.svc.Delete(uid, id), nil) {
		return
	}
	middleware.Audit(c, "archive", uid.String(), "id="+id.String())
	c.Status(http.StatusNoContent)
}

func (h *DocumentsHandler) CreateRevision(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body createRevBody
	_ = c.BindAndValidate(&body)
	raw := c.Request.Body()
	var probe map[string]json.RawMessage
	_ = json.Unmarshal(raw, &probe)
	hasExpected := false
	if _, exists := probe["expectedHeadRevisionId"]; exists {
		hasExpected = true
	}
	doc, rev, err := h.svc.CreateRevision(uid, id, service.CreateRevisionInput{
		ExpectedHeadRevisionID: body.ExpectedHeadRevisionID,
		HasExpected:            hasExpected,
		ExpectedSaveVersion:    body.ExpectedSaveVersion,
		Label:                  body.Label,
	})
	if handleDocErr(c, err, doc) {
		return
	}
	c.JSON(http.StatusCreated, map[string]interface{}{
		"document":    doc,
		"revision":    rev,
		"contentHash": rev.ContentHash,
	})
}

func (h *DocumentsHandler) ListRevisions(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	filter, paged, err := service.NormalizeRevisionPage(
		string(c.Query("limit")), string(c.Query("offset")), string(c.Query("cursor")),
	)
	if handleDocErr(c, err, nil) {
		return
	}
	if paged {
		page, err := h.svc.ListRevisionsPage(uid, id, filter)
		if handleDocErr(c, err, nil) {
			return
		}
		c.JSON(http.StatusOK, page)
		return
	}
	rows, err := h.svc.ListRevisions(uid, id)
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *DocumentsHandler) Materialize(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	rid, ok := parseID(c, "rid")
	if !ok {
		return
	}
	out, err := h.svc.Materialize(uid, id, rid)
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DocumentsHandler) Restore(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body restoreBody
	if err := c.BindAndValidate(&body); err != nil || body.RevisionID == "" {
		BadRequest(c, "revisionId required")
		return
	}
	rid, err := uuid.Parse(body.RevisionID)
	if err != nil {
		BadRequest(c, "invalid revisionId")
		return
	}
	raw := c.Request.Body()
	var probe map[string]json.RawMessage
	_ = json.Unmarshal(raw, &probe)
	hasExpected := false
	if _, exists := probe["expectedHeadRevisionId"]; exists {
		hasExpected = true
	}
	doc, err := h.svc.Restore(uid, id, service.RestoreInput{
		RevisionID:             rid,
		ExpectedHeadRevisionID: body.ExpectedHeadRevisionID,
		HasExpected:            hasExpected,
		ExpectedSaveVersion:    body.ExpectedSaveVersion,
		Label:                  body.Label,
	})
	if handleDocErr(c, err, doc) {
		return
	}
	c.JSON(http.StatusOK, doc)
}

func (h *DocumentsHandler) Stats(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	uid = service.ResolveStatsOwner(uid, string(c.Query("scope")))
	out, err := h.svc.Stats(uid, string(c.Query("range")), string(c.Query("granularity")))
	if handleDocErr(c, err, nil) {
		return
	}
	c.Header("Cache-Control", "private, max-age=20")
	c.Header("Vary", "Authorization")
	c.JSON(http.StatusOK, out)
}

func (h *DocumentsHandler) Search(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	rows, err := h.svc.Search(uid, service.SearchInput{
		Q:          string(c.Query("q")),
		TemplateID: string(c.Query("templateId")),
		Limit:      limit,
		ProjectID:  string(c.Query("projectId")),
		ExcludeDoc: string(c.Query("excludeDoc")) == "1",
	})
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *DocumentsHandler) Diff(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	ridA, ok := parseID(c, "rid")
	if !ok {
		return
	}
	var against *uuid.UUID
	if raw := string(c.Query("against")); raw != "" {
		aid, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid against")
			return
		}
		against = &aid
	}
	out, err := h.svc.Diff(uid, id, ridA, against)
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DocumentsHandler) AIContext(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	out, err := h.svc.AIContext(uid, id)
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *DocumentsHandler) AICorpus(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	out, err := h.svc.AICorpus(uid, string(c.Query("templateId")), string(c.Query("q")), limit)
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusOK, out)
}
