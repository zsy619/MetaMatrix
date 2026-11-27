package handler

import (
	"context"
	"net/http"
	"strconv"

	"metamatrix/api/internal/middleware"

	"github.com/cloudwego/hertz/pkg/app"
)

// ListNotifications GET /notifications
func (h *KnowledgeHandler) ListNotifications(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	unreadOnly := c.Query("unread") == "1" || c.Query("unread") == "true"
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := h.svc.ListNotifications(uid, unreadOnly, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

// MarkNotificationRead POST /notifications/:id/read
func (h *KnowledgeHandler) MarkNotificationRead(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if handleKnowledgeErr(c, h.svc.MarkNotificationRead(uid, id)) {
		return
	}
	c.Status(http.StatusNoContent)
}
