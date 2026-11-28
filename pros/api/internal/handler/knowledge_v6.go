package handler

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strconv"

	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// 知识库 6.0 的接口：空间成员角色、团队模板发布、结构块统计、
// 写作补全、录音与字幕转文档、会议纪要、向量召回、协同编辑增量。

// ---------------------------------------------------------------- 空间成员

// ListMembers 列出知识空间成员。
func (h *KnowledgeHandler) ListMembers(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	members, err := h.svc.ListMembers(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, members)
}

type memberBody struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
}

// SetMemberRole 新增或调整空间成员角色。
func (h *KnowledgeHandler) SetMemberRole(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body memberBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	targetID, err := uuid.Parse(body.UserID)
	if err != nil {
		BadRequest(c, "invalid userId")
		return
	}
	member, err := h.svc.SetMemberRole(uid, projectID, targetID, body.Role)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, member)
}

// RemoveMember 移除空间成员。
func (h *KnowledgeHandler) RemoveMember(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	targetID, ok := parseID(c, "userId")
	if !ok {
		return
	}
	if err := h.svc.RemoveMember(uid, projectID, targetID); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

// ---------------------------------------------------------------- 团队模板发布

type publishBody struct {
	Published bool `json:"published"`
}

// PublishTemplate 发布或下架团队共享模板。
func (h *KnowledgeHandler) PublishTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	templateID, ok := parseID(c, "templateId")
	if !ok {
		return
	}
	var body publishBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	tpl, err := h.svc.PublishTemplate(uid, templateID, body.Published)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, tpl)
}

// ---------------------------------------------------------------- 结构块统计

// DocStructure 统计文档里的表格/白板/流程图等结构块。
func (h *KnowledgeHandler) DocStructure(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	stats, err := h.svc.DocStructureStats(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, stats)
}

// ---------------------------------------------------------------- 智能化

type suggestBody struct {
	Paragraph string `json:"paragraph"`
}

// SuggestWriting 给一段写作续写建议。
func (h *KnowledgeHandler) SuggestWriting(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body suggestBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	suggestion, err := h.svc.SuggestWriting(ctx, uid, docID, body.Paragraph)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, suggestion)
}

// SemanticSearch 在空间内做向量召回。
func (h *KnowledgeHandler) SemanticSearch(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	query := c.Query("q")
	limit, _ := strconv.Atoi(c.Query("limit"))
	hits, err := h.svc.SemanticSearch(ctx, uid, projectID, query, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, hits)
}

type indexBody struct {
	DocumentID string `json:"documentId"`
}

// IndexDocument 重建一篇文档的向量索引。
func (h *KnowledgeHandler) IndexDocument(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body indexBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	docID, err := uuid.Parse(body.DocumentID)
	if err != nil {
		BadRequest(c, "invalid documentId")
		return
	}
	count, err := h.svc.IndexDocChunks(ctx, uid, projectID, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"chunks": count})
}

type minutesBody struct {
	service.MeetingInput
	// CreateDoc 为 true 时直接把纪要写成一篇文档。
	CreateDoc bool   `json:"createDoc"`
	ParentID  string `json:"parentId"`
}

// BuildMeetingMinutes 由会议记录生成纪要，可选直接落成文档。
func (h *KnowledgeHandler) BuildMeetingMinutes(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body minutesBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	minutes, err := h.svc.BuildMeetingMinutes(ctx, body.MeetingInput)
	if handleKnowledgeErr(c, err) {
		return
	}
	if body.CreateDoc {
		parentID, err := parseOptionalUUIDField(&body.ParentID)
		if err != nil {
			BadRequest(c, "invalid parentId")
			return
		}
		text := renderMinutesHTML(minutes)
		node, err := h.svc.CreateDocFromTranscript(uid, projectID, parentID, minutes.Title, text)
		if handleKnowledgeErr(c, err) {
			return
		}
		c.JSON(http.StatusCreated, map[string]any{"minutes": minutes, "node": node})
		return
	}
	c.JSON(http.StatusOK, minutes)
}

// renderMinutesHTML 把纪要渲染成可写入文档的正文。
func renderMinutesHTML(m *service.MeetingMinutes) string {
	var b []byte
	b = append(b, ("# " + m.Title + "\n")...)
	if m.Time != "" {
		b = append(b, ("时间：" + m.Time + "\n")...)
	}
	if len(m.Attendees) > 0 {
		b = append(b, ("参与人：" + joinText(m.Attendees, "、") + "\n")...)
	}
	if len(m.Topics) > 0 {
		b = append(b, "\n## 议题\n"...)
		for _, t := range m.Topics {
			b = append(b, ("- " + t + "\n")...)
		}
	}
	if len(m.Decisions) > 0 {
		b = append(b, "\n## 结论\n"...)
		for _, d := range m.Decisions {
			b = append(b, ("- " + d + "\n")...)
		}
	}
	if len(m.Actions) > 0 {
		b = append(b, "\n## 待办\n"...)
		for _, a := range m.Actions {
			line := "- " + a.Text
			if a.Owner != "" {
				line += "（负责人：" + a.Owner + "）"
			}
			if a.Due != "" {
				line += "（截止：" + a.Due + "）"
			}
			b = append(b, (line + "\n")...)
		}
	}
	if m.Summary != "" {
		b = append(b, ("\n## 摘要\n" + m.Summary + "\n")...)
	}
	return string(b)
}

func joinText(items []string, sep string) string {
	out := ""
	for i, s := range items {
		if i > 0 {
			out += sep
		}
		out += s
	}
	return out
}

// TranscribeAudio 录音转文字。
func (h *KnowledgeHandler) TranscribeAudio(ctx context.Context, c *app.RequestContext) {
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
	data, err := io.ReadAll(io.LimitReader(rc, 32<<20))
	if err != nil {
		BadRequest(c, "cannot read file")
		return
	}
	text, err := h.svc.TranscribeAudio(ctx, uid, projectID, fh.Filename, data)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"text": text})
}

type transcriptBody struct {
	Title      string `json:"title"`
	Transcript string `json:"transcript"`
	ParentID   string `json:"parentId"`
}

// CreateDocFromTranscript 用字幕/转写文本创建文档。
func (h *KnowledgeHandler) CreateDocFromTranscript(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body transcriptBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	parentID, err := parseOptionalUUIDField(&body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.CreateDocFromTranscript(uid, projectID, parentID, body.Title, body.Transcript)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, node)
}

// ---------------------------------------------------------------- 协同编辑增量

type crdtBody struct {
	Kind    string `json:"kind"`
	Payload string `json:"payload"`
}

// AppendCRDT 追加一条协同编辑增量。
func (h *KnowledgeHandler) AppendCRDT(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body crdtBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	payload, err := base64.StdEncoding.DecodeString(body.Payload)
	if err != nil {
		BadRequest(c, "invalid payload")
		return
	}
	seq, err := h.svc.AppendCRDT(docID, uid, body.Kind, payload)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"seq": seq})
}

// CRDTUpdates 拉取协同编辑增量。
func (h *KnowledgeHandler) CRDTUpdates(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	after, _ := strconv.ParseInt(c.Query("after"), 10, 64)
	limit, _ := strconv.Atoi(c.Query("limit"))
	updates, err := h.svc.CRDTDocuments(uid, docID, after, limit)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"updates": updates})
}
