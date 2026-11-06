package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"metamatrix/api/internal/media"
	"metamatrix/api/internal/middleware"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

type MediaHandler struct {
	svc *media.Service
}

func NewMediaHandler(svc *media.Service) *MediaHandler {
	return &MediaHandler{svc: svc}
}

func (h *MediaHandler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
	}
	return uid, ok
}

type checkBody struct {
	SHA256    string `json:"sha256"`
	MediaType string `json:"mediaType"`
	// UserID is accepted by the decoder and ignored. Identity comes from the token.
	UserID string `json:"userId"`
}

func (h *MediaHandler) Check(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body checkBody
	if err := c.BindJSON(&body); err != nil {
		BadRequest(c, "invalid json")
		return
	}
	out, err := h.svc.Check(ctx, uid, media.CheckInput{SHA256: body.SHA256, MediaType: body.MediaType})
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *MediaHandler) Upload(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		BadRequest(c, "file is required")
		return
	}
	f, err := fh.Open()
	if err != nil {
		Internal(c, "open upload failed")
		return
	}
	defer f.Close()
	// Form field userId is intentionally unread.
	view, err := h.svc.Save(ctx, uid, media.SaveInput{
		OriginalName: fh.Filename,
		MediaType:    string(c.PostForm("mediaType")),
		MimeType:     fh.Header.Get("Content-Type"),
		CategoryID:   string(c.PostForm("categoryId")),
		Body:         f,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	status := http.StatusOK
	if view.Created {
		status = http.StatusCreated
	}
	c.JSON(status, view)
}

func (h *MediaHandler) List(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	filter := media.ListFilter{
		MediaType: strings.TrimSpace(string(c.Query("type"))),
		Limit:     atoiDefault(string(c.Query("limit")), 20),
		Offset:    atoiDefault(string(c.Query("offset")), 0),
	}
	if raw := strings.TrimSpace(string(c.Query("categoryId"))); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid categoryId")
			return
		}
		filter.CategoryID = &id
	}
	out, err := h.svc.List(ctx, uid, filter)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *MediaHandler) Get(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if strings.TrimSpace(string(c.Query("sig"))) != "" {
		h.read(ctx, c, uid, id)
		return
	}
	view, err := h.svc.Get(ctx, uid, id)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

func (h *MediaHandler) read(ctx context.Context, c *app.RequestContext, uid, id uuid.UUID) {
	opened, err := h.svc.Open(ctx, uid, id, string(c.Query("exp")), string(c.Query("sig")), string(c.GetHeader("Range")))
	if err != nil {
		h.fail(c, err)
		return
	}
	defer opened.Body.Close()
	status := http.StatusOK
	c.Header("Accept-Ranges", "bytes")
	c.Header("Content-Type", opened.Mime)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store")
	if opened.Partial {
		status = http.StatusPartialContent
		c.Header("Content-Range", opened.Range.ContentRange(opened.Size))
	}
	c.Header("Content-Length", strconv.FormatInt(opened.Range.Length(), 10))
	c.Status(status)
	_, _ = io.Copy(c, opened.Body)
}

func (h *MediaHandler) Delete(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.Delete(ctx, uid, id); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

type refBody struct {
	RefType      string `json:"refType"`
	RefID        string `json:"refId"`
	InsertedPath string `json:"insertedPath"`
	UserID       string `json:"userId"`
}

func (h *MediaHandler) AddReference(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body refBody
	if err := c.BindJSON(&body); err != nil {
		BadRequest(c, "invalid json")
		return
	}
	ref, err := h.svc.AddReference(ctx, uid, id, media.RefInput{RefType: body.RefType, RefID: body.RefID})
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, ref)
}

func (h *MediaHandler) DeleteReference(ctx context.Context, c *app.RequestContext) {
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
	if err := h.svc.DeleteReference(ctx, uid, id, rid); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

func (h *MediaHandler) SyncFeishu(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.SyncFeishu(ctx, uid, id); err != nil && !errors.Is(err, media.ErrNotFound) {
		// A failed remote call still leaves the local file. Surface the status.
		if view, gerr := h.svc.Get(ctx, uid, id); gerr == nil {
			c.JSON(http.StatusOK, view)
			return
		}
	}
	view, err := h.svc.Get(ctx, uid, id)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

type categoryBody struct {
	Name      string  `json:"name"`
	ParentID  *string `json:"parentId"`
	SortOrder *int    `json:"sortOrder"`
	UserID    string  `json:"userId"`
}

func (h *MediaHandler) ListCategories(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	rows, err := h.svc.ListCategories(ctx, uid)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{"items": rows})
}

func (h *MediaHandler) CreateCategory(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body categoryBody
	if err := c.BindJSON(&body); err != nil {
		BadRequest(c, "invalid json")
		return
	}
	parent, err := parseOptionalUUID(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	sort := 0
	if body.SortOrder != nil {
		sort = *body.SortOrder
	}
	row, err := h.svc.CreateCategory(ctx, uid, body.Name, parent, sort)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, row)
}

func (h *MediaHandler) UpdateCategory(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var raw map[string]json.RawMessage
	if err := c.BindJSON(&raw); err != nil {
		BadRequest(c, "invalid json")
		return
	}
	var name *string
	if v, ok := raw["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			BadRequest(c, "invalid name")
			return
		}
		name = &s
	}
	var parent *uuid.UUID
	parentSet := false
	if v, ok := raw["parentId"]; ok {
		parentSet = true
		if string(v) != "null" {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				BadRequest(c, "invalid parentId")
				return
			}
			id, err := uuid.Parse(s)
			if err != nil {
				BadRequest(c, "invalid parentId")
				return
			}
			parent = &id
		}
	}
	var sort *int
	if v, ok := raw["sortOrder"]; ok {
		var n int
		if err := json.Unmarshal(v, &n); err != nil {
			BadRequest(c, "invalid sortOrder")
			return
		}
		sort = &n
	}
	if err := h.svc.UpdateCategory(ctx, uid, id, name, parent, parentSet, sort); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"updated": true})
}

func (h *MediaHandler) DeleteCategory(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.DeleteCategory(ctx, uid, id); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

func (h *MediaHandler) fail(c *app.RequestContext, err error) {
	switch {
	case errors.Is(err, media.ErrNotFound):
		NotFound(c, "media not found")
	case errors.Is(err, media.ErrReferenced):
		Conflict(c, "referenced media cannot be deleted", nil)
	case errors.Is(err, media.ErrCategoryNotEmpty):
		Conflict(c, "category still has assets or child categories", nil)
	case errors.Is(err, media.ErrSignature):
		Forbidden(c, "invalid or expired media signature")
	case errors.Is(err, media.ErrBadRange):
		c.Header("Content-Range", "bytes */0")
		Fail(c, http.StatusRequestedRangeNotSatisfiable, "bad range", "bad_range")
	case errors.Is(err, media.ErrBadMediaType), errors.Is(err, media.ErrTooLarge), errors.Is(err, media.ErrPathEscape), errors.Is(err, media.ErrCategoryCycle):
		BadRequest(c, err.Error())
	default:
		Internal(c, "media request failed")
	}
}

func atoiDefault(raw string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	return n
}

func parseOptionalUUID(raw *string) (*uuid.UUID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	id, err := uuid.Parse(strings.TrimSpace(*raw))
	if err != nil {
		return nil, err
	}
	return &id, nil
}
