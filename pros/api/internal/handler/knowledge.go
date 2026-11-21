package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

type KnowledgeHandler struct {
	svc *service.KnowledgeService
	// jwtSecret 用于分享页的可选鉴权：白名单分享需要识别访问者身份。
	jwtSecret string
}

func NewKnowledgeHandler(svc *service.KnowledgeService, jwtSecret string) *KnowledgeHandler {
	return &KnowledgeHandler{svc: svc, jwtSecret: jwtSecret}
}

// optionalOwner 尝试解析 Bearer token：分享页允许匿名访问，但白名单分享要校验身份。
func (h *KnowledgeHandler) optionalOwner(c *app.RequestContext) (*uuid.UUID, bool) {
	auth := string(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return nil, false
	}
	claims, err := middleware.ParseToken(h.jwtSecret, strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		return nil, false
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, false
	}
	return &uid, true
}

func (h *KnowledgeHandler) owner(c *app.RequestContext) (uuid.UUID, bool) {
	uid, ok := middleware.UserIDFromCtx(c)
	if !ok {
		Unauthorized(c, "unauthorized")
	}
	return uid, ok
}

func handleKnowledgeErr(c *app.RequestContext, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, service.ErrNodeNotFound):
		NotFound(c, "knowledge node not found")
	case errors.Is(err, service.ErrProjectMissing):
		NotFound(c, "project not found")
	case errors.Is(err, service.ErrNodeCycle):
		Conflict(c, err.Error(), nil)
	case errors.Is(err, service.ErrValidation):
		Fail(c, http.StatusBadRequest, "validation failed", "validation_error")
	case errors.Is(err, service.ErrShareForbidden):
		Forbidden(c, "share not allowed for current user")
	case errors.Is(err, service.ErrSpaceForbidden):
		Forbidden(c, "space access denied")
	default:
		log.Printf("knowledge error: %v", err)
		Internal(c, "request failed")
	}
	return true
}

type createNodeBody struct {
	ParentID   *string `json:"parentId"`
	NodeType   string  `json:"nodeType"`
	Title      string  `json:"title"`
	Icon       string  `json:"icon"`
	DocumentID *string `json:"documentId"`
	// Pinyin 是标题的拼音与首字母（前端 pinyin-pro 生成）：中文按拼音检索。
	Pinyin string `json:"pinyin"`
	// CreateDoc=true 时一步建文档 + 节点；忽略 DocumentID。
	CreateDoc bool `json:"createDoc"`
}

func parseOptionalUUIDField(raw *string) (*uuid.UUID, error) {
	if raw == nil || *raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(*raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func (h *KnowledgeHandler) Tree(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	nodes, err := h.svc.Tree(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, nodes)
}

func (h *KnowledgeHandler) Create(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body createNodeBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	if body.CreateDoc {
		node, err := h.svc.CreateDocWithNode(uid, projectID, parentID, body.Title, body.Icon)
		if handleKnowledgeErr(c, err) {
			return
		}
		middleware.Audit(c, "create", uid.String(), "knowledge-doc="+node.ID.String())
		c.JSON(http.StatusCreated, node)
		return
	}
	docID, err := parseOptionalUUIDField(body.DocumentID)
	if err != nil {
		BadRequest(c, "invalid documentId")
		return
	}
	node, err := h.svc.Create(uid, projectID, service.KnowledgeNodeInput{
		ParentID:   parentID,
		NodeType:   body.NodeType,
		Title:      body.Title,
		Icon:       body.Icon,
		DocumentID: docID,
		Pinyin:     body.Pinyin,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "create", uid.String(), "knowledge-node="+node.ID.String())
	c.JSON(http.StatusCreated, node)
}

type updateNodeBody struct {
	Title      *string `json:"title"`
	Icon       *string `json:"icon"`
	DocumentID *string `json:"documentId"`
	// Pinyin 是标题的拼音与首字母（前端 pinyin-pro 生成）。
	Pinyin *string `json:"pinyin"`
}

func (h *KnowledgeHandler) Update(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	nodeID, ok := parseID(c, "nodeId")
	if !ok {
		return
	}
	var body updateNodeBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	var docID *uuid.UUID
	if body.DocumentID != nil {
		id, err := uuid.Parse(*body.DocumentID)
		if err != nil {
			BadRequest(c, "invalid documentId")
			return
		}
		docID = &id
	}
	node, err := h.svc.Update(uid, projectID, nodeID, body.Title, body.Icon, docID, body.Pinyin)
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "update", uid.String(), "knowledge-node="+nodeID.String())
	c.JSON(http.StatusOK, node)
}

type moveNodeBody struct {
	ParentID  *string `json:"parentId"`
	SortOrder *int    `json:"sortOrder"`
}

func (h *KnowledgeHandler) Move(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	nodeID, ok := parseID(c, "nodeId")
	if !ok {
		return
	}
	var body moveNodeBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.Move(uid, projectID, nodeID, service.KnowledgeMoveInput{
		ParentID:  parentID,
		SortOrder: body.SortOrder,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "move", uid.String(), "knowledge-node="+nodeID.String())
	c.JSON(http.StatusOK, node)
}

type reorderBody struct {
	IDs []string `json:"ids"`
}

func (h *KnowledgeHandler) Reorder(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body reorderBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	ids := make([]uuid.UUID, 0, len(body.IDs))
	for _, raw := range body.IDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid id in ids")
			return
		}
		ids = append(ids, id)
	}
	if err := h.svc.Reorder(uid, projectID, ids); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{"reordered": len(ids)})
}

func (h *KnowledgeHandler) Delete(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	nodeID, ok := parseID(c, "nodeId")
	if !ok {
		return
	}
	// promote=1：子节点提升到父级而不是级联删除。
	promote := string(c.Query("promote")) == "1"
	if err := h.svc.DeleteWithPolicy(uid, projectID, nodeID, promote); handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "delete", uid.String(), "knowledge-node="+nodeID.String())
	c.JSON(http.StatusOK, map[string]interface{}{"deleted": true})
}

// Backrefs 返回引用了某篇文档的其他文档（@ 文档 mention / 画布嵌入块）。
// 路径挂在 /documents/:id/backrefs 下，但复用 KnowledgeService.Backrefs。
func (h *KnowledgeHandler) Backrefs(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	refs, err := h.svc.Backrefs(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, refs)
}
