package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
)

// 知识库 3.0 的接口：多维表格/思维导图节点数据、分享链接、历史版本对比、
// 知识图谱、作者维度检索、在线协作状态、导入（Word/Excel/Markdown/飞书）与智能检索。

// ---------------------------------------------------------------- 节点数据

func (h *KnowledgeHandler) GetNodeData(ctx context.Context, c *app.RequestContext) {
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
	row, err := h.svc.GetNodeData(uid, projectID, nodeID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, row)
}

type nodeDataBody struct {
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data"`
}

func (h *KnowledgeHandler) SaveNodeData(ctx context.Context, c *app.RequestContext) {
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
	var body nodeDataBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	row, err := h.svc.SaveNodeData(uid, projectID, nodeID, body.Kind, body.Data)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, row)
}

// ---------------------------------------------------------------- 分享链接

type shareBody struct {
	Role      string  `json:"role"`
	ExpiresAt *string `json:"expiresAt"`
	// Password 是访问口令（明文，服务端只存摘要）。
	Password string `json:"password"`
	// AllowCopy=false 时分享页禁止复制与导出。
	AllowCopy *bool `json:"allowCopy"`
}

func (h *KnowledgeHandler) ListShares(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	rows, err := h.svc.ListShares(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) CreateShare(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body shareBody
	_ = c.BindAndValidate(&body)
	var expiresAt *time.Time
	if body.ExpiresAt != nil && *body.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *body.ExpiresAt)
		if err != nil {
			BadRequest(c, "invalid expiresAt")
			return
		}
		expiresAt = &t
	}
	allowCopy := true
	if body.AllowCopy != nil {
		allowCopy = *body.AllowCopy
	}
	share, err := h.svc.CreateShareWith(uid, docID, service.CreateShareInput{
		Role:      body.Role,
		ExpiresAt: expiresAt,
		Password:  body.Password,
		AllowCopy: allowCopy,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, share)
}

func (h *KnowledgeHandler) RevokeShare(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	shareID, ok := parseID(c, "shareId")
	if !ok {
		return
	}
	if err := h.svc.RevokeShare(uid, shareID); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"revoked": true})
}

// SharedDoc 是公开分享页的数据（无需登录态）。
func (h *KnowledgeHandler) SharedDoc(ctx context.Context, c *app.RequestContext) {
	token := string(c.Param("token"))
	// 带口令时直接校验口令；没带口令时只返回「需要口令」标记，不泄露正文。
	password := string(c.Query("password"))
	doc, err := h.svc.ResolveShareWithPassword(token, password)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, doc)
}

// ImportFeishuDocBody 是单篇飞书文档导入的入参。
type ImportFeishuDocBody struct {
	DocToken string  `json:"docToken"`
	ParentID *string `json:"parentId"`
}

// ImportFeishuDoc 导入单篇飞书文档（粘贴链接即可）。
func (h *KnowledgeHandler) ImportFeishuDoc(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body ImportFeishuDocBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.ImportFeishuDoc(ctx, uid, projectID, body.DocToken, parentID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, node)
}

// ---------------------------------------------------------------- 历史版本

func (h *KnowledgeHandler) ListVersions(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	limit, _, _, _ := service.NormalizeListPage(string(c.Query("limit")), "")
	rows, err := h.svc.ListDocVersions(uid, docID, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) VersionDiff(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	fromID, ok := parseID(c, "from")
	if !ok {
		return
	}
	toID, ok := parseID(c, "to")
	if !ok {
		return
	}
	diff, err := h.svc.VersionDiff(uid, docID, fromID, toID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]string{"diff": diff})
}

// ---------------------------------------------------------------- 图谱 / 检索

func (h *KnowledgeHandler) Graph(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	graph, err := h.svc.BuildGraph(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, graph)
}

func (h *KnowledgeHandler) SearchSpace(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	limit, _, _, _ := service.NormalizeListPage(string(c.Query("limit")), "")
	filter := service.KnowledgeSearchFilter{
		Query:    string(c.Query("q")),
		AuthorID: string(c.Query("authorId")),
		NodeType: string(c.Query("nodeType")),
		Limit:    limit,
	}
	if raw := string(c.Query("from")); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			filter.From = &t
		}
	}
	if raw := string(c.Query("to")); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			filter.To = &t
		}
	}
	hits, err := h.svc.SearchSpace(uid, projectID, filter)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, hits)
}

type askBody struct {
	Question string `json:"question"`
}

func (h *KnowledgeHandler) Ask(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body askBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	answers, err := h.svc.AskSpace(uid, projectID, body.Question, 5)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, answers)
}

// ---------------------------------------------------------------- 在线协作状态

type presenceBody struct {
	Editing bool `json:"editing"`
}

func (h *KnowledgeHandler) PresenceHeartbeat(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body presenceBody
	_ = c.BindAndValidate(&body)
	if err := h.svc.PresenceHeartbeat(uid, docID, body.Editing); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func (h *KnowledgeHandler) PresenceList(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	rows, err := h.svc.PresenceList(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

// ---------------------------------------------------------------- 摘要 / 标签

func (h *KnowledgeHandler) DocSummary(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	summary, err := h.svc.SummarizeDoc(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]string{"summary": summary})
}

func (h *KnowledgeHandler) DocTags(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	tags, err := h.svc.SuggestTags(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, tags)
}

// ---------------------------------------------------------------- 导入

func (h *KnowledgeHandler) ImportFile(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		BadRequest(c, "file is required")
		return
	}
	rc, err := fh.Open()
	if err != nil {
		BadRequest(c, "cannot read file")
		return
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, 21<<20))
	if err != nil {
		BadRequest(c, "cannot read file")
		return
	}
	rawParent := c.Query("parentId")
	parentID, err := parseOptionalUUIDField(&rawParent)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.ImportFile(uid, projectID, parentID, fh.Filename, data)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, node)
}

type feishuImportBody struct {
	SpaceToken string  `json:"spaceToken"`
	ParentID   *string `json:"parentId"`
}

func (h *KnowledgeHandler) ImportFeishuSpace(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body feishuImportBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	count, err := h.svc.ImportFeishuSpace(ctx, uid, projectID, body.SpaceToken, parentID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]int{"imported": count})
}

type feishuNotifyBody struct {
	Text string `json:"text"`
}

func (h *KnowledgeHandler) NotifyFeishu(ctx context.Context, c *app.RequestContext) {
	if _, ok := h.owner(c); !ok {
		return
	}
	var body feishuNotifyBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	if err := h.svc.NotifyFeishu(ctx, body.Text); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}
