package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

type docBlockBackend interface {
	ListBlocks(actorID, docID uuid.UUID) ([]model.DocBlock, error)
	GetBlock(actorID, docID, blockID uuid.UUID) (*model.DocBlock, error)
	ListBlockRefs(actorID, docID, blockID uuid.UUID) ([]model.DocBlockRef, error)
	UpdatePermission(actorID, docID, blockID uuid.UUID, permission string) (*model.DocBlock, error)
}

// DocBlockHandler 提供派生块只读 API。本轮不做前端 UI。
type DocBlockHandler struct {
	svc    docBlockBackend
	secret string
}

func NewDocBlockHandler(svc docBlockBackend, secret string) *DocBlockHandler {
	return &DocBlockHandler{svc: svc, secret: secret}
}

type docBlockJSON struct {
	ID          string         `json:"id"`
	BlockType   string         `json:"blockType"`
	ParentID    *string        `json:"parentId"`
	Depth       int            `json:"depth"`
	Ordinal     int            `json:"ordinal"`
	AnchorKey   string         `json:"anchorKey,omitempty"`
	ContentText string         `json:"contentText,omitempty"`
	Attrs       map[string]any `json:"attrs,omitempty"`
	Permission  string         `json:"permission,omitempty"`
}

// ListBlocks GET /documents/:id/blocks
func (h *DocBlockHandler) ListBlocks(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	rows, err := h.svc.ListBlocks(uid, docID)
	if handleCollabErr(c, err) {
		return
	}
	out := make([]docBlockJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDocBlockJSON(row))
	}
	c.JSON(http.StatusOK, out)
}

// GetBlock GET /documents/:id/blocks/:blockId
func (h *DocBlockHandler) GetBlock(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	blockID, ok := parseID(c, "blockId")
	if !ok {
		return
	}
	row, err := h.svc.GetBlock(uid, docID, blockID)
	if handleCollabErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, toDocBlockJSON(*row))
}

// ListBlockRefs GET /documents/:id/blocks/:blockId/refs
func (h *DocBlockHandler) ListBlockRefs(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	blockID, ok := parseID(c, "blockId")
	if !ok {
		return
	}
	rows, err := h.svc.ListBlockRefs(uid, docID, blockID)
	if handleCollabErr(c, err) {
		return
	}
	out := make([]docBlockRefJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDocBlockRefJSON(row))
	}
	c.JSON(http.StatusOK, out)
}

type docBlockRefJSON struct {
	ID            string  `json:"id"`
	SourceBlockID string  `json:"sourceBlockId"`
	TargetBlockID *string `json:"targetBlockId,omitempty"`
	RefType       string  `json:"refType"`
	AnchorKey     string  `json:"anchorKey,omitempty"`
	TargetLabel   string  `json:"targetLabel,omitempty"`
	Lost          bool    `json:"lost"`
}

func toDocBlockRefJSON(row model.DocBlockRef) docBlockRefJSON {
	out := docBlockRefJSON{
		ID:            row.ID.String(),
		SourceBlockID: row.SourceBlockID.String(),
		RefType:       row.RefType,
		AnchorKey:     row.AnchorKey,
		TargetLabel:   row.TargetLabel,
		Lost:          row.Lost,
	}
	if row.TargetBlockID != nil {
		s := row.TargetBlockID.String()
		out.TargetBlockID = &s
	}
	return out
}

func toDocBlockJSON(row model.DocBlock) docBlockJSON {
	out := docBlockJSON{
		ID:          row.ID.String(),
		BlockType:   row.BlockType,
		Depth:       row.Depth,
		Ordinal:     row.Ordinal,
		AnchorKey:   row.AnchorKey,
		ContentText: row.ContentText,
		Permission:  row.Permission,
	}
	if row.ParentID != nil {
		s := row.ParentID.String()
		out.ParentID = &s
	}
	if len(row.Attrs) > 0 && string(row.Attrs) != "null" {
		var attrs map[string]any
		if err := json.Unmarshal(row.Attrs, &attrs); err == nil {
			out.Attrs = attrs
		}
	}
	return out
}

// UpdatePermission PATCH /documents/:id/blocks/:blockId/permission
func (h *DocBlockHandler) UpdatePermission(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	blockID, ok := parseID(c, "blockId")
	if !ok {
		return
	}
	var body struct {
		Permission string `json:"permission"`
	}
	if err := c.BindJSON(&body); err != nil {
		Fail(c, http.StatusBadRequest, "validation failed", "validation_error")
		return
	}
	row, err := h.svc.UpdatePermission(uid, docID, blockID, body.Permission)
	if handleCollabErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, toDocBlockJSON(*row))
}
