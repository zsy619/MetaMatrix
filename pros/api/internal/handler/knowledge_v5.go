package handler

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strconv"

	"metamatrix/api/internal/middleware"
	"metamatrix/api/internal/service"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"
)

// 知识库 5.0 的接口：模板属性与模板建文档、属性批量与看板、评论增强、
// 任务块、大纲与目录、节点权限、分享白名单、标签词库、导入预览与批量导入、docx 导出。

// ---------------------------------------------------------------- 模板

type createFromTemplateBody struct {
	ParentID *string `json:"parentId"`
	Title    string  `json:"title"`
}

// CreateDocFromTemplate 用模板创建文档节点。
func (h *KnowledgeHandler) CreateDocFromTemplate(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	templateID, ok := parseID(c, "templateId")
	if !ok {
		return
	}
	var body createFromTemplateBody
	_ = c.BindAndValidate(&body)
	parentID, err := parseOptionalUUIDField(body.ParentID)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	node, err := h.svc.CreateDocFromTemplate(uid, projectID, parentID, templateID, body.Title)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, node)
}

type templatePropsBody struct {
	Fields []service.FieldDef `json:"fields"`
}

// UpdateTemplateProperties 改模板携带的属性定义。
func (h *KnowledgeHandler) UpdateTemplateProperties(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	templateID, ok := parseID(c, "templateId")
	if !ok {
		return
	}
	var body templatePropsBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	tpl, err := h.svc.UpdateTemplateProperties(uid, templateID, body.Fields)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, tpl)
}

// ---------------------------------------------------------------- 属性

type docFieldsBody struct {
	Fields      []service.FieldDef `json:"fields"`
	FieldValues map[string]any     `json:"fieldValues"`
}

// UpdateDocFields 改文档的自定义字段定义与取值。
func (h *KnowledgeHandler) UpdateDocFields(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body docFieldsBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	props, err := h.svc.SetDocFields(uid, docID, body.Fields, body.FieldValues)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, props)
}

type batchPropsBody struct {
	DocIDs []string `json:"docIds"`
	service.DocPropsInput
}

// BatchDocProps 批量改多篇文档的属性。
func (h *KnowledgeHandler) BatchDocProps(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	var body batchPropsBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	ids := make([]uuid.UUID, 0, len(body.DocIDs))
	for _, raw := range body.DocIDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			BadRequest(c, "invalid docIds")
			return
		}
		ids = append(ids, id)
	}
	updated, err := h.svc.BatchUpdateDocProps(uid, ids, body.DocPropsInput)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]int{"updated": updated})
}

// DocPropsBoard 返回属性看板数据。
func (h *KnowledgeHandler) DocPropsBoard(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	items, err := h.svc.DocPropsBoard(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, items)
}

// ---------------------------------------------------------------- 评论增强

type reactionBody struct {
	Emoji string `json:"emoji"`
}

// ToggleCommentReaction 给评论加/取消表情回应。
func (h *KnowledgeHandler) ToggleCommentReaction(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	commentID, ok := parseID(c, "commentId")
	if !ok {
		return
	}
	var body reactionBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	comment, err := h.svc.ToggleReaction(uid, commentID, body.Emoji)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, comment)
}

// MarkCommentsRead 标记评论已读。
func (h *KnowledgeHandler) MarkCommentsRead(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.svc.MarkCommentsRead(uid, docID); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// VersionComments 返回某个历史版本当时的评论。
func (h *KnowledgeHandler) VersionComments(ctx context.Context, c *app.RequestContext) {
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
	rows, err := h.svc.VersionComments(uid, docID, versionID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

// ---------------------------------------------------------------- 任务块与大纲

// DocTasks 列出正文里的待办块。
func (h *KnowledgeHandler) DocTasks(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	tasks, err := h.svc.ListDocTasks(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, tasks)
}

type taskToggleBody struct {
	Checked bool `json:"checked"`
}

// ToggleDocTask 勾选/取消勾选一个待办块。
func (h *KnowledgeHandler) ToggleDocTask(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	index, err := strconv.Atoi(string(c.Param("index")))
	if err != nil {
		BadRequest(c, "invalid index")
		return
	}
	var body taskToggleBody
	_ = c.BindAndValidate(&body)
	if err := h.svc.SetDocTask(uid, docID, index, body.Checked); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// DocOutline 返回正文标题层级（大纲面板与目录块共用）。
func (h *KnowledgeHandler) DocOutline(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	items, err := h.svc.DocOutline(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, items)
}

type outlineReorderBody struct {
	Order []int `json:"order"`
}

// ReorderOutline 按大纲顺序重排正文各节。
func (h *KnowledgeHandler) ReorderOutline(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body outlineReorderBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	if err := h.svc.ReorderOutline(uid, docID, body.Order); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------- 权限

type nodeAccessBody struct {
	Visibility   string `json:"visibility"`
	AllowedUsers string `json:"allowedUsers"`
}

// SetNodeAccess 设置节点可见范围与可见成员。
func (h *KnowledgeHandler) SetNodeAccess(ctx context.Context, c *app.RequestContext) {
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
	var body nodeAccessBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	node, err := h.svc.SetNodeAccess(uid, projectID, nodeID, service.NodeAccessInput{
		Visibility:   body.Visibility,
		AllowedUsers: body.AllowedUsers,
	})
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, node)
}

type allowListBody struct {
	AllowUsers string `json:"allowUsers"`
}

// SetShareAllowList 设置分享白名单。
func (h *KnowledgeHandler) SetShareAllowList(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	shareID, ok := parseID(c, "shareId")
	if !ok {
		return
	}
	var body allowListBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	share, err := h.svc.SetShareAllowList(uid, shareID, body.AllowUsers)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, share)
}

// ---------------------------------------------------------------- 标签词库

// ListTagDict 列出业务词库。
func (h *KnowledgeHandler) ListTagDict(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	rows, err := h.svc.ListTagDict(uid, projectID)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, rows)
}

type tagDictBody struct {
	Tag      string `json:"tag"`
	Category string `json:"category"`
	Aliases  string `json:"aliases"`
}

// AddTagDict 新增业务词条。
func (h *KnowledgeHandler) AddTagDict(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	var body tagDictBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	row, err := h.svc.AddTagDict(uid, projectID, body.Tag, body.Category, body.Aliases)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusCreated, row)
}

// DeleteTagDict 删除业务词条。
func (h *KnowledgeHandler) DeleteTagDict(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	dictID, ok := parseID(c, "dictId")
	if !ok {
		return
	}
	if err := h.svc.DeleteTagDict(uid, projectID, dictID); handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------- 导入

type importPreviewBody struct {
	Filename string `json:"filename"`
	// Content 是 base64 编码的文件内容。
	Content string `json:"content"`
}

// PreviewImport 预览导入文件：给出标题、章节与表格列。
func (h *KnowledgeHandler) PreviewImport(ctx context.Context, c *app.RequestContext) {
	if _, ok := h.owner(c); !ok {
		return
	}
	var body importPreviewBody
	if err := c.BindAndValidate(&body); err != nil {
		BadRequest(c, "invalid body")
		return
	}
	data, err := base64.StdEncoding.DecodeString(body.Content)
	if err != nil {
		BadRequest(c, "invalid content")
		return
	}
	preview, err := h.svc.PreviewImport(body.Filename, data)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, preview)
}

// ImportFiles 批量导入：一次上传多个文件，逐个返回结果。
func (h *KnowledgeHandler) ImportFiles(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	projectID, ok := parseID(c, "projectId")
	if !ok {
		return
	}
	form, err := c.MultipartForm()
	if err != nil {
		BadRequest(c, "multipart form is required")
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		files = form.File["file"]
	}
	if len(files) == 0 {
		BadRequest(c, "files are required")
		return
	}
	rawParent := c.Query("parentId")
	parentID, err := parseOptionalUUIDField(&rawParent)
	if err != nil {
		BadRequest(c, "invalid parentId")
		return
	}
	inputs := make([]service.ImportFileInput, 0, len(files))
	for _, fh := range files {
		rc, err := fh.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(rc, 21<<20))
		rc.Close()
		if err != nil {
			continue
		}
		inputs = append(inputs, service.ImportFileInput{Filename: fh.Filename, Data: data})
	}
	results, err := h.svc.ImportFiles(uid, projectID, parentID, inputs)
	if handleKnowledgeErr(c, err) {
		return
	}
	c.JSON(http.StatusOK, map[string]any{"results": results})
}

// ExportDocx 导出一篇文档为 .docx。
func (h *KnowledgeHandler) ExportDocx(ctx context.Context, c *app.RequestContext) {
	uid, ok := h.owner(c)
	if !ok {
		return
	}
	docID, ok := parseID(c, "id")
	if !ok {
		return
	}
	data, filename, err := h.svc.ExportDocumentDocx(uid, docID)
	if handleKnowledgeErr(c, err) {
		return
	}
	middleware.Audit(c, "export-docx", uid.String(), filename)
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data)
}
