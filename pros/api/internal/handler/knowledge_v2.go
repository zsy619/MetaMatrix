package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// 知识库 2.0 的接口：模板、节点元数据、回收站、批量操作、看板、
// 文档属性、评论、最近浏览、事件与导出。

// ---------------------------------------------------------------- 模板

func (h *KnowledgeHandler) Templates(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	rows, err := h.svc.ListTemplates(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, rows)
}

type templateBody struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Icon     string `json:"icon"`
	Category string `json:"category"`
	HTML     string `json:"html"`
	// Scope 是模板作用域：personal | team | project。
	Scope string `json:"scope"`
}

func (h *KnowledgeHandler) CreateTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body templateBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	tpl, err := h.svc.CreateTemplate(uid, projectID, service.KnowledgeTemplateInput{
		Key:      body.Key,
		Label:    body.Label,
		Icon:     body.Icon,
		Category: body.Category,
		HTML:     body.HTML,
		Scope:    body.Scope,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, tpl)
}

func (h *KnowledgeHandler) DeleteTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "templateId")
	if !ok {
		return
	}
	if err := h.svc.DeleteTemplate(uid, id); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

// ---------------------------------------------------------------- 节点元数据

type nodeMetaBody struct {
	Alias    *string `json:"alias"`
	Summary  *string `json:"summary"`
	Favorite *bool   `json:"favorite"`
	Locked   *bool   `json:"locked"`
	Archived *bool   `json:"archived"`
	Trashed  *bool   `json:"trashed"`
}

func (h *KnowledgeHandler) UpdateMeta(ctx context.Context, c *app.RequestContext) {
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
	var body nodeMetaBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	node, err := h.svc.UpdateNodeMeta(uid, projectID, nodeID, service.NodeMetaInput{
		Alias:    body.Alias,
		Summary:  body.Summary,
		Favorite: body.Favorite,
		Locked:   body.Locked,
		Archived: body.Archived,
		Trashed:  body.Trashed,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, node)
}

func (h *KnowledgeHandler) Trash(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	rows, err := h.svc.ListTrash(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) Purge(ctx context.Context, c *app.RequestContext) {
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
	if err := h.svc.PurgeNode(uid, projectID, nodeID); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"purged": true})
}

type copyNodeBody struct {
	ParentID *string `json:"parentId"`
}

func (h *KnowledgeHandler) Copy(ctx context.Context, c *app.RequestContext) {
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
	var body copyNodeBody
	// 空 body 也合法：复制到同级。
	_ = c.BindAndValidate(&body)
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.CopyNode(uid, projectID, nodeID, parentID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, node)
}

type knowledgeBatchBody struct {
	IDs      []string `json:"ids"`
	Op       string   `json:"op"`
	ParentID *string  `json:"parentId"`
	Value    string   `json:"value"`
}

func (h *KnowledgeHandler) Batch(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body knowledgeBatchBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	ids := make([]uuid.UUID, 0, len(body.IDs))
	for _, raw := range body.IDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid ids")
			return
		}
		ids = append(ids, id)
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	count, err := h.svc.BatchNodes(uid, projectID, ids, body.Op, parentID, body.Value)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]int{"affected": count})
}

// ---------------------------------------------------------------- 看板 / 事件 / 导出

func (h *KnowledgeHandler) Summary(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	summary, err := h.svc.SpaceSummary(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, summary)
}

func (h *KnowledgeHandler) Events(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	limit, _, _, _ := service.NormalizeListPage(string(c.Query("limit")), "")
	rows, err := h.svc.ListEvents(uid, projectID, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) ExportTree(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	md, err := h.svc.ExportTreeMarkdown(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]string{
		"filename": "knowledge-tree.md",
		"format":   "markdown",
		"content":  md,
	})
}

// ---------------------------------------------------------------- 文档属性

type docPropsBody struct {
	Status         *string  `json:"status"`
	ReviewerUserID *string  `json:"reviewerUserId"`
	DueAt          *string  `json:"dueAt"`
	ClearDueAt     bool     `json:"clearDueAt"`
	Tags           *string  `json:"tags"`
	Summary        *string  `json:"summary"`
	CoverColor     *string  `json:"coverColor"`
	CoverURL       *string  `json:"coverUrl"`
	Members        *string  `json:"members"`
	Priority       *string  `json:"priority"`
	Milestone      *string  `json:"milestone"`
	Sprint         *string  `json:"sprint"`
	Number         *float64 `json:"number"`
}

func (h *KnowledgeHandler) GetDocProps(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	props, err := h.svc.GetDocProps(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, props)
}

func (h *KnowledgeHandler) UpdateDocProps(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body docPropsBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	in := service.DocPropsInput{
		Status:     body.Status,
		Tags:       body.Tags,
		Summary:    body.Summary,
		CoverColor: body.CoverColor,
		CoverURL:   body.CoverURL,
		ClearDueAt: body.ClearDueAt,
		Members:    body.Members,
		Priority:   body.Priority,
		Milestone:  body.Milestone,
		Sprint:     body.Sprint,
		Number:     body.Number,
	}
	if body.ReviewerUserID != nil && *body.ReviewerUserID != "" {
		reviewer, err := uuid.Parse(*body.ReviewerUserID)
		if err != nil {
			BadRequest(c, "invalid reviewerUserId")
			return
		}
		in.ReviewerUserID = &reviewer
	}
	if body.DueAt != nil && *body.DueAt != "" {
		due, err := time.Parse(time.RFC3339, *body.DueAt)
		if err != nil {
			BadRequest(c, "invalid dueAt")
			return
		}
		in.DueAt = &due
	}
	props, err := h.svc.UpsertDocProps(uid, docID, in)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, props)
}

// ---------------------------------------------------------------- 评论

type commentBody struct {
	ParentID *string `json:"parentId"`
	Quote    string  `json:"quote"`
	Content  string  `json:"content"`
	Resolved *bool   `json:"resolved"`
	// AnchorFrom / AnchorTo 是划线区间的字符偏移（-1 表示整篇评论）。
	AnchorFrom int `json:"anchorFrom"`
	AnchorTo   int `json:"anchorTo"`
	// Mentions 是被 @ 的用户 ID。
	Mentions []string `json:"mentions"`
	// BlockID / BlockOffset 是块级双锚点；可不传，服务端按 quote / 偏移回填。
	BlockID     *string `json:"blockId"`
	BlockOffset *int    `json:"blockOffset"`
	// YRel 是可选的 Yjs 相对位置。
	YRel string `json:"yRel"`
}

func (h *KnowledgeHandler) ListComments(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	// 可选筛选：resolved=true|false 只看已解决/未解决，unread=1 只看未读。
	resolvedFilter := c.Query("resolved")
	var resolved *bool
	switch resolvedFilter {
	case "true":
		v := true
		resolved = &v
	case "false":
		v := false
		resolved = &v
	}
	unreadOnly := c.Query("unread") == "1" || c.Query("unread") == "true"
	rows, err := h.svc.ListCommentsFiltered(uid, docID, resolved, unreadOnly)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) AddComment(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body commentBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	var blockID *uuid.UUID
	if body.BlockID != nil && strings.TrimSpace(*body.BlockID) != "" {
		id, err := uuid.Parse(strings.TrimSpace(*body.BlockID))
		if err != nil {
			BadRequest(c, "invalid blockId")
			return
		}
		blockID = &id
	}
	blockOffset := -1
	if body.BlockOffset != nil {
		blockOffset = *body.BlockOffset
	}
	comment, err := h.svc.AddCommentDetailed(uid, docID, parentID, body.Quote, body.Content,
		body.AnchorFrom, body.AnchorTo, body.Mentions, blockID, blockOffset, body.YRel)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, comment)
}

func (h *KnowledgeHandler) UpdateComment(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	commentID, ok := parseID(c, "commentId")
	if !ok {
		return
	}
	var body commentBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	var content *string
	if body.Content != "" {
		content = &body.Content
	}
	comment, err := h.svc.UpdateComment(uid, commentID, content, body.Resolved)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, comment)
}

func (h *KnowledgeHandler) DeleteComment(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	commentID, ok := parseID(c, "commentId")
	if !ok {
		return
	}
	if err := h.svc.DeleteComment(uid, commentID); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

// ---------------------------------------------------------------- 最近浏览

func (h *KnowledgeHandler) RecentViews(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	limit, _, _, _ := service.NormalizeListPage(string(c.Query("limit")), "")
	rows, err := h.svc.ListRecentViews(uid, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) TouchView(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.TouchView(uid, docID); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------- 文档导出

func (h *KnowledgeHandler) ExportDoc(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	format := string(c.Query("format"))
	if format == "" {
		format = "markdown"
	}
	file, err := h.svc.ExportDocumentFormat(uid, docID, format)
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "export", uid.String(), "knowledge-doc="+docID.String()+" format="+format)
	c.JSON(http.StatusOK, map[string]string{
		"filename": file.Filename,
		"format":   file.Format,
		"content":  file.Content,
	})
}
