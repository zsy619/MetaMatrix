package handler

import (
	"context"
	"net/http"
	"strconv"

	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
)

// DirectoryBackend 是通讯录 handler 依赖的那部分服务能力。
// 抽成接口是为了让 handler 测试不依赖数据库。
type DirectoryBackend interface {
	// List 按关键词分页返回通讯录用户。
	List(q string, limit, offset int) ([]service.DirectoryUserDTO, error)
}

// DirectoryHandler 提供 GET /directory/users。
type DirectoryHandler struct {
	svc DirectoryBackend
}

// NewDirectoryHandler 建立通讯录 handler。
func NewDirectoryHandler(svc DirectoryBackend) *DirectoryHandler {
	return &DirectoryHandler{svc: svc}
}

// List 返回通讯录用户列表。
//
// 查询参数：
//   - q      模糊匹配用户名 / 昵称 / 邮箱，大小写不敏感
//   - limit  每页条数，默认 50，上限 200
//   - offset 偏移量，默认 0（分页用 offset，不用 page）
//
// 响应体是 DirectoryUserDTO 数组（与 /documents 列表一样，成功响应没有额外信封），
// 每个元素只含 id / name / email 等公开字段。
func (h *DirectoryHandler) List(ctx context.Context, c *app.RequestContext) {
	q := service.NormalizeDirectoryQuery(c.Query("q"))
	limit := service.ParseDirectoryLimit(c.Query("limit"))
	offset := service.ParseDirectoryOffset(c.Query("offset"))

	users, err := h.svc.List(q, limit, offset)
	if err != nil {
		Internal(c, "directory list failed")
		return
	}
	if users == nil {
		users = []service.DirectoryUserDTO{}
	}
	c.Header("X-Limit", strconv.Itoa(limit))
	c.Header("X-Offset", strconv.Itoa(offset))
	c.JSON(http.StatusOK, users)
}
