package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

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
	Title      *string         `json:"title"`
	Notes      *string         `json:"notes"`
	CanvasType *string         `json:"canvasType"`
	TemplateID *string         `json:"templateId"`
	Data       json.RawMessage `json:"data"`
}

type updateDocBody struct {
	Title                  *string         `json:"title"`
	Notes                  *string         `json:"notes"`
	CurrentData            json.RawMessage `json:"currentData"`
	ExpectedHeadRevisionID *string         `json:"expectedHeadRevisionId"`
	Checkpoint             bool            `json:"checkpoint"`
}

type createRevBody struct {
	ExpectedHeadRevisionID *string `json:"expectedHeadRevisionId"`
	Label                  *string `json:"label"`
}

type restoreBody struct {
	RevisionID             string  `json:"revisionId"`
	ExpectedHeadRevisionID *string `json:"expectedHeadRevisionId"`
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
	case errors.Is(err, service.ErrHeadConflict):
		Conflict(c, "head_revision_id conflict", map[string]interface{}{
			"headRevisionId": extractHead(doc),
		})
	case errors.Is(err, service.ErrNotSnapshot):
		Conflict(c, err.Error(), nil)
	default:
		Internal(c, err.Error())
	}
	return true
}

func extractHead(doc interface{}) interface{} {
	if doc == nil {
		return nil
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return nil
	}
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	return m["headRevisionId"]
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
	doc, err := h.svc.Create(uid, service.CreateDocumentInput{
		Title:      body.Title,
		Notes:      body.Notes,
		CanvasType: body.CanvasType,
		TemplateID: body.TemplateID,
		Data:       body.Data,
	})
	if handleDocErr(c, err, nil) {
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func (h *DocumentsHandler) List(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	templateID := string(c.Query("templateId"))
	canvasType := string(c.Query("canvasType"))
	rows, err := h.svc.List(uid, templateID, canvasType)
	if handleDocErr(c, err, nil) {
		return
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
	c.JSON(http.StatusOK, doc)
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
		Checkpoint:             body.Checkpoint,
	})
	if handleDocErr(c, err, doc) {
		return
	}
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
		Label:                  body.Label,
	})
	if handleDocErr(c, err, doc) {
		return
	}
	c.JSON(http.StatusOK, doc)
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
