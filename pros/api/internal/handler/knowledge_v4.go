package handler

import (
	"context"
	"net/http"
	"strconv"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// 知识库 4.0 的接口：归档区与统计、模板作用域与另存、分享口令与角色、
// 版本标注、跨类型与全局检索、空间打包导出、敏感扫描与质量体检。

// ---------------------------------------------------------------- 目录

func (h *KnowledgeHandler) Archived(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	rows, err := h.svc.ListArchived(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) NodeStats(ctx context.Context, c *app.RequestContext) {
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
	stats, err := h.svc.NodeStatsOf(uid, projectID, nodeID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *KnowledgeHandler) RelatedDocs(ctx context.Context, c *app.RequestContext) {
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
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	rows, err := h.svc.RelatedDocsOf(uid, projectID, nodeID, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *KnowledgeHandler) FillSummaries(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	filled, err := h.svc.AutoFillSummaries(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]int{"filled": filled})
}

// ---------------------------------------------------------------- 模板

type templateUpdateBody struct {
	Label     *string `json:"label"`
	HTML      *string `json:"html"`
	SortOrder *int    `json:"sortOrder"`
	Scope     *string `json:"scope"`
}

func (h *KnowledgeHandler) UpdateTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	tplID, ok := parseID(c, "templateId")
	if !ok {
		return
	}
	var body templateUpdateBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	tpl, err := h.svc.UpdateTemplate(uid, tplID, body.Label, body.HTML, body.SortOrder, body.Scope)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, tpl)
}

type saveAsTemplateBody struct {
	Label string `json:"label"`
}

func (h *KnowledgeHandler) SaveDocAsTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body saveAsTemplateBody
	_ = c.BindAndValidate(&body)
	tpl, err := h.svc.SaveDocAsTemplate(uid, docID, body.Label)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, tpl)
}

// ---------------------------------------------------------------- 检索

func (h *KnowledgeHandler) GlobalSearch(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	filter := service.KnowledgeSearchFilter{
		Query:    string(c.Query("q")),
		NodeType: string(c.Query("type")),
		AuthorID: string(c.Query("author")),
		Sort:     string(c.Query("sort")),
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	filter.Limit = limit
	var projectID *uuid.UUID
	if raw := string(c.Query("projectId")); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid projectId")
			return
		}
		projectID = &id
	}
	hits, err := h.svc.SearchGlobal(uid, projectID, filter)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, hits)
}

type askFollowBody struct {
	Question string   `json:"question"`
	Context  []string `json:"context"`
	Limit    int      `json:"limit"`
}

// AskFollowUp 多轮追问：带上历史问题一起检索。
func (h *KnowledgeHandler) AskFollowUp(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body askFollowBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	answers, err := h.svc.AskSpaceWithContext(uid, &projectID, body.Question, body.Context, body.Limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, answers)
}

// AskGlobal 跨项目问答（语料不再局限于当前项目）。
func (h *KnowledgeHandler) AskGlobal(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body askFollowBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	answers, err := h.svc.AskGlobal(uid, body.Question, body.Limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, answers)
}

// ---------------------------------------------------------------- 导出 / 体检

func (h *KnowledgeHandler) ExportZip(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	data, name, err := h.svc.ExportSpaceZip(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.Response.Header.Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	c.Data(http.StatusOK, "application/zip", data)
}

func (h *KnowledgeHandler) SimilarDocs(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	groups, err := h.svc.SimilarDocs(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (h *KnowledgeHandler) QualityAudit(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(string(c.Query("limit")))
	items, err := h.svc.QualityAudit(uid, projectID, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, items)
}

type scanBody struct {
	Text string `json:"text"`
}

// ScanSensitive 扫描正文里的敏感信息（导入 / 发布前提示）。
func (h *KnowledgeHandler) ScanSensitive(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	_ = uid
	var body scanBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	c.JSON(http.StatusOK, service.ScanSensitive(body.Text))
}

// ---------------------------------------------------------------- 版本标注

func (h *KnowledgeHandler) LabelVersion(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	versionID, ok := parseID(c, "versionId")
	if !ok {
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	row, err := h.svc.LabelVersion(uid, docID, versionID, body.Label)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *KnowledgeHandler) VersionAuthors(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	if _, err := h.svc.GetOwnedDocument(uid, docID); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	names, err := h.svc.VersionAuthorNames(docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, names)
}

// ---------------------------------------------------------------- 分享（公开）

func (h *KnowledgeHandler) SharedDocWithPassword(ctx context.Context, c *app.RequestContext) {
	token := string(c.Param("token"))
	password := string(c.Query("password"))
	viewer, _ := h.optionalOwner(c)
	doc, err := h.svc.ResolveShareWithPassword(token, password, viewer)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, doc)
}

type shareCommentBody struct {
	Password string `json:"password"`
	Content  string `json:"content"`
}

func (h *KnowledgeHandler) AddShareComment(ctx context.Context, c *app.RequestContext) {
	token := string(c.Param("token"))
	var body shareCommentBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	viewer, _ := h.optionalOwner(c)
	comment, err := h.svc.AddShareComment(token, body.Password, body.Content, viewer)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, comment)
}

type shareContentBody struct {
	Password string `json:"password"`
	HTML     string `json:"html"`
}

func (h *KnowledgeHandler) UpdateShareContent(ctx context.Context, c *app.RequestContext) {
	token := string(c.Param("token"))
	var body shareContentBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	viewer, _ := h.optionalOwner(c)
	if err := h.svc.UpdateShareContent(token, body.Password, body.HTML, viewer); err != nil {
		handleKnowledgeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------- 回收站清理

type purgeBody struct {
	KeepDays int `json:"keepDays"`
}

// PurgeTrash 清理超期回收站节点。
func (h *KnowledgeHandler) PurgeTrash(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body purgeBody
	_ = c.BindAndValidate(&body)
	days := body.KeepDays
	if days <= 0 {
		days = 30
	}
	purged, err := h.svc.PurgeExpiredTrash(uid, days)
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "purge-trash", uid.String(), "keepDays="+strconv.Itoa(days))
	c.JSON(http.StatusOK, map[string]int{"purged": purged})
}
