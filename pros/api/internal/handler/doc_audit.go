package handler

import (
	"context"
	"net/http"
	"strconv"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

type docAuditBackend interface {
	List(actorID, docID uuid.UUID, limit int) ([]model.DocAuditEvent, error)
}

// DocAuditHandler 提供文档审计列表。本轮不做前端 UI。
type DocAuditHandler struct {
	svc    docAuditBackend
	secret string
}

func NewDocAuditHandler(svc docAuditBackend, secret string) *DocAuditHandler {
	return &DocAuditHandler{svc: svc, secret: secret}
}

type auditEventJSON struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	UserID     string `json:"userId"`
	Action     string `json:"action"`
	BlockID    string `json:"blockId"`
	Detail     string `json:"detail"`
	CreatedAt  string `json:"createdAt"`
}

// ListAudit GET /documents/:id/audit
func (h *DocAuditHandler) ListAudit(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	rows, err := h.svc.List(uid, docID, limit)
	if handleCollabErr(c, err) {
		return
	}
	out := make([]auditEventJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, auditEventJSON{
			ID:         row.ID.String(),
			DocumentID: row.DocumentID.String(),
			UserID:     row.UserID.String(),
			Action:     row.Action,
			BlockID:    row.BlockID,
			Detail:     row.Detail,
			CreatedAt:  row.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		})
	}
	c.JSON(http.StatusOK, out)
}

// 确保 *service.DocAuditService 满足接口。
var _ docAuditBackend = (*service.DocAuditService)(nil)
