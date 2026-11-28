package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/model"
)

// ActivityBackend 是活动日志的读取能力。
type ActivityBackend interface {
	List(userID uuid.UUID, category string, limit, offset int) ([]model.ActivityLog, int64, error)
}

// LogsHandler 提供活动日志查询（当前账号自己的记录）。
type LogsHandler struct {
	svc ActivityBackend
}

func NewLogsHandler(svc ActivityBackend) *LogsHandler {
	return &LogsHandler{svc: svc}
}

// List 返回活动日志列表：GET /logs?category=login&limit=50&offset=0
func (h *LogsHandler) List(ctx context.Context, c *app.RequestContext) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Fail(c, http.StatusUnauthorized, "unauthorized", "unauthorized")
		return
	}
	category := string(c.Query("category"))
	switch category {
	case "", "login", "logout", "operation":
	default:
		Fail(c, http.StatusBadRequest, "invalid category", "bad_request")
		return
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	offset, _ := strconv.Atoi(string(c.Query("offset")))
	items, total, err := h.svc.List(uid, category, limit, offset)
	if err != nil {
		Internal(c, "activity log list failed")
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}
