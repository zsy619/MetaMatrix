package handler

import (
	"context"
	"errors"
	"log"
	"net/http"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// ProjectsHandler 提供 /projects 系列接口。
type ProjectsHandler struct {
	svc *service.ProjectsService
}

func NewProjectsHandler(svc *service.ProjectsService) *ProjectsHandler {
	return &ProjectsHandler{svc: svc}
}

// projectBody 是项目基本信息的入参。字段都是可选的：
// 只有传进来的字段才会被更新。
type projectBody struct {
	Name     *string `json:"name"`
	Emoji    *string `json:"emoji"`
	Progress *int    `json:"progress"`
}

func (h *ProjectsHandler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
	}
	return uid, ok
}

// handleProjectErr 把服务层错误翻译成 HTTP 响应。
func handleProjectErr(c *app.RequestContext, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, service.ErrProjectNotFound):
		NotFound(c, "project not found")
	case errors.Is(err, service.ErrValidation):
		Fail(c, http.StatusBadRequest, "validation failed", "validation_error")
	default:
		log.Printf("project error: %v", err)
		Internal(c, "request failed")
	}
	return true
}

// List 返回当前用户的项目列表。
func (h *ProjectsHandler) List(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	rows, err := h.svc.List(uid)
	if handleProjectErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, rows)
}

// Get 返回单个项目。
func (h *ProjectsHandler) Get(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	p, err := h.svc.Get(uid, id)
	if handleProjectErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, p)
}

// Create 新建项目。
func (h *ProjectsHandler) Create(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body projectBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	var emoji string
	if body.Emoji != nil {
		emoji = *body.Emoji
	}
	p, err := h.svc.Create(uid, derefString(body.Name), emoji)
	if handleProjectErr(c, err) {
		return
	}
	middleware.Audit(c, "create", uid.String(), "project="+p.ID.String())
	c.JSON(http.StatusCreated, p)
}

// derefString 取指针里的字符串，nil 时给空串（交给服务层校验）。
func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Rename 更新项目基本信息：名称、表情、进度都可以改。
func (h *ProjectsHandler) Rename(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body projectBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	p, err := h.svc.Update(uid, id, service.ProjectUpdate{
		Name:     body.Name,
		Emoji:    body.Emoji,
		Progress: body.Progress,
	})
	if handleProjectErr(c, err) {
		return
	}
	middleware.Audit(c, "rename", uid.String(), "project="+id.String())
	c.JSON(http.StatusOK, p)
}

// Delete 删除项目及其下的画布。
func (h *ProjectsHandler) Delete(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.Delete(uid, id); handleProjectErr(c, err) {
		return
	}
	middleware.Audit(c, "delete", uid.String(), "project="+id.String())
	c.JSON(http.StatusOK, map[string]interface{}{"deleted": true})
}

// Refs 返回项目内的画布引用图（画布 id → 它引用的画布 id 列表）。
// 前端用它判断自引用与环引用。
func (h *ProjectsHandler) Refs(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if _, err := h.svc.Get(uid, id); handleProjectErr(c, err) {
		return
	}
	refs, err := h.svc.Refs(uid, id)
	if handleProjectErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, map[string]interface{}{"refs": refs})
}
