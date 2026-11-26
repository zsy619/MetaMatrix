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

func toDocBlockJSON(row model.DocBlock) docBlockJSON {
	out := docBlockJSON{
		ID:          row.ID.String(),
		BlockType:   row.BlockType,
		Depth:       row.Depth,
		Ordinal:     row.Ordinal,
		AnchorKey:   row.AnchorKey,
		ContentText: row.ContentText,
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
